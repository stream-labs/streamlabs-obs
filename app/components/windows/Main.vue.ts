import Vue from 'vue';
import { Component, Watch } from 'vue-property-decorator';
import SideNav from '../SideNav';
import { NewsBanner, TitleBar, Grow } from 'components/shared/ReactComponent';
import { ScenesService } from 'services/scenes';
import { PlatformAppsService } from 'services/platform-apps';
import { EditorCommandsService } from '../../app-services';
import VueResize from 'vue-resize';
import { $t } from 'services/i18n';
import fs from 'fs';
Vue.use(VueResize);

// Pages
import Studio from '../pages/Studio';
import PlatformAppStore from '../pages/PlatformAppStore.vue';
import BrowseOverlays from 'components/pages/BrowseOverlays.vue';
import AlertboxLibrary from 'components/pages/AlertboxLibrary';
import Onboarding from '../pages/Onboarding';
import LayoutEditor from '../pages/LayoutEditor';
import { Inject } from '../../services/core/injector';
import { CustomizationService } from 'services/customization';
import { NavigationService } from 'services/navigation';
import { AppService } from 'services/app';
import { UserService } from 'services/user';
import { IModalOptions, WindowsService } from 'services/windows';
import LiveDock from '../LiveDock.vue';
import StudioFooter from '../StudioFooter.vue';
import { PatchNotes, Loader, StreamScheduler, Highlighter } from '../shared/ReactComponent';
import PlatformAppMainPage from '../pages/PlatformAppMainPage.vue';
import electron from 'electron';
import ResizeBar from 'components/shared/ResizeBar.vue';
import PlatformMerge from 'components/pages/PlatformMerge';
import { getPlatformService } from 'services/platforms';
import ModalWrapper from '../shared/modals/ModalWrapper';
import antdThemes from 'styles/antd/index';

const loadedTheme = () => {
  const customizationState = localStorage.getItem('PersistentStatefulService-CustomizationService');
  if (customizationState) {
    return JSON.parse(customizationState)?.theme;
  }
};

@Component({
  components: {
    TitleBar,
    SideNav,
    Studio,
    BrowseOverlays,
    Onboarding,
    LiveDock,
    StudioFooter,
    CustomLoader: Loader,
    PatchNotes,
    NewsBanner,
    PlatformAppMainPage,
    PlatformAppStore,
    ResizeBar,
    PlatformMerge,
    LayoutEditor,
    AlertboxLibrary,
    ModalWrapper,
    StreamScheduler,
    Highlighter,
    Grow,
  },
})
export default class Main extends Vue {
  @Inject() customizationService: CustomizationService;
  @Inject() navigationService: NavigationService;
  @Inject() appService: AppService;
  @Inject() userService: UserService;
  @Inject() windowsService: WindowsService;
  @Inject() scenesService: ScenesService;
  @Inject() platformAppsService: PlatformAppsService;
  @Inject() editorCommandsService: EditorCommandsService;

  private modalOptions: IModalOptions = {
    renderFn: null,
  };

  created() {
    window.addEventListener('resize', this.windowSizeHandler);
  }

  mounted() {
    antdThemes[this.theme].use();
    WindowsService.modalChanged.subscribe(modalOptions => {
      this.modalOptions = { ...this.modalOptions, ...modalOptions };
    });
    this.updateLiveDockContraints();
  }

  get uiReady() {
    return this.$store.state.bulkLoadFinished && this.$store.state.i18nReady;
  }

  @Watch('theme')
  updateAntd(newTheme: string, oldTheme: string) {
    antdThemes[oldTheme].unuse();
    antdThemes[newTheme].use();
  }

  @Watch('uiReady')
  initializeResize() {
    this.$nextTick(() => {
      const dockWidth = this.customizationService.state.livedockSize;
      if (dockWidth < 1) {
        // migrate from old percentage value to the pixel value
        this.resetWidth();
      }
      this.handleResize();
    });
  }

  destroyed() {
    window.removeEventListener('resize', this.windowSizeHandler);
  }

  minEditorWidth = 500;

  get title() {
    return this.windowsService.state.main.title;
  }

  get page() {
    return this.navigationService.state.currentPage;
  }

  get params() {
    return this.navigationService.state.params;
  }

  get theme() {
    if (this.$store.state.bulkLoadFinished) {
      return this.customizationService.currentTheme;
    }

    return loadedTheme() || 'night-theme';
  }

  get applicationLoading() {
    return this.appService.state.loading;
  }

  get showLoadingSpinner() {
    return (
      this.appService.state.loading && this.page !== 'Onboarding' && this.page !== 'BrowseOverlays'
    );
  }

