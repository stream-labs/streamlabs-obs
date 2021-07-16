import moment from 'moment';
import { ViewHandler } from '../core';
import {
  IGoLiveSettings,
  IStreamingServiceState,
  IStreamSettings,
  EStreamingState,
  ERecordingState,
  EReplayBufferState,
} from './streaming-api';
import { StreamSettingsService } from '../settings/streaming';
import { UserService } from '../user';
import { RestreamService } from '../restream';
import { getPlatformService, TPlatform, TPlatformCapability } from '../platforms';
import { IncrementalRolloutService, TwitterService } from '../../app-services';
import cloneDeep from 'lodash/cloneDeep';
import difference from 'lodash/difference';

/**
 * The stream info view is responsible for keeping
 * reliable, up-to-date information about the user's
 * channel and current stream in the Vuex store for
 * components to make use of.
 */
export class StreamInfoView extends ViewHandler<IStreamingServiceState> {
  constructor(state: IStreamingServiceState, private getGoLiveSettings?: () => IGoLiveSettings) {
    super(state);
  }

  get settings(): IGoLiveSettings {
    return this.getGoLiveSettings ? this.getGoLiveSettings() : this.savedSettings;
  }

  private get userView() {
    return this.getServiceViews(UserService);
  }

  private get restreamView() {
    return this.getServiceViews(RestreamService);
  }

  private get streamSettingsView() {
    return this.getServiceViews(StreamSettingsService);
  }

  private get twitterView() {
    return this.getServiceViews(TwitterService);
  }

  private get incrementalRolloutView() {
    return this.getServiceViews(IncrementalRolloutService);
  }

  get streamingStatus() {
    return this.state.streamingStatus;
  }

  get info() {
    return this.state.info;
  }

  get error() {
    return this.info.error;
  }

  get lifecycle() {
    return this.info.lifecycle;
  }

  get customDestinations() {
    return this.settings.customDestinations || [];
  }

  get platforms() {
    return this.settings.platforms;
  }

  get checklist() {
    return this.info.checklist;
  }

  get game() {
    return this.commonFields.game;
  }

  getPlatformDisplayName(platform: TPlatform): string {
    return getPlatformService(platform).displayName;
  }

  // REMOVE
  get warning(): string {
    return this.state.info.warning;
  }

  /**
   * Returns a sorted list of all platforms (linked and unlinked)
   */
  get allPlatforms(): TPlatform[] {
    const allPlatforms: TPlatform[] = ['twitch', 'facebook', 'youtube', 'tiktok'];
    return this.sortPlatforms(allPlatforms);
  }

  /**
   * Returns a list of linked platforms available for restream
   */
  get linkedPlatforms(): TPlatform[] {
    if (!this.userView.state.auth) return [];
    if (!this.restreamView.canEnableRestream || !this.protectedModeEnabled) {
      return [this.userView.auth!.primaryPlatform];
    }
    return this.allPlatforms.filter(p => this.checkPlatformLinked(p));
  }

  get protectedModeEnabled() {
    return this.streamSettingsView.state.protectedModeEnabled;
  }

  /**
   * Returns a list of enabled for streaming platforms
   */
  get enabledPlatforms(): TPlatform[] {
    return this.getEnabledPlatforms(this.settings.platforms);
  }

  /**
   * Returns a list of enabled platforms with useCustomFields==false
   */
  get platformsWithoutCustomFields(): TPlatform[] {
    return this.enabledPlatforms.filter(platform => !this.platforms[platform].useCustomFields);
  }

  checkEnabled(platform: TPlatform) {
    return this.enabledPlatforms.includes(platform);
  }

  /**
   * Returns a list of enabled for streaming platforms from the given settings object
   */
  getEnabledPlatforms(platforms: IStreamSettings['platforms']): TPlatform[] {
    return Object.keys(platforms).filter(
      (platform: TPlatform) =>
        this.linkedPlatforms.includes(platform) && platforms[platform].enabled,
    ) as TPlatform[];
  }

