import Vue from 'vue';
import cx from 'classnames';
import { Component, Prop } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import { CustomizationService } from 'services/customization';
import { NavigationService, TAppPage } from 'services/navigation';
import { UserService } from 'services/user';
import AppsNav from 'components/AppsNav';
import { WindowsService } from 'services/windows';
import { PlatformAppsService } from 'services/platform-apps';
import { IncrementalRolloutService, EAvailableFeatures } from 'services/incremental-rollout';
import { AppService } from '../services/app';
import { $t } from 'services/i18n';
import { NavTools } from 'components/shared/ReactComponent';
import styles from './SideNav.m.less';
import { LayoutService } from 'services/layout';
import { getPlatformService } from '../services/platforms';
import { getOS, OS } from 'util/operating-systems';
import Utils from 'services/utils';

interface IPageData {
  target: TAppPage;
  icon?: string;
  svgIcon?: JSX.Element;
  title: string;
  trackingTarget: string;
  newBadge?: boolean;
}

@Component({})
export default class SideNav extends Vue {
  @Inject() appService: AppService;
  @Inject() customizationService: CustomizationService;
  @Inject() navigationService: NavigationService;
  @Inject() layoutService: LayoutService;
  @Inject() userService: UserService;
  @Inject() windowsService: WindowsService;
  @Inject() platformAppsService: PlatformAppsService;
  @Inject() incrementalRolloutService: IncrementalRolloutService;

  showTabDropdown = false;

  get availableFeatures() {
    return EAvailableFeatures;
  }

  @Prop() locked: boolean;

  navigate(page: TAppPage) {
    if (!this.userService.isLoggedIn && page !== 'Studio') return;

    this.navigationService.actions.navigate(page);
  }

  navigateToStudioTab(tabId: string) {
    this.navigate('Studio');
    this.layoutService.setCurrentTab(tabId);
  }

  featureIsEnabled(feature: EAvailableFeatures) {
    return this.incrementalRolloutService.views.featureIsEnabled(feature);
  }

  get page() {
    return this.navigationService.state.currentPage;
  }

  get leftDock() {
    return this.customizationService.state.leftDock;
  }

  get appStoreVisible() {
    return this.userService.isLoggedIn && this.platformAppsService.state.storeVisible;
  }

  get studioTabs() {
    return Object.keys(this.layoutService.state.tabs).map((tab, i) => ({
      target: tab,
      title:
        i === 0 || !this.layoutService.state.tabs[tab].name
          ? $t('Editor')
          : this.layoutService.state.tabs[tab].name,
      icon: this.layoutService.state.tabs[tab].icon,
      trackingTarget: tab === 'default' ? 'editor' : 'custom',
    }));
  }

  get loading() {
    return this.appService.state.loading;
  }

  get pageData() {
    const pageData: IPageData[] = [];
    const hasThemes =
      this.userService.isLoggedIn &&
      getPlatformService(this.userService.platform.type).hasCapability('themes');

    if (this.userService.isLoggedIn) {
      pageData.push({
        target: 'AlertboxLibrary',
        icon: 'icon-alert-box',
        title: $t('Alertbox Library'),
        trackingTarget: 'alertbox-library',
      });
    }

    if (hasThemes) {
      pageData.push({
        target: 'BrowseOverlays',
        icon: 'icon-themes',
        title: $t('Themes'),
        trackingTarget: 'themes',
      });
    }

    if (this.appStoreVisible) {
      pageData.push({
        target: 'PlatformAppStore',
        icon: 'icon-store',
        title: $t('App Store'),
        trackingTarget: 'app-store',
      });
    }

    if (this.userService.isLoggedIn && this.featureIsEnabled(EAvailableFeatures.growTab)) {
      pageData.push({
        target: 'Grow',
        icon: 'icon-graph',
        title: $t('Grow'),
        trackingTarget: 'grow-tab',
      });
    }

    if (
      getOS() === OS.Windows &&
      this.userService.isLoggedIn &&
      this.incrementalRolloutService.views.featureIsEnabled(EAvailableFeatures.highlighter)
    ) {
      pageData.push({
        target: 'Highlighter',
        svgIcon: <HighlighterIcon />,
        title: 'Highlighter',
        trackingTarget: 'highlighter',
        newBadge: true,
      });
    }

    return pageData;
  }

