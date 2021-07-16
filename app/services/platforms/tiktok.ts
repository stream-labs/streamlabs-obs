import { InheritMutations } from '../core';
import { BasePlatformService } from './base-platform';
import { IPlatformCapabilityResolutionPreset, IPlatformState, TPlatformCapability } from './index';
import { IGoLiveSettings } from '../streaming';
import { WidgetType } from '../widgets';
import { getDefined } from '../../util/properties-type-guards';

export interface ITiktokStartStreamOptions {
  serverUrl: string;
  streamKey: string;
}

interface ITiktokServiceState extends IPlatformState {
  settings: ITiktokStartStreamOptions;
}

@InheritMutations()
export class TiktokService
  extends BasePlatformService<ITiktokServiceState>
  implements IPlatformCapabilityResolutionPreset {
  readonly apiBase = '';
  readonly platform = 'tiktok';
  readonly displayName = 'TikTok';
  readonly capabilities = new Set<TPlatformCapability>(['resolutionPreset']);

  // support only donation widgets for now
  readonly widgetsWhitelist = [
    WidgetType.AlertBox,
    WidgetType.DonationGoal,
    WidgetType.DonationTicker,
    WidgetType.TipJar,
  ];

  readonly inputResolution = '720x1280';
  readonly outputResolution = '720x1280';

  authWindowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 600,
    height: 800,
  };

  get authUrl() {
    const host = this.hostsService.streamlabs;
    const query = `_=${Date.now()}&skip_splash=true&external=electron&tiktok&force_verify&origin=slobs`;
    return `https://${host}/slobs/login?${query}`;
  }

  private get oauthToken() {
    return this.userService.views.state.auth?.platforms?.facebook?.token;
  }

  async beforeGoLive(goLiveSettings: IGoLiveSettings) {
    const ttSettings = getDefined(goLiveSettings.platforms.tiktok);
    if (!this.streamingService.views.isMultiplatformMode) {
      this.streamSettingsService.setSettings({
        streamType: 'rtmp_custom',
        key: ttSettings.streamKey,
        server: ttSettings.serverUrl,
      });
    }
    this.SET_STREAM_SETTINGS(ttSettings);
  }

  /**
   * prepopulate channel info and save it to the store
   */
  async prepopulateInfo(): Promise<void> {
    this.SET_PREPOPULATED(true);
  }

  async putChannelInfo(): Promise<void> {
    // no API
  }

  get chatUrl(): string {
    // no API
    return '';
  }

  get liveDockEnabled(): boolean {
    return false;
  }
}