  get isMultiplatformMode(): boolean {
    return (
      this.protectedModeEnabled &&
      (this.enabledPlatforms.length > 1 ||
        this.settings.customDestinations.filter(dest => dest.enabled).length > 0)
    );
  }

  get isMidStreamMode(): boolean {
    return this.state.streamingStatus !== 'offline';
  }

  /**
   * Returns total viewer count for all enabled platforms
   */
  get viewerCount(): number {
    if (!this.enabledPlatforms.length) return 0;
    return this.enabledPlatforms
      .map(platform => getPlatformService(platform).state.viewersCount)
      .reduce((c1, c2) => c1 + c2);
  }

  /**
   * Chat url of a primary platform
   */
  get chatUrl(): string {
    if (!this.userView.auth) return '';
    return getPlatformService(this.userView.auth.primaryPlatform).chatUrl;
  }

  getTweetText(streamTitle: string) {
    return `${streamTitle} ${this.twitterView.url}`;
  }

  /**
   * Prepares and returns the initial settings for the GoLive window
   */
  get savedSettings(): IGoLiveSettings {
    const destinations = {} as IGoLiveSettings['platforms'];
    this.linkedPlatforms.forEach(platform => {
      destinations[platform as string] = this.getSavedPlatformSettings(platform);
    });

    // if user recently added a new platform then it doesn't have default title and description
    // so set the title and description from other platforms
    const platforms = this.applyCommonFields(destinations);

    const savedGoLiveSettings = this.streamSettingsView.state.goLiveSettings;

    return {
      platforms,
      advancedMode: !!this.streamSettingsView.state.goLiveSettings?.advancedMode,
      optimizedProfile: undefined,
      customDestinations: savedGoLiveSettings?.customDestinations || [],
    };
  }

  get isAdvancedMode(): boolean {
    return this.isMultiplatformMode && this.settings.advancedMode;
  }

  /**
   * Returns common fields for the stream such as title, description, game
   */
  getCommonFields(platforms: IGoLiveSettings['platforms']) {
    const commonFields = {
      title: '',
      description: '',
      game: '',
    };
    const destinations = Object.keys(platforms) as TPlatform[];
    const enabledDestinations = destinations.filter(dest => platforms[dest].enabled);
    const destinationsWithCommonSettings = enabledDestinations.filter(
      dest => !platforms[dest].useCustomFields,
    );
    const destinationWithCustomSettings = difference(
      enabledDestinations,
      destinationsWithCommonSettings,
    );

    // search fields in platforms that don't use custom settings first
    destinationsWithCommonSettings.forEach(platform => {
      const destSettings = platforms[platform];
      Object.keys(commonFields).forEach(fieldName => {
        if (commonFields[fieldName] || !destSettings[fieldName]) return;
        commonFields[fieldName] = destSettings[fieldName];
      });
    });

    // search fields in platforms that have custom fields
    destinationWithCustomSettings.forEach(platform => {
      const destSettings = platforms[platform];
      Object.keys(commonFields).forEach(fieldName => {
        if (commonFields[fieldName] || !destSettings[fieldName]) return;
        commonFields[fieldName] = destSettings[fieldName];
      });
    });

    return commonFields;
  }

  applyCommonFields(platforms: IGoLiveSettings['platforms']): IGoLiveSettings['platforms'] {
    const commonFields = this.getCommonFields(platforms);
    const result = {} as IGoLiveSettings['platforms'];
    Object.keys(platforms).forEach(platform => {
      result[platform] = platforms[platform];
      result[platform].title = platforms[platform].title || commonFields.title;
      result[platform].description = platforms[platform].description || commonFields.description;
    });
    return result;
  }

  /**
   * return common fields for the stream such title, description, game
   */
  get commonFields(): { title: string; description: string; game: string } {
    return this.getCommonFields(this.settings.platforms);
  }

