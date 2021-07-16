import Vue from 'vue';
import { mutation, StatefulService } from 'services/core/stateful-service';
import * as obs from '../../../obs-api';
import { Inject } from 'services/core/injector';
import moment from 'moment';
import padStart from 'lodash/padStart';
import { IOutputSettings, OutputSettingsService } from 'services/settings';
import { WindowsService } from 'services/windows';
import { Subject } from 'rxjs';
import electron from 'electron';
import {
  ERecordingState,
  EReplayBufferState,
  EStreamingState,
  IGoLiveSettings,
  IStreamInfo,
  IStreamingServiceApi,
  IStreamingServiceState,
  IStreamSettings,
  TGoLiveChecklistItemState,
} from './streaming-api';
import { UsageStatisticsService } from 'services/usage-statistics';
import { $t } from 'services/i18n';
import { getPlatformService, TPlatform, TStartStreamOptions } from 'services/platforms';
import { UserService } from 'services/user';
import {
  ENotificationSubType,
  ENotificationType,
  INotification,
  NotificationsService,
} from 'services/notifications';
import { VideoEncodingOptimizationService } from 'services/video-encoding-optimizations';
import { CustomizationService } from 'services/customization';
import { EAvailableFeatures, IncrementalRolloutService } from 'services/incremental-rollout';
import { StreamSettingsService } from '../settings/streaming';
import { RestreamService } from 'services/restream';
import Utils from 'services/utils';
import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import { createStreamError, IStreamError, StreamError, TStreamErrorType } from './stream-error';
import { authorizedHeaders } from 'util/requests';
import { HostsService } from '../hosts';
import { TwitterService } from '../integrations/twitter';
import { assertIsDefined, getDefined } from 'util/properties-type-guards';
import { StreamInfoView } from './streaming-view';
import { GrowService } from 'services/grow/grow';

enum EOBSOutputType {
  Streaming = 'streaming',
  Recording = 'recording',
  ReplayBuffer = 'replay-buffer',
}

enum EOBSOutputSignal {
  Starting = 'starting',
  Start = 'start',
  Stopping = 'stopping',
  Stop = 'stop',
  Reconnect = 'reconnect',
  ReconnectSuccess = 'reconnect_success',
  Wrote = 'wrote',
  WriteError = 'writing_error',
}

interface IOBSOutputSignalInfo {
  type: EOBSOutputType;
  signal: EOBSOutputSignal;
  code: obs.EOutputCode;
  error: string;
}

