import { ExecuteInCurrentWindow, Inject, mutation, StatefulService } from 'services/core';
import {
  EPlatformCallResult,
  IPlatformState,
  TPlatform,
  TPlatformCapability,
  TStartStreamOptions,
  TPlatformCapabilityMap,
} from './index';
import { StreamingService } from 'services/streaming';
import { UserService } from 'services/user';
import { HostsService } from 'services/hosts';
import electron from 'electron';
import { IFacebookStartStreamOptions } from './facebook';
import { StreamSettingsService } from '../settings/streaming';

const VIEWER_COUNT_UPDATE_INTERVAL = 60 * 1000;

/**
 * Base class for platforms
 * Keeps shared code for all platforms
 */
export abstract class BasePlatformService<T extends IPlatformState> extends StatefulService<T> {
  static initialState: IPlatformState = {
    streamKey: '',
    viewersCount: 0,
    settings: null,
    isPrepopulated: false,
  };

  @Inject() protected streamingService: StreamingService;
  @Inject() protected userService: UserService;
  @Inject() protected hostsService: HostsService;
  @Inject() protected streamSettingsService: StreamSettingsService;
  abstract readonly platform: TPlatform;

  abstract capabilities: Set<TPlatformCapability>;

  @ExecuteInCurrentWindow()
  hasCapability<T extends TPlatformCapability>(capability: T): this is TPlatformCapabilityMap[T] {
    return this.capabilities.has(capability);
  }

  get mergeUrl() {
    const host = this.hostsService.streamlabs;
    const token = this.userService.apiToken;
    return `https://${host}/slobs/merge/${token}/${this.platform}_account`;
  }

  averageViewers: number;
  peakViewers: number;
  private nViewerSamples: number;

  async afterGoLive(): Promise<void> {
    this.averageViewers = 0;
    this.peakViewers = 0;
    this.nViewerSamples = 0;

    // update viewers count
    const runInterval = async () => {
      if (this.hasCapability('viewerCount')) {
        const count = await this.fetchViewerCount();

        this.nViewerSamples += 1;
        this.averageViewers =
          (this.averageViewers * (this.nViewerSamples - 1) + count) / this.nViewerSamples;
        this.peakViewers = Math.max(this.peakViewers, count);

        this.SET_VIEWERS_COUNT(count);
      }

      // stop updating if streaming has stopped
      if (this.streamingService.views.isMidStreamMode) {
        setTimeout(runInterval, VIEWER_COUNT_UPDATE_INTERVAL);
      }
    };
    if (this.hasCapability('viewerCount')) await runInterval();
  }

  unlink() {
    // unlink platform and reload auth state
    // const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/unlink/${this.platform}_account`;
    // const headers = authorizedHeaders(this.userService.apiToken!);
    // const request = new Request(url, { headers });
    // return fetch(request)
    //   .then(handleResponse)
    //   .then(_ => this.userService.updateLinkedPlatforms());

    electron.remote.shell.openExternal(
      `https://${this.hostsService.streamlabs}/dashboard#/settings/account-settings`,
    );
  }

  protected syncSettingsWithLocalStorage() {
    // save settings to the local storage
    const savedSettings: IFacebookStartStreamOptions = JSON.parse(
      localStorage.getItem(this.serviceName) as string,
    );
    if (savedSettings) this.UPDATE_STREAM_SETTINGS(savedSettings);
    this.store.watch(
      () => this.state.settings,
      () => {
        localStorage.setItem(this.serviceName, JSON.stringify(this.state.settings));
      },
      { deep: true },
    );
  }

  async validatePlatform() {
    return EPlatformCallResult.Success;
  }

  fetchUserInfo() {
    return Promise.resolve({});
  }

  @mutation()
  protected SET_VIEWERS_COUNT(viewers: number) {
    this.state.viewersCount = viewers;
  }

  @mutation()
  protected SET_STREAM_KEY(key: string) {
    this.state.streamKey = key;
  }

  @mutation()
  protected SET_PREPOPULATED(isPrepopulated: boolean) {
    this.state.isPrepopulated = isPrepopulated;
  }

  @mutation()
  protected SET_STREAM_SETTINGS(settings: TStartStreamOptions) {
    this.state.settings = settings;
  }

  @mutation()
  protected UPDATE_STREAM_SETTINGS(settingsPatch: Partial<TStartStreamOptions>) {
    this.state.settings = { ...this.state.settings, ...settingsPatch };
  }
}