  /**
   * Sort the platform list
   * - the primary platform is always first
   * - linked platforms are always on the top of the list
   * - the rest has an alphabetic sort
   */
  sortPlatforms(platforms: TPlatform[]): TPlatform[] {
    platforms = platforms.sort();
    return [
      ...platforms.filter(p => this.checkPrimaryPlatform(p)),
      ...platforms.filter(p => !this.checkPrimaryPlatform(p) && this.checkPlatformLinked(p)),
      ...platforms.filter(p => !this.checkPlatformLinked(p)),
    ];
  }

  /**
   * returns `true` if all target platforms have prepopulated their settings
   */
  isPrepopulated(): boolean {
    return this.enabledPlatforms.map(getPlatformService).every(p => p.state.isPrepopulated);
  }

  /**
   * Returns true if given platforms have a capability
   */
  supports(capability: TPlatformCapability, targetPlatforms?: TPlatform[]): boolean {
    const platforms = targetPlatforms || this.enabledPlatforms;
    for (const platform of platforms) {
      if (getPlatformService(platform).hasCapability(capability)) return true;
    }
    return false;
  }

  checkPlatformLinked(platform: TPlatform): boolean {
    if (!this.userView.auth?.platforms) return false;
    return !!this.userView.auth?.platforms[platform];
  }

  checkPrimaryPlatform(platform: TPlatform) {
    return platform === this.userView.auth?.primaryPlatform;
  }

  get isLoading() {
    const { error, lifecycle } = this.info;
    return !error && ['empty', 'prepopulate'].includes(lifecycle);
  }

  /**
   * Validates settings and returns an error string
   */
  validateSettings<T extends IStreamSettings>(settings: T): string {
    return '';
  }

  /**
   * Return true if one of the checks has been failed
   */
  hasFailedChecks(): boolean {
    return !!Object.keys(this.state.info.checklist).find(
      check => this.state.info.checklist[check] === 'failed',
    );
  }

  /**
   * Return true if one of the checks is in a pending state
   */
  hasPendingChecks(): boolean {
    return !!Object.keys(this.state.info.checklist).find(
      check => this.state.info.checklist[check] === 'pending',
    );
  }

  /**
   * Return settings for a single platform
   */
  getPlatformSettings<T extends TPlatform>(platform: T): IGoLiveSettings['platforms'][T] {
    return this.settings.platforms[platform];
  }

  /**
   * Returns Go-Live settings for a given platform
   */
  private getSavedPlatformSettings(platform: TPlatform) {
    const service = getPlatformService(platform);
    const savedDestinations = this.streamSettingsView.state.goLiveSettings?.platforms;
    const { enabled, useCustomFields } = (savedDestinations && savedDestinations[platform]) || {
      enabled: false,
      useCustomFields: false,
    };
    const settings = cloneDeep(service.state.settings);

    // don't reuse broadcastId and thumbnail for Youtube
    if (settings && settings['broadcastId']) settings['broadcastId'] = '';
    if (settings && settings['thumbnail']) settings['thumbnail'] = '';

    // don't reuse liveVideoId for Facebook
    if (platform === 'facebook' && settings && settings['liveVideoId']) {
      settings['liveVideoId'] = '';
    }

    return {
      ...settings,
      useCustomFields,
      enabled: enabled || this.checkPrimaryPlatform(platform),
    };
  }

  get delayEnabled() {
    return this.streamSettingsView.settings.delayEnable;
  }

  get delaySeconds() {
    return this.streamSettingsView.settings.delaySec;
  }

  get isStreaming() {
    return this.state.streamingStatus !== EStreamingState.Offline;
  }

  get isRecording() {
    return this.state.recordingStatus !== ERecordingState.Offline;
  }

  get isReplayBufferActive() {
    return this.state.replayBufferStatus !== EReplayBufferState.Offline;
  }

  get isIdle(): boolean {
    return !this.isStreaming && !this.isRecording;
  }
}