  get primaryStudioTab() {
    return (
      <div
        onMouseenter={() => (this.showTabDropdown = true)}
        onMouseleave={() => (this.showTabDropdown = false)}
      >
        <div
          class={cx(styles.primaryTab, {
            [styles.active]:
              this.page === 'Studio' && this.layoutService.state.currentTab === 'default',
          })}
        >
          {this.studioTab(this.studioTabs[0])}
          {this.studioTabs.length > 1 && (
            <i
              class={cx('icon-down', styles.studioDropdown, {
                [styles.studioDropdownActive]: this.layoutService.state.currentTab !== 'default',
              })}
            />
          )}
        </div>
        {this.additionalStudioTabs}
      </div>
    );
  }

  get additionalStudioTabs() {
    return (
      <transition name="sidenav-slide">
        {this.showTabDropdown && (
          <div class={styles.studioTabs}>
            {this.studioTabs.slice(1).map(page => this.studioTab(page))}
          </div>
        )}
      </transition>
    );
  }

  studioTab(page: { target: string; title: string; icon: string; trackingTarget: string }) {
    return (
      <div
        class={cx(styles.mainCell, {
          [styles.active]:
            this.page === 'Studio' && this.layoutService.state.currentTab === page.target,
        })}
        onClick={() => this.navigateToStudioTab(page.target)}
        vTrackClick={{ component: 'SideNav', target: page.trackingTarget }}
        title={page.title}
      >
        <i class={page.icon} />
      </div>
    );
  }

  render() {
    return (
      <div class={cx('side-nav', styles.container, { [styles.leftDock]: this.leftDock })}>
        {this.primaryStudioTab}
        {this.pageData.map(page => (
          <div
            class={cx(styles.mainCell, {
              [styles.active]: this.page === page.target,
              [styles.disabled]: !this.userService.isLoggedIn && page.target !== 'Studio',
            })}
            onClick={() => this.navigate(page.target as TAppPage)}
            vTrackClick={{ component: 'SideNav', target: page.trackingTarget }}
            title={page.title}
          >
            {!!page.icon && <i class={page.icon} />}
            {!!page.svgIcon && page.svgIcon}
            {page.newBadge && <div class={cx(styles.badge, styles.newBadge)}>{$t('New')}</div>}
          </div>
        ))}
        {this.platformAppsService.enabledApps.length > 0 && <AppsNav />}
        <NavTools />
      </div>
    );
  }
}

// TODO: Replace with a font icon
const HighlighterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clip-path="url(#clip0)">
      <path d="M0.736816 10.4971V16.1241C0.736816 17.1587 1.57862 17.9997 2.61248 17.9997H16.1173C17.152 17.9997 17.993 17.1587 17.993 16.1241V10.4971H0.736816V10.4971Z" />
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M5.30361 2.56988L8.88907 1.71484L11.4745 5.15035L7.64504 6.01543L7.64807 6.01989L4.51906 6.75186L2.27539 3.28364L5.30125 2.56641L5.30361 2.56988Z"
      />
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M17.3426 0.851841L17.9811 3.27371C18.0066 3.37275 17.9916 3.47709 17.9391 3.5641C17.8865 3.65111 17.801 3.71339 17.7012 3.7359L14.3855 4.42042L12.2759 4.96974L9.68604 1.52675L10.6496 1.34058L15.9974 0.028045C16.5924 -0.107742 17.1956 0.262868 17.3426 0.851841Z"
      />
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M8.26681 6.75197L8.26877 6.74707H11.2121L10.0116 9.74741H7.06836L7.06862 9.74676H3.31689L4.51918 6.75212L8.26681 6.75197Z"
      />
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M10.8198 9.74741L12.0203 6.74707H15.7717H16.5H17.6181C17.8259 6.74707 17.9932 6.91437 17.9933 7.12218V9.74815H14.5713L14.5716 9.74741H10.8198Z"
      />
      <path d="M1.49516 3.4707L0.883682 3.61549C0.585836 3.68302 0.333746 3.86382 0.173938 4.12344C0.014131 4.3838 -0.033136 4.68991 0.0411407 4.98624L0.736641 7.73522V9.74745H2.50877L3.63491 6.87594L1.49516 3.4707Z" />
    </g>
    <defs>
      <clipPath id="clip0">
        <rect width="18" height="18" fill="white" />
      </clipPath>
    </defs>
  </svg>
);