export class StreamingService
  extends StatefulService<IStreamingServiceState>
  implements IStreamingServiceApi {
  @Inject() private streamSettingsService: StreamSettingsService;
  @Inject() private outputSettingsService: OutputSettingsService;
  @Inject() private windowsService: WindowsService;
  @Inject() private usageStatisticsService: UsageStatisticsService;
  @Inject() private notificationsService: NotificationsService;
  @Inject() private userService: UserService;
  @Inject() private incrementalRolloutService: IncrementalRolloutService;
  @Inject() private videoEncodingOptimizationService: VideoEncodingOptimizationService;
  @Inject() private customizationService: CustomizationService;
  @Inject() private restreamService: RestreamService;
  @Inject() private hostsService: HostsService;
  @Inject() private twitterService: TwitterService;
  @Inject() private growService: GrowService;

  streamingStatusChange = new Subject<EStreamingState>();
  recordingStatusChange = new Subject<ERecordingState>();
  replayBufferStatusChange = new Subject<EReplayBufferState>();
  replayBufferFileWrite = new Subject<string>();
  streamInfoChanged = new Subject<StreamInfoView<any>>();

  // Dummy subscription for stream deck
  streamingStateChange = new Subject<void>();

  powerSaveId: number;

  private resolveStartStreaming: Function = () => {};
  private rejectStartStreaming: Function = () => {};

  static initialState: IStreamingServiceState = {
    streamingStatus: EStreamingState.Offline,
    streamingStatusTime: new Date().toISOString(),
    recordingStatus: ERecordingState.Offline,
    recordingStatusTime: new Date().toISOString(),
    replayBufferStatus: EReplayBufferState.Offline,
    replayBufferStatusTime: new Date().toISOString(),
    selectiveRecording: false,
    info: {
      settings: null,
      lifecycle: 'empty',
      error: null,
      warning: '',
      checklist: {
        applyOptimizedSettings: 'not-started',
        twitch: 'not-started',
        youtube: 'not-started',
        facebook: 'not-started',
        tiktok: 'not-started',
        setupMultistream: 'not-started',
        startVideoTransmission: 'not-started',
        postTweet: 'not-started',
      },
    },
  };

  init() {
    obs.NodeObs.OBS_service_connectOutputSignals((info: IOBSOutputSignalInfo) => {
      this.handleOBSOutputSignal(info);
    });

    // watch for StreamInfoView at emit `streamInfoChanged` event if something has been hanged there
    this.store.watch(
      () => {
        this.views.chatUrl; // read `chatUrl` to tell vuex that this computed property is reactive
        return this.views;
      },
      val => {
        // show the error if child window is closed
        if (
          val.info.error &&
          !this.windowsService.state.child.isShown &&
          this.streamSettingsService.protectedModeEnabled
        ) {
          this.showGoLiveWindow();
        }
        this.streamInfoChanged.next(val);
      },
      {
        deep: true,
      },
    );
  }

  get views() {
    return new StreamInfoView(this.state);
  }

  /**
   * sync the settings from platforms with the local state
   */
  async prepopulateInfo(platforms?: TPlatform[]) {
    platforms = platforms || this.views.enabledPlatforms;
    this.UPDATE_STREAM_INFO({ lifecycle: 'prepopulate', error: null });

    // prepopulate settings for all platforms in parallel mode
    await Promise.all(
      platforms.map(async platform => {
        const service = getPlatformService(platform);

        // check eligibility for restream
        // primary platform is always available to stream into
        // prime users are eligeble for streaming to any platform
        let primeRequired = false;
        if (!this.views.checkPrimaryPlatform(platform) && !this.userService.isPrime) {
          const primaryPlatform = this.userService.state.auth?.primaryPlatform;

          // grandfathared users allowed to stream primary + FB
          if (!this.restreamService.state.grandfathered) {
            primeRequired = true;
          } else if (
            isEqual([primaryPlatform, platform], ['twitch', 'facebook']) ||
            isEqual([primaryPlatform, platform], ['youtube', 'facebook'])
          ) {
            primeRequired = false;
          } else {
            primeRequired = true;
          }
          if (primeRequired) {
            this.setError('PRIME_REQUIRED');
            this.UPDATE_STREAM_INFO({ lifecycle: 'empty' });
            return;
          }
        }

        try {
          await service.prepopulateInfo();
        } catch (e: unknown) {
          // cast all PLATFORM_REQUEST_FAILED errors to PREPOPULATE_FAILED
          if (e instanceof StreamError) {
            e.type =
              (e.type as TStreamErrorType) === 'PLATFORM_REQUEST_FAILED'
                ? 'PREPOPULATE_FAILED'
                : e.type || 'UNKNOWN_ERROR';

            this.setError(e, platform);
          } else {
            this.setError('PREPOPULATE_FAILED', platform);
          }

          this.UPDATE_STREAM_INFO({ lifecycle: 'empty' });
          return;
        }
      }),
    );

    // prepopulate Twitter
    try {
      if (this.twitterService.state.linked && this.twitterService.state.tweetWhenGoingLive) {
        await this.twitterService.getTwitterStatus();
      }
    } catch (e: unknown) {
      // do not block streaming if something is wrong on the Twitter side
      console.error('Error fetching Twitter status', e);
    }

    // successfully prepopulated
    this.UPDATE_STREAM_INFO({ lifecycle: 'waitForNewSettings' });
  }

  /**
   * Make a transition to Live
   */
  async goLive(newSettings?: IGoLiveSettings) {
    // don't interact with API in loged out mode and when protected mode is disabled
    if (
      !this.userService.isLoggedIn ||
      (!this.streamSettingsService.state.protectedModeEnabled &&
        this.userService.state.auth?.primaryPlatform !== 'twitch') // twitch is a special case
    ) {
      this.finishStartStreaming();
      return;
    }

    // clear the current stream info
    this.RESET_STREAM_INFO();

    // if settings are not provided then GoLive window has been not shown
    // consider this as unattendedMode
    const unattendedMode = !newSettings;

    // use default settings if no new settings provided
    const settings = newSettings || cloneDeep(this.views.savedSettings);

    // save enabled platforms to reuse setting with the next app start
    this.streamSettingsService.setSettings({ goLiveSettings: settings });

    // save current settings in store so we can re-use them if something will go wrong
    this.SET_GO_LIVE_SETTINGS(settings);

    // show the GoLive checklist
    this.UPDATE_STREAM_INFO({ lifecycle: 'runChecklist' });

    // update channel settings for each platform
    const platforms = this.views.enabledPlatforms;
    for (const platform of platforms) {
      const service = getPlatformService(platform);
      try {
        // don't update settings for twitch in unattendedMode
        const settingsForPlatform = platform === 'twitch' && unattendedMode ? undefined : settings;
        await this.runCheck(platform, () => service.beforeGoLive(settingsForPlatform));
      } catch (e: unknown) {
        console.error('Error running beforeGoLive for plarform', e);
        // cast all PLATFORM_REQUEST_FAILED errors to SETTINGS_UPDATE_FAILED
        if (e instanceof StreamError) {
          e.type =
            (e.type as TStreamErrorType) === 'PLATFORM_REQUEST_FAILED'
              ? 'SETTINGS_UPDATE_FAILED'
              : e.type || 'UNKNOWN_ERROR';
          this.setError(e, platform);
        } else {
          this.setError('SETTINGS_UPDATE_FAILED', platform);
        }
        return;
      }
    }

    // setup restream
    if (this.views.isMultiplatformMode) {
      // check the Restream service is available
      let ready = false;
      try {
        await this.runCheck(
          'setupMultistream',
          async () => (ready = await this.restreamService.checkStatus()),
        );
      } catch (e: unknown) {
        console.error('Error fetching restreaming service', e);
      }
      // Assume restream is down
      if (!ready) {
        this.setError('RESTREAM_DISABLED');
        return;
      }

      // update restream settings
      try {
        await this.runCheck('setupMultistream', async () => {
          // enable restream on the backend side
          if (!this.restreamService.state.enabled) await this.restreamService.setEnabled(true);
          await this.restreamService.beforeGoLive();
        });
      } catch (e: unknown) {
        console.error('Failed to setup restream', e);
        this.setError('RESTREAM_SETUP_FAILED');
        return;
      }
    }

    // apply optimized settings
    const optimizer = this.videoEncodingOptimizationService;
    if (optimizer.state.useOptimizedProfile && settings.optimizedProfile) {
      if (unattendedMode && optimizer.canApplyProfileFromCache()) {
        optimizer.applyProfileFromCache();
      } else {
        optimizer.applyProfile(settings.optimizedProfile);
      }
      await this.runCheck('applyOptimizedSettings');
    }

    // start video transmission
    try {
      await this.runCheck('startVideoTransmission', () => this.finishStartStreaming());
    } catch (e: unknown) {
      return;
    }

    // check if we should show the waring about the disabled Auto-start
    if (settings.platforms.youtube?.enabled && !settings.platforms.youtube.enableAutoStart) {
      this.SET_WARNING('YT_AUTO_START_IS_DISABLED');
    }

    // tweet
    if (
      settings.tweetText &&
      this.twitterService.state.linked &&
      this.twitterService.state.tweetWhenGoingLive
    ) {
      try {
        await this.runCheck('postTweet', () => this.twitterService.postTweet(settings.tweetText!));
      } catch (e: unknown) {
        console.error('unable to post a tweet', e);
        if (e instanceof StreamError) {
          this.setError(e);
        } else {
          this.setError('TWEET_FAILED');
        }
        return;
      }
    }

    // all done
    if (this.state.streamingStatus === EStreamingState.Live) {
      this.UPDATE_STREAM_INFO({ lifecycle: 'live' });
      this.createGameAssociation(this.views.commonFields.game);
      this.recordAfterStreamStartAnalytics(settings);
    }
  }

  private recordAfterStreamStartAnalytics(settings: IGoLiveSettings) {
    if (settings.customDestinations.filter(dest => dest.enabled).length) {
      this.usageStatisticsService.recordFeatureUsage('CustomStreamDestination');
    }

    // send analytics for Facebook
    if (settings.platforms.facebook?.enabled) {
      const fbSettings = settings.platforms.facebook;
      this.usageStatisticsService.recordFeatureUsage('StreamToFacebook');
      if (fbSettings.game) {
        this.usageStatisticsService.recordFeatureUsage('StreamToFacebookGaming');
      }
      if (fbSettings.liveVideoId) {
        this.usageStatisticsService.recordFeatureUsage('StreamToFacebookScheduledVideo');
      }
      if (fbSettings.destinationType === 'me') {
        this.usageStatisticsService.recordFeatureUsage('StreamToFacebookTimeline');
      } else if (fbSettings.destinationType === 'group') {
        this.usageStatisticsService.recordFeatureUsage('StreamToFacebookGroup');
      } else {
        this.usageStatisticsService.recordFeatureUsage('StreamToFacebookPage');
      }
    }

    // send analytics for TikTok
    if (settings.platforms.tiktok?.enabled) {
      this.usageStatisticsService.recordFeatureUsage('StreamToTikTok');
    }
  }

  /**
   * Update stream stetting while being live
   */
  async updateStreamSettings(settings: IGoLiveSettings): Promise<boolean> {
    const lifecycle = this.state.info.lifecycle;

    // save current settings in store so we can re-use them if something will go wrong
    this.SET_GO_LIVE_SETTINGS(settings);

    // run checklist
    this.UPDATE_STREAM_INFO({ lifecycle: 'runChecklist' });

    // call putChannelInfo for each platform
    const platforms = this.views.getEnabledPlatforms(settings.platforms);

    platforms.forEach(platform => {
      this.UPDATE_STREAM_INFO({
        checklist: { ...this.state.info.checklist, [platform]: 'not-started' },
      });
    });

    for (const platform of platforms) {
      const service = getPlatformService(platform);
      const newSettings = getDefined(settings.platforms[platform]);
      try {
        await this.runCheck(platform, () => service.putChannelInfo(newSettings));
      } catch (e: unknown) {
        console.error('Error running putChannelInfo for platform', e);
        // cast all PLATFORM_REQUEST_FAILED errors to SETTINGS_UPDATE_FAILED
        if (e instanceof StreamError) {
          e.type =
            (e.type as TStreamErrorType) === 'PLATFORM_REQUEST_FAILED'
              ? 'SETTINGS_UPDATE_FAILED'
              : e.type || 'UNKNOWN_ERROR';
          this.setError(e, platform);
        } else {
          this.setError('SETTINGS_UPDATE_FAILED', platform);
        }
        return false;
      }
    }

    // save updated settings locally
    this.streamSettingsService.setSettings({ goLiveSettings: settings });
    // finish the 'runChecklist' step
    this.UPDATE_STREAM_INFO({ lifecycle });
    return true;
  }

  /**
   * Schedule stream for eligible platforms
   */
  async scheduleStream(settings: IStreamSettings, time: string) {
    const destinations = settings.platforms;
    const platforms = (Object.keys(destinations) as TPlatform[]).filter(
      dest => destinations[dest]?.enabled && this.views.supports('stream-schedule', [dest]),
    ) as ('facebook' | 'youtube')[];
    for (const platform of platforms) {
      const service = getPlatformService(platform);
      assertIsDefined(service.scheduleStream);
      await service.scheduleStream(time, getDefined(destinations[platform]));
    }
  }

  /**
   * Run task and update the checklist item status based on task result
   */
  private async runCheck(
    checkName: keyof IStreamInfo['checklist'],
    cb?: (...args: unknown[]) => Promise<unknown>,
  ) {
    this.SET_CHECKLIST_ITEM(checkName, 'pending');
    try {
      if (cb) await cb();
      this.SET_CHECKLIST_ITEM(checkName, 'done');
    } catch (e: unknown) {
      this.SET_CHECKLIST_ITEM(checkName, 'failed');
      throw e;
    }
  }

  @mutation()
  private UPDATE_STREAM_INFO(infoPatch: Partial<IStreamInfo>) {
    this.state.info = { ...this.state.info, ...infoPatch };
  }

  /**
   * Set the error state for the GoLive window
   */
  private setError(errorTypeOrError?: TStreamErrorType | StreamError, platform?: TPlatform) {
    if (typeof errorTypeOrError === 'object') {
      // an error object has been passed as a first arg
      if (platform) errorTypeOrError.platform = platform;
      this.SET_ERROR(errorTypeOrError);
    } else {
      // an error type has been passed as a first arg
      const errorType = errorTypeOrError as TStreamErrorType;
      const error = createStreamError(errorType);
      if (platform) error.platform = platform;
      this.SET_ERROR(error);
    }
    const error = this.state.info.error;
    assertIsDefined(error);
    console.error(`Streaming Error: ${error.message}`, error);
  }

  resetInfo() {
    this.RESET_STREAM_INFO();
  }

  resetError() {
    this.RESET_ERROR();
    if (this.state.info.checklist.startVideoTransmission === 'done') {
      this.UPDATE_STREAM_INFO({ lifecycle: 'live' });
    }
  }

  resetStreamInfo() {
    this.RESET_STREAM_INFO();
  }

  @mutation()
  private SET_ERROR(error: IStreamError) {
    this.state.info.error = error;
  }

  @mutation()
  private RESET_ERROR() {
    this.state.info.error = null;
  }

  @mutation()
  private SET_CHECKLIST_ITEM(
    itemName: keyof IStreamInfo['checklist'],
    state: TGoLiveChecklistItemState,
  ) {
    Vue.set(this.state.info, 'checklist', { ...this.state.info.checklist, [itemName]: state });
  }

  @mutation()
  private RESET_STREAM_INFO() {
    this.state.info = cloneDeep(StreamingService.initialState.info);
  }

  getModel() {
    return this.state;
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

  setSelectiveRecording(enabled: boolean) {
    // Selective recording cannot be toggled while live
    if (this.state.streamingStatus !== EStreamingState.Offline) return;

    if (enabled) this.usageStatisticsService.recordFeatureUsage('SelectiveRecording');

    this.SET_SELECTIVE_RECORDING(enabled);
    obs.Global.multipleRendering = enabled;
  }

  /**
   * @deprecated Use toggleStreaming instead
   */
  startStreaming() {
    this.toggleStreaming();
  }

  /**
   * @deprecated Use toggleStreaming instead
   */
  stopStreaming() {
    this.toggleStreaming();
  }

  async finishStartStreaming(): Promise<unknown> {
    // register a promise that we should reject or resolve in the `handleObsOutputSignal`
    const startStreamingPromise = new Promise((resolve, reject) => {
      this.resolveStartStreaming = resolve;
      this.rejectStartStreaming = reject;
    });

    const shouldConfirm = this.streamSettingsService.settings.warnBeforeStartingStream;

    if (shouldConfirm) {
      const goLive = await electron.remote.dialog.showMessageBox(Utils.getMainWindow(), {
        title: $t('Go Live'),
        type: 'warning',
        message: $t('Are you sure you want to start streaming?'),
        buttons: [$t('Cancel'), $t('Go Live')],
      });

      if (!goLive.response) {
        return Promise.reject();
      }
    }

    this.powerSaveId = electron.remote.powerSaveBlocker.start('prevent-display-sleep');

    obs.NodeObs.OBS_service_startStreaming();

    const recordWhenStreaming = this.streamSettingsService.settings.recordWhenStreaming;

    if (recordWhenStreaming && this.state.recordingStatus === ERecordingState.Offline) {
      this.toggleRecording();
    }

    const replayWhenStreaming = this.streamSettingsService.settings.replayBufferWhileStreaming;

    if (replayWhenStreaming && this.state.replayBufferStatus === EReplayBufferState.Offline) {
      this.startReplayBuffer();
    }

    startStreamingPromise
      .then(() => {
        // run afterGoLive hooks
        try {
          this.views.enabledPlatforms.forEach(platform => {
            getPlatformService(platform).afterGoLive();
          });
        } catch (e: unknown) {
          console.error('Error running afterGoLive for platform', e);
        }
      })
      .catch(() => {
        console.warn('startStreamingPromise was rejected');
      });

    return startStreamingPromise;
  }

  async toggleStreaming(options?: TStartStreamOptions, force = false) {
    if (this.state.streamingStatus === EStreamingState.Offline) {
      // in the "force" mode just try to start streaming without updating channel info
      if (force) {
        await this.finishStartStreaming();
        return Promise.resolve();
      }
      try {
        await this.goLive();
        return Promise.resolve();
      } catch (e: unknown) {
        return Promise.reject(e);
      }
    }

    if (
      this.state.streamingStatus === EStreamingState.Starting ||
      this.state.streamingStatus === EStreamingState.Live ||
      this.state.streamingStatus === EStreamingState.Reconnecting
    ) {
      const shouldConfirm = this.streamSettingsService.settings.warnBeforeStoppingStream;

      if (shouldConfirm) {
        const endStream = await electron.remote.dialog.showMessageBox(Utils.getMainWindow(), {
          title: $t('End Stream'),
          type: 'warning',
          message: $t('Are you sure you want to stop streaming?'),
          buttons: [$t('Cancel'), $t('End Stream')],
        });

        if (!endStream.response) return;
      }

      if (this.powerSaveId) {
        electron.remote.powerSaveBlocker.stop(this.powerSaveId);
      }

      obs.NodeObs.OBS_service_stopStreaming(false);

      const keepRecording = this.streamSettingsService.settings.keepRecordingWhenStreamStops;
      if (!keepRecording && this.state.recordingStatus === ERecordingState.Recording) {
        this.toggleRecording();
      }

      const keepReplaying = this.streamSettingsService.settings.keepReplayBufferStreamStops;
      if (!keepReplaying && this.state.replayBufferStatus === EReplayBufferState.Running) {
        this.stopReplayBuffer();
      }

      this.windowsService.closeChildWindow();
      this.views.enabledPlatforms.forEach(platform => {
        const service = getPlatformService(platform);
        if (service.afterStopStream) service.afterStopStream();
      });
      this.UPDATE_STREAM_INFO({ lifecycle: 'empty' });
      return Promise.resolve();
    }

    if (this.state.streamingStatus === EStreamingState.Ending) {
      obs.NodeObs.OBS_service_stopStreaming(true);
      return Promise.resolve();
    }
  }

  /**
   * @deprecated Use toggleRecording instead
   */
  startRecording() {
    this.toggleRecording();
  }

  /**
   * @deprecated Use toggleRecording instead
   */
  stopRecording() {
    this.toggleRecording();
  }

  toggleRecording() {
    if (this.state.recordingStatus === ERecordingState.Recording) {
      obs.NodeObs.OBS_service_stopRecording();
      return;
    }

    if (this.state.recordingStatus === ERecordingState.Offline) {
      obs.NodeObs.OBS_service_startRecording();
      return;
    }
  }

  startReplayBuffer() {
    if (this.state.replayBufferStatus !== EReplayBufferState.Offline) return;
    this.usageStatisticsService.recordFeatureUsage('ReplayBuffer');
    obs.NodeObs.OBS_service_startReplayBuffer();
  }

  stopReplayBuffer() {
    if (this.state.replayBufferStatus === EReplayBufferState.Running) {
      obs.NodeObs.OBS_service_stopReplayBuffer(false);
    } else if (this.state.replayBufferStatus === EReplayBufferState.Stopping) {
      obs.NodeObs.OBS_service_stopReplayBuffer(true);
    }
  }

  saveReplay() {
    if (this.state.replayBufferStatus === EReplayBufferState.Running) {
      this.SET_REPLAY_BUFFER_STATUS(EReplayBufferState.Saving);
      this.replayBufferStatusChange.next(EReplayBufferState.Saving);
      obs.NodeObs.OBS_service_processReplayBufferHotkey();
    }
  }

  showGoLiveWindow() {
    const height = this.views.linkedPlatforms.length > 1 ? 750 : 650;
    const width = 900;

    const isLegacy =
      !this.incrementalRolloutService.views.featureIsEnabled(EAvailableFeatures.reactGoLive) ||
      this.customizationService.state.experimental?.legacyGoLive;

    const componentName = isLegacy ? 'GoLiveWindowDeprecated' : 'GoLiveWindow';

    this.windowsService.showWindow({
      componentName,
      title: $t('Go Live'),
      size: {
        height,
        width,
      },
    });
  }

  showEditStream() {
    const height = 750;
    const width = 900;

    const isLegacy =
      !this.incrementalRolloutService.views.featureIsEnabled(EAvailableFeatures.reactGoLive) ||
      this.customizationService.state.experimental?.legacyGoLive;

    const componentName = isLegacy ? 'EditStreamWindowDeprecated' : 'EditStreamWindow';

    this.windowsService.showWindow({
      componentName,
      title: $t('Update Stream Info'),
      size: {
        height,
        width,
      },
    });
  }

  get delayEnabled() {
    return this.streamSettingsService.settings.delayEnable;
  }

  get delaySeconds() {
    return this.streamSettingsService.settings.delaySec;
  }

  get delaySecondsRemaining() {
    if (!this.delayEnabled) return 0;

    if (
      this.state.streamingStatus === EStreamingState.Starting ||
      this.state.streamingStatus === EStreamingState.Ending
    ) {
      const elapsedTime = moment().unix() - this.streamingStateChangeTime.unix();
      return Math.max(this.delaySeconds - elapsedTime, 0);
    }

    return 0;
  }

  /**
   * Gives a formatted time that the streaming output has been in
   * its current state.
   */
  get formattedDurationInCurrentStreamingState() {
    const formattedTime = this.formattedDurationSince(this.streamingStateChangeTime);
    if (formattedTime === '07:50:00' && this.userService?.platform?.type === 'facebook') {
      const msg = $t('You are 10 minutes away from the 8 hour stream limit');
      const existingTimeupNotif = this.notificationsService.views
        .getUnread()
        .filter((notice: INotification) => notice.message === msg);
      if (existingTimeupNotif.length !== 0) return formattedTime;
      this.notificationsService.push({
        type: ENotificationType.INFO,
        lifeTime: 600000,
        showTime: true,
        message: msg,
      });
    }
    return formattedTime;
  }

  get formattedDurationInCurrentRecordingState() {
    return this.formattedDurationSince(moment(this.state.recordingStatusTime));
  }

  get streamingStateChangeTime() {
    return moment(this.state.streamingStatusTime);
  }

  private sendReconnectingNotification() {
    const msg = $t('Stream has disconnected, attempting to reconnect.');
    const existingReconnectNotif = this.notificationsService.views
      .getUnread()
      .filter((notice: INotification) => notice.message === msg);
    if (existingReconnectNotif.length !== 0) return;
    this.notificationsService.push({
      type: ENotificationType.WARNING,
      subType: ENotificationSubType.DISCONNECTED,
      lifeTime: -1,
      showTime: true,
      message: msg,
    });
  }

  private clearReconnectingNotification() {
    const notice = this.notificationsService.views
      .getAll()
      .find(
        (notice: INotification) =>
          notice.message === $t('Stream has disconnected, attempting to reconnect.'),
      );
    if (!notice) return;
    this.notificationsService.markAsRead(notice.id);
  }

  private formattedDurationSince(timestamp: moment.Moment) {
    const duration = moment.duration(moment().diff(timestamp));
    const seconds = padStart(duration.seconds().toString(), 2, '0');
    const minutes = padStart(duration.minutes().toString(), 2, '0');
    const dayHours = duration.days() * 24;
    const hours = padStart((dayHours + duration.hours()).toString(), 2, '0');

    return `${hours}:${minutes}:${seconds}`;
  }

  private outputErrorOpen = false;

  private handleOBSOutputSignal(info: IOBSOutputSignalInfo) {
    console.debug('OBS Output signal: ', info);

    const time = new Date().toISOString();

    if (info.type === EOBSOutputType.Streaming) {
      if (info.signal === EOBSOutputSignal.Start) {
        this.SET_STREAMING_STATUS(EStreamingState.Live, time);
        this.resolveStartStreaming();
        this.streamingStatusChange.next(EStreamingState.Live);

        let streamEncoderInfo: Partial<IOutputSettings> = {};
        let game: string = '';

        try {
          streamEncoderInfo = this.outputSettingsService.getSettings();
          game = this.views.commonFields.game;
        } catch (e: unknown) {
          console.error('Error fetching stream encoder info: ', e);
        }

        const eventMetadata: Dictionary<any> = {
          ...streamEncoderInfo,
          game,
        };

        if (this.videoEncodingOptimizationService.state.useOptimizedProfile) {
          eventMetadata.useOptimizedProfile = true;
        }

        const streamSettings = this.streamSettingsService.settings;

        eventMetadata.streamType = streamSettings.streamType;
        eventMetadata.platform = streamSettings.platform;
        eventMetadata.server = streamSettings.server;

        this.usageStatisticsService.recordEvent('stream_start', eventMetadata);
        this.usageStatisticsService.recordAnalyticsEvent('StreamingStatus', {
          code: info.code,
          status: EStreamingState.Live,
          service: streamSettings.service,
        });
        this.usageStatisticsService.recordFeatureUsage('Streaming');
      } else if (info.signal === EOBSOutputSignal.Starting) {
        this.SET_STREAMING_STATUS(EStreamingState.Starting, time);
        this.streamingStatusChange.next(EStreamingState.Starting);
      } else if (info.signal === EOBSOutputSignal.Stop) {
        this.SET_STREAMING_STATUS(EStreamingState.Offline, time);
        this.RESET_STREAM_INFO();
        this.rejectStartStreaming();
        this.streamingStatusChange.next(EStreamingState.Offline);
        this.usageStatisticsService.recordAnalyticsEvent('StreamingStatus', {
          code: info.code,
          status: EStreamingState.Offline,
        });
      } else if (info.signal === EOBSOutputSignal.Stopping) {
        this.sendStreamEndEvent();
        this.SET_STREAMING_STATUS(EStreamingState.Ending, time);
        this.streamingStatusChange.next(EStreamingState.Ending);
      } else if (info.signal === EOBSOutputSignal.Reconnect) {
        this.SET_STREAMING_STATUS(EStreamingState.Reconnecting);
        this.streamingStatusChange.next(EStreamingState.Reconnecting);
        this.sendReconnectingNotification();
      } else if (info.signal === EOBSOutputSignal.ReconnectSuccess) {
        this.SET_STREAMING_STATUS(EStreamingState.Live);
        this.streamingStatusChange.next(EStreamingState.Live);
        this.clearReconnectingNotification();
      }
    } else if (info.type === EOBSOutputType.Recording) {
      const nextState: ERecordingState = ({
        [EOBSOutputSignal.Start]: ERecordingState.Recording,
        [EOBSOutputSignal.Starting]: ERecordingState.Starting,
        [EOBSOutputSignal.Stop]: ERecordingState.Offline,
        [EOBSOutputSignal.Stopping]: ERecordingState.Stopping,
      } as Dictionary<ERecordingState>)[info.signal];

      if (info.signal === EOBSOutputSignal.Start) {
        this.usageStatisticsService.recordFeatureUsage('Recording');
        this.usageStatisticsService.recordAnalyticsEvent('RecordingStatus', {
          status: nextState,
          code: info.code,
        });
      }

      this.SET_RECORDING_STATUS(nextState, time);
      this.recordingStatusChange.next(nextState);
    } else if (info.type === EOBSOutputType.ReplayBuffer) {
      const nextState: EReplayBufferState = ({
        [EOBSOutputSignal.Start]: EReplayBufferState.Running,
        [EOBSOutputSignal.Stopping]: EReplayBufferState.Stopping,
        [EOBSOutputSignal.Stop]: EReplayBufferState.Offline,
        [EOBSOutputSignal.Wrote]: EReplayBufferState.Running,
        [EOBSOutputSignal.WriteError]: EReplayBufferState.Running,
      } as Dictionary<EReplayBufferState>)[info.signal];

      if (nextState) {
        this.SET_REPLAY_BUFFER_STATUS(nextState, time);
        this.replayBufferStatusChange.next(nextState);
      }

      if (info.signal === EOBSOutputSignal.Wrote) {
        this.usageStatisticsService.recordAnalyticsEvent('ReplayBufferStatus', {
          status: 'wrote',
          code: info.code,
        });
        this.replayBufferFileWrite.next(obs.NodeObs.OBS_service_getLastReplay());
      }
    }

    if (info.code) {
      if (this.outputErrorOpen) {
        console.warn('Not showing error message because existing window is open.', info);
        return;
      }

      let errorText = '';
      let extendedErrorText = '';
      let linkToDriverInfo = false;
      let showNativeErrorMessage = false;

      if (info.code === obs.EOutputCode.BadPath) {
        errorText = $t(
          'Invalid Path or Connection URL.  Please check your settings to confirm that they are valid.',
        );
      } else if (info.code === obs.EOutputCode.ConnectFailed) {
        errorText = $t(
          'Failed to connect to the streaming server.  Please check your internet connection.',
        );
      } else if (info.code === obs.EOutputCode.Disconnected) {
        errorText = $t(
          'Disconnected from the streaming server.  Please check your internet connection.',
        );
      } else if (info.code === obs.EOutputCode.InvalidStream) {
        errorText = $t(
          'Could not access the specified channel or stream key. Please log out and back in to refresh your credentials. If the problem persists, there may be a problem connecting to the server.',
        );
      } else if (info.code === obs.EOutputCode.NoSpace) {
        errorText = $t('There is not sufficient disk space to continue recording.');
      } else if (info.code === obs.EOutputCode.Unsupported) {
        errorText =
          $t(
            'The output format is either unsupported or does not support more than one audio track.  ',
          ) + $t('Please check your settings and try again.');
      } else if (info.code === obs.EOutputCode.OutdatedDriver) {
        linkToDriverInfo = true;
        errorText = $t(
          'An error occurred with the output. This is usually caused by out of date video drivers. Please ensure your Nvidia or AMD drivers are up to date and try again.',
        );
      } else {
        // -4 is used for generic unknown messages in OBS. Both -4 and any other code
        // we don't recognize should fall into this branch and show a generic error.
        errorText = $t(
          'An error occurred with the output. Please check your streaming and recording settings.',
        );
        if (info.error) {
          showNativeErrorMessage = true;
          extendedErrorText = errorText + '\n\n' + $t('System error message:') + info.error + '"';
        }
      }
      const buttons = [$t('OK')];

      const title = {
        [EOBSOutputType.Streaming]: $t('Streaming Error'),
        [EOBSOutputType.Recording]: $t('Recording Error'),
        [EOBSOutputType.ReplayBuffer]: $t('Replay Buffer Error'),
      }[info.type];

      if (linkToDriverInfo) buttons.push($t('Learn More'));
      if (showNativeErrorMessage) buttons.push($t('More'));

      this.outputErrorOpen = true;
      const errorType = 'error';
      electron.remote.dialog
        .showMessageBox(Utils.getMainWindow(), {
          buttons,
          title,
          type: errorType,
          message: errorText,
        })
        .then(({ response }) => {
          if (linkToDriverInfo && response === 1) {
            this.outputErrorOpen = false;
            electron.remote.shell.openExternal(
              'https://howto.streamlabs.com/streamlabs-obs-19/nvidia-graphics-driver-clean-install-tutorial-7000',
            );
          } else {
            let expectedResponse = 1;
            if (linkToDriverInfo) {
              expectedResponse = 2;
            }
            if (showNativeErrorMessage && response === expectedResponse) {
              const buttons = [$t('OK')];
              electron.remote.dialog
                .showMessageBox({
                  buttons,
                  title,
                  type: errorType,
                  message: extendedErrorText,
                })
                .then(({ response }) => {
                  this.outputErrorOpen = false;
                })
                .catch(() => {
                  this.outputErrorOpen = false;
                });
            } else {
              this.outputErrorOpen = false;
            }
          }
        })
        .catch(() => {
          this.outputErrorOpen = false;
        });
      this.windowsService.actions.closeChildWindow();
    }
  }

  private sendStreamEndEvent() {
    const data: Dictionary<any> = {};
    data.viewerCounts = {};
    data.duration = Math.round(moment().diff(moment(this.state.streamingStatusTime)) / 1000);

    if (this.views.protectedModeEnabled) {
      data.platforms = this.views.enabledPlatforms;

      this.views.customDestinations.forEach(() => {
        data.platforms.push('custom_rtmp');
      });

      this.views.enabledPlatforms.forEach(platform => {
        const service = getPlatformService(platform);

        if (service.hasCapability('viewerCount')) {
          data.viewerCounts[platform] = {
            average: service.averageViewers,
            peak: service.peakViewers,
          };
        }
      });
    } else {
      data.platforms = ['custom_rtmp'];
    }

    this.recordGoals(data.duration);
    this.usageStatisticsService.recordEvent('stream_end', data);
  }

  private recordGoals(duration: number) {
    if (!this.userService.isLoggedIn) return;
    const hoursStreamed = Math.floor(duration / 60 / 60);
    this.growService.incrementGoal('stream_hours_per_month', hoursStreamed);
    this.growService.incrementGoal('stream_times_per_week', 1);
    if (this.restreamService.settings.enabled) {
      this.growService.incrementGoal('multistream_per_week', 1);
    }
  }

  /**
   * Used to track in aggregate which overlays streamers are using
   * most often for which games, in order to offer a better search
   * experience in the overlay library.
   * @param game the name of the game
   */
  createGameAssociation(game: string) {
    const url = `https://${this.hostsService.overlays}/api/overlay-games-association`;

    const headers = authorizedHeaders(this.userService.apiToken);
    headers.append('Content-Type', 'application/x-www-form-urlencoded');

    const body = `game=${encodeURIComponent(game)}`;
    const request = new Request(url, { headers, body, method: 'POST' });

    // This is best effort data gathering, don't explicitly handle errors
    return fetch(request);
  }

  @mutation()
  private SET_STREAMING_STATUS(status: EStreamingState, time?: string) {
    this.state.streamingStatus = status;
    if (time) this.state.streamingStatusTime = time;
  }

  @mutation()
  private SET_RECORDING_STATUS(status: ERecordingState, time: string) {
    this.state.recordingStatus = status;
    this.state.recordingStatusTime = time;
  }

  @mutation()
  private SET_REPLAY_BUFFER_STATUS(status: EReplayBufferState, time?: string) {
    this.state.replayBufferStatus = status;
    if (time) this.state.replayBufferStatusTime = time;
  }

  @mutation()
  private SET_SELECTIVE_RECORDING(enabled: boolean) {
    this.state.selectiveRecording = enabled;
  }

  @mutation()
  private SET_WARNING(warningType: 'YT_AUTO_START_IS_DISABLED') {
    this.state.info.warning = warningType;
  }

  @mutation()
  private SET_GO_LIVE_SETTINGS(settings: IGoLiveSettings) {
    this.state.info.settings = settings;
  }
}