  get isLoggedIn() {
    return this.userService.isLoggedIn;
  }

  get renderDock() {
    return (
      this.isLoggedIn &&
      !this.isOnboarding &&
      this.hasLiveDock &&
      getPlatformService(this.userService.platform.type).liveDockEnabled &&
      !this.showLoadingSpinner
    );
  }

  get liveDockSize() {
    return this.customizationService.state.livedockSize;
  }

  get isDockCollapsed() {
    return this.customizationService.state.livedockCollapsed;
  }

  get leftDock() {
    return this.customizationService.state.leftDock;
  }

  get isOnboarding() {
    return this.navigationService.state.currentPage === 'Onboarding';
  }

  get platformApps() {
    return this.platformAppsService.enabledApps;
  }

  get errorAlert() {
    return this.appService.state.errorAlert;
  }

  async isDirectory(path: string) {
    return new Promise<boolean>((resolve, reject) => {
      fs.lstat(path, (err, stats) => {
        if (err) {
          reject(err);
        }
        resolve(stats.isDirectory());
      });
    });
  }

  async onDropHandler(event: DragEvent) {
    if (this.page !== 'Studio') return;

    const fileList = event.dataTransfer.files;

    if (fileList.length < 1) return;

    const files: string[] = [];
    let fi = fileList.length;
    while (fi--) files.push(fileList.item(fi).path);

    const isDirectory = await this.isDirectory(files[0]).catch(err => {
      console.error('Error checking if drop is directory', err);
      return false;
    });

    if (files.length > 1 || isDirectory) {
      electron.remote.dialog
        .showMessageBox(electron.remote.getCurrentWindow(), {
          message: $t('Are you sure you want to import multiple files?'),
          type: 'warning',
          buttons: [$t('Cancel'), $t('OK')],
        })
        .then(({ response }) => {
          if (!response) return;
          this.executeFileDrop(files);
        });
    } else {
      this.executeFileDrop(files);
    }
  }

  executeFileDrop(files: string[]) {
    this.editorCommandsService.executeCommand(
      'AddFilesCommand',
      this.scenesService.views.activeSceneId,
      files,
    );
  }

  $refs: {
    mainMiddle: HTMLDivElement;
  };

  compactView = false;

  get mainResponsiveClasses() {
    const classes = [];

    if (this.compactView) {
      classes.push('main-middle--compact');
    }

    return classes.join(' ');
  }

  windowWidth: number;

  hasLiveDock = true;

  windowResizeTimeout: number;

  minDockWidth = 290;
  maxDockWidth = this.minDockWidth;

  updateLiveDockContraints() {
    const appRect = this.$root.$el.getBoundingClientRect();
    this.maxDockWidth = Math.min(appRect.width - this.minEditorWidth, appRect.width / 2);
    this.minDockWidth = Math.min(290, this.maxDockWidth);
  }

  windowSizeHandler() {
    if (!this.windowsService.state.main.hideStyleBlockers) {
      this.onResizeStartHandler();
    }
    this.windowWidth = window.innerWidth;

    clearTimeout(this.windowResizeTimeout);

    this.hasLiveDock = this.windowWidth >= 1070;
    if (this.page === 'Studio') {
      this.hasLiveDock = this.windowWidth >= this.minEditorWidth + 100;
    }
    this.windowResizeTimeout = window.setTimeout(() => {
      this.windowsService.actions.updateStyleBlockers('main', false);
      this.updateLiveDockContraints();
      this.updateWidth();
    }, 200);
  }

  handleResize() {
    this.compactView = this.$refs.mainMiddle.clientWidth < 1200;
  }

  handleEditorWidth(width: number) {
    this.minEditorWidth = width;
  }

  onResizeStartHandler() {
    this.windowsService.actions.updateStyleBlockers('main', true);
  }

  onResizeStopHandler(offset: number) {
    this.setWidth(this.customizationService.state.livedockSize + offset);
    this.windowsService.actions.updateStyleBlockers('main', false);
  }

  setWidth(width: number) {
    this.customizationService.actions.setSettings({
      livedockSize: this.validateWidth(width),
    });
  }

  validateWidth(width: number): number {
    let constrainedWidth = Math.max(this.minDockWidth, width);
    constrainedWidth = Math.min(this.maxDockWidth, width);
    return constrainedWidth;
  }

  updateWidth() {
    const width = this.customizationService.state.livedockSize;
    if (width !== this.validateWidth(width)) this.setWidth(width);
  }

  resetWidth() {
    const appRect = this.$root.$el.getBoundingClientRect();
    const defaultWidth = appRect.width * 0.28;
    this.setWidth(defaultWidth);
  }
}
