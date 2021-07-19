import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import ModalLayout from 'components/ModalLayout.vue';
import { WindowsService } from 'services/windows';
import AddSourceInfo from './AddSourceInfo.vue';
import {
  SourceDisplayData,
  SourcesService,
  TPropertiesManager,
  TSourceType,
} from 'services/sources';
import { ScenesService } from 'services/scenes';
import { UserService } from 'services/user';
import { WidgetDisplayData, WidgetsService, WidgetType } from 'services/widgets';
import { IAppSource, PlatformAppsService } from 'services/platform-apps';
import omit from 'lodash/omit';
import { CustomizationService } from 'services/customization';
import { byOS, OS } from 'util/operating-systems';
import Scrollable from 'components/shared/Scrollable';
import { getPlatformService } from '../../services/platforms';
import { $i } from 'services/utils';

type TInspectableSource = TSourceType | WidgetType | 'streamlabel' | 'app_source' | string;

interface ISelectSourceOptions {
  propertiesManager?: TPropertiesManager;
  widgetType?: WidgetType;
  appId?: string;
  appSourceId?: string;
}

interface ISourceDefinition {
  id: string;
  type: TInspectableSource;
  name: string;
  description: string;
}

@Component({
  components: {
    ModalLayout,
    AddSourceInfo,
    Scrollable,
  },
})
export default class SourcesShowcase extends Vue {
  @Inject() sourcesService: SourcesService;
  @Inject() userService!: UserService;
  @Inject() widgetsService: WidgetsService;
  @Inject() scenesService: ScenesService;
  @Inject() windowsService: WindowsService;
  @Inject() platformAppsService: PlatformAppsService;
  @Inject() customizationService: CustomizationService;

  widgetTypes = WidgetType;
  essentialWidgetTypes = new Set([this.widgetTypes.AlertBox]);
  private primaryPlatformService = this.userService.state.auth
    ? getPlatformService(this.userService.state.auth.primaryPlatform)
    : null;

  iterableWidgetTypes = Object.keys(this.widgetTypes)
    .filter((type: string) => isNaN(Number(type)))
    .filter(type => {
      // show only supported widgets
      const whitelist = this.primaryPlatformService?.widgetsWhitelist;
      if (!whitelist) return true;
      return whitelist.includes(WidgetType[type]);
    })
    .sort((a: string, b: string) => {
      return this.essentialWidgetTypes.has(this.widgetTypes[a]) ? -1 : 1;
    });

  selectSource(sourceType: TSourceType, options: ISelectSourceOptions = {}) {
    const managerType = options.propertiesManager || 'default';
    const propertiesManagerSettings: Dictionary<any> = { ...omit(options, 'propertiesManager') };

    this.sourcesService.showAddSource(sourceType, {
      propertiesManagerSettings,
      propertiesManager: managerType,
    });
  }

  getSrc(type: string) {
    const theme = this.demoMode;
    const dataSource = this.widgetData(type) ? this.widgetData : this.sourceData;
    return $i(`source-demos/${theme}/${dataSource(type).demoFilename}`);
  }

  getLoginSrc() {
    const theme = this.demoMode;
    return require(`../../../media/images/sleeping-kevin-${theme}.png`);
  }

  selectWidget(type: WidgetType) {
    this.selectSource('browser_source', {
      propertiesManager: 'widget',
      widgetType: type,
    });
  }

  selectAppSource(appId: string, appSourceId: string) {
    // TODO: Could be other source type
    this.selectSource('browser_source', {
      appId,
      appSourceId,
      propertiesManager: 'platformApp',
    });
  }

  sourceData(type: string) {
    return SourceDisplayData()[type];
  }

  inspectedSource: string = null;
  inspectedSourceType: TInspectableSource = null;
  inspectedAppId: string = '';
  inspectedAppSourceId: string = '';

  inspectSource(inspectedSource: string, appId?: string, appSourceId?: string) {
    this.inspectedSource = this.inspectedSourceType = inspectedSource;
    if (appId) this.inspectedAppId = appId;
    if (appSourceId) this.inspectedAppSourceId = appSourceId;
  }

  get loggedIn() {
    return this.userService.isLoggedIn;
  }

  get platform() {
    if (!this.loggedIn) return null;
    return this.userService.platform.type;
  }

  widgetData(type: string) {
    return WidgetDisplayData(this.platform)[this.widgetTypes[type]];
  }

  selectInspectedSource() {
    if (
      this.sourcesService.getAvailableSourcesTypes().includes(this.inspectedSource as TSourceType)
    ) {
      this.selectSource(this.inspectedSource as TSourceType);
    } else if (this.inspectedSource === 'streamlabel') {
      this.selectStreamlabel();
    } else if (this.inspectedSource === 'replay') {
      this.selectSource('ffmpeg_source', { propertiesManager: 'replay' });
    } else if (this.inspectedSource === 'icon_library') {
      this.selectSource('image_source', { propertiesManager: 'iconLibrary' });
    } else if (this.inspectedSource === 'app_source') {
      this.selectAppSource(this.inspectedAppId, this.inspectedAppSourceId);
    } else {
      this.selectWidget(this.inspectedSourceType as WidgetType);
    }
  }

  selectStreamlabel() {
    this.selectSource(byOS({ [OS.Windows]: 'text_gdiplus', [OS.Mac]: 'text_ft2_source' }), {
      propertiesManager: 'streamlabels',
    });
  }

  get demoMode() {
    return this.customizationService.isDarkTheme ? 'night' : 'day';
  }

  get designerMode() {
    return this.customizationService.views.designerMode;
  }

  get availableSources(): ISourceDefinition[] {
    const sourcesList: ISourceDefinition[] = this.sourcesService
      .getAvailableSourcesTypesList()
      .filter(type => {
        // Freetype on windows is hidden
        if (type.value === 'text_ft2_source' && byOS({ [OS.Windows]: true, [OS.Mac]: false })) {
          return;
        }
        return !(type.value === 'scene' && this.scenesService.views.scenes.length <= 1);
      })
      .map(listItem => {
        return {
          id: listItem.value,
          type: listItem.value,
          name: this.sourceData(listItem.value).name,
          description: this.sourceData(listItem.value).description,
        };
      });

    return sourcesList;
  }

  get hasStreamlabel() {
    return this.primaryPlatformService?.hasCapability('streamlabels');
  }

  get inspectedSourceDefinition() {
    return this.availableSources.find(source => source.id === this.inspectedSource);
  }

  get availableAppSources(): {
    appId: string;
    source: IAppSource;
  }[] {
    return this.platformAppsService.enabledApps.reduce((sources, app) => {
      if (app.manifest.sources) {
        app.manifest.sources.forEach(source => {
          sources.push({
            source,
            appId: app.id,
          });
        });
      }

      return sources;
    }, []);
  }

  get showAppSources() {
    return this.availableAppSources.length > 0;
  }

  getAppAssetUrl(appId: string, asset: string) {
    return this.platformAppsService.views.getAssetUrl(appId, asset);
  }

  handleAuth() {
    this.windowsService.closeChildWindow();
    this.userService.showLogin();
  }
}
