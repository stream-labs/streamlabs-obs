import { cloneDeep } from 'lodash';
import { Services } from '../../service-provider';
import {
  FacebookService,
  IFacebookLiveVideo,
  IFacebookLiveVideoExtended,
  IFacebookStartStreamOptions,
  IFacebookUpdateVideoOptions,
  TDestinationType,
} from '../../../services/platforms/facebook';
import { FormInstance } from 'antd/lib/form';
import { getPlatformService, TPlatform } from '../../../services/platforms';
import { assertIsDefined, getDefined } from '../../../util/properties-type-guards';
import {
  IYoutubeLiveBroadcast,
  IYoutubeStartStreamOptions,
} from '../../../services/platforms/youtube';
import { mutation } from '../../store';
import { Moment } from 'moment';
import { message } from 'antd';
import { $t } from '../../../services/i18n';
import { IStreamError } from '../../../services/streaming/stream-error';
import { useModule } from '../../hooks/useModule';

/**
 * Represents a single stream event
 * for displaying it in the StreamScheduler
 */
export interface IStreamEvent {
  /**
   * Event id correspond to `broadcastId` for YT
   * and to `liveVideoId` for FB
   */
  id: string;
  /**
   * The platform event belongs to
   */
  platform: TPlatform;
  /**
   * All possible event statuses are narrowed down to only 2 options
   */
  status: 'completed' | 'scheduled';
  /**
   * Stream title
   */
  title: string;
  /**
   * Scheduled date timestamp
   */
  date: number;
  /**
   * We need additional fields for FB to properly handle actions with this event
   */
  facebook?: {
    destinationType: TDestinationType;
    destinationId: string;
  };
}

/**
 * Represents settings for platforms in the StreamScheduler
 */
interface ISchedulerPlatformSettings extends Partial<Record<TPlatform, Object>> {
  youtube?: IYoutubeStartStreamOptions;
  facebook?: IFacebookStartStreamOptions;
}

/**
 * A hook for using the StreamSchedulerModule module in components
 */
export function useStreamScheduler() {
  // call `.select()` so all getters and state returned from the hook will be reactive
  return useModule(StreamSchedulerModule).select();
}

/**
 * A module for the StreamScheduler component
 * The module controls the components' state and provides actions
 */
class StreamSchedulerModule {
  state = {
    /**
     * `true` if should show a spinner in the modal window
     */
    isLoading: false,
    /**
     * when set to `false` we show a spinner on a calendar component
     */
    isEventsLoaded: false,
    /**
     * Keep loaded events here in the unified `IStreamEvent` format
     */
    events: [] as IStreamEvent[],
    /**
     * Show the modal if `true`
     */
    isModalVisible: false,
    /**
     * Keeps the selected event id
     */
    selectedEventId: '',
    /**
     * This time will be used for creating a new event
     */
    time: 0,
    /**
     * The platform that will be selected in the modal
     */
    selectedPlatform: this.platforms[0],
    /**
     * Keep settings for the platforms here while editing
     * Fill out the default settings for each platform
     */
    platformSettings: this.defaultPlatformSettings,
  };

  /**
   * Load all events into state on module init
   */
  init() {
    this.loadEvents();
  }

  /**
   * Returns default settings for prepopulating input fields in the Modal
   */
  get defaultPlatformSettings(): ISchedulerPlatformSettings {
    const defaultSettings = {
      facebook: cloneDeep(Services.FacebookService.state.settings) as IFacebookUpdateVideoOptions,
      youtube: cloneDeep(Services.YoutubeService.state.settings),
    };
    defaultSettings.youtube.broadcastId = '';
    defaultSettings.facebook.liveVideoId = '';
    return defaultSettings;
  }

  // antd form instance
  public form: FormInstance;

  /**
   * The modal component should set the form
   * so we can use the `submit` action in the module
   */
  setForm(form: FormInstance) {
    this.form = form;
  }

  get streamingView() {
    return Services.StreamingService.views;
  }

  get selectedEvent() {
    return this.state.events.find(ev => this.state.selectedEventId === ev.id);
  }

  /**
   * Prepopulates platforms and loads FB and YT events
   */
  private async loadEvents() {
    this.reset();
    // load fb and yt events simultaneously
    const [fbEvents, ytEvents] = await Promise.all([this.fetchFbEvents(), this.fetchYTBEvents()]);
    this.setEvents([...fbEvents, ...ytEvents]);
  }

  private async fetchYTBEvents() {
    if (!this.platforms.includes('youtube')) return [];
    const ytActions = Services.YoutubeService.actions;
    await ytActions.return.prepopulateInfo();
    const broadcasts = await ytActions.return.fetchBroadcasts();
    return broadcasts.map(broadcast => convertYTBroadcastToEvent(broadcast));
  }

  private async fetchFbEvents() {
    if (!this.platforms.includes('facebook')) return [];
    const fbActions = Services.FacebookService.actions;
    await fbActions.return.prepopulateInfo();
    const liveVideos = await fbActions.return.fetchAllVideos();
    return liveVideos.map(video => convertFBLiveVideoToEvent(video));
  }

  /**
   * Returns linked platforms that support scheduling
   */
  get platforms(): TPlatform[] {
    return this.streamingView.linkedPlatforms.filter(platform =>
      this.streamingView.supports('stream-schedule', [platform]),
    );
  }

  get isUpdateMode() {
    return !!this.state.selectedEventId;
  }

  get fbSettings(): IFacebookStartStreamOptions {
    return getDefined(this.state.platformSettings.facebook);
  }

  get ytSettings(): IYoutubeStartStreamOptions {
    return getDefined(this.state.platformSettings.youtube);
  }

  getPlatformDisplayName = this.streamingView.getPlatformDisplayName;

  /**
   * Shows a modal for creating a new event
   */
  @mutation()
  showNewEventModal(platform: TPlatform, selectedTime?: Moment) {
    const today = new Date().setHours(0, 0, 0, 0);
    const time = selectedTime?.valueOf() || this.state.time;
    const isPastDate = time < today;
    if (isPastDate) {
      message.error($t('You can not schedule to a past date'));
      return;
    }
    this.state.selectedPlatform = platform;
    this.state.isModalVisible = true;
    this.setTime(time.valueOf());
  }

  /**
   * Shows a modal for editing an existing event
   */
  async showEditEventModal(eventId: string) {
    const event = getDefined(this.state.events.find(ev => eventId === ev.id));
    if (event.platform === 'youtube') {
      const ytSettings = await Services.YoutubeService.actions.return.fetchStartStreamOptionsForBroadcast(
        event.id,
      );
      this.SHOW_EDIT_EVENT_MODAL(event, ytSettings);
    } else {
      const fbDestination = getDefined(event.facebook);
      const fbSettings = await Services.FacebookService.actions.return.fetchStartStreamOptionsForVideo(
        event.id,
        fbDestination.destinationType,
        fbDestination.destinationId,
      );
      this.SHOW_EDIT_EVENT_MODAL(event, fbSettings);
    }
  }

  /**
   * Validates and submits the event editor form
   */
  async submit() {
    // validate form
    try {
      await this.form.validateFields();
    } catch (e: unknown) {
      message.error($t('Invalid settings. Please check the form'));
      return;
    }

    this.showLoader();
    if (this.isUpdateMode) {
      this.saveExistingEvent();
    } else {
      this.saveNewEvent();
    }
  }

  /**
   * Saves the existing event via platform's API
   */
  private async saveExistingEvent() {
    const { selectedPlatform, selectedEventId } = this.state;
    const streamSettings = getDefined(this.state.platformSettings[selectedPlatform]);

    if (selectedPlatform === 'youtube') {
      // update YT event
      const ytSettings = cloneDeep(streamSettings) as IYoutubeStartStreamOptions;
      ytSettings.scheduledStartTime = this.state.time;
      const video = await Services.YoutubeService.actions.return.updateBroadcast(
        selectedEventId,
        ytSettings,
      );
      this.setEvent(video.id, convertYTBroadcastToEvent(video));
    } else {
      // update FB event
      const event = getDefined(this.selectedEvent);
      const fbOptions = getDefined(event.facebook);
      let video!: IFacebookLiveVideo;
      try {
        video = await Services.FacebookService.actions.return.updateLiveVideo(
          selectedEventId,
          streamSettings as IFacebookUpdateVideoOptions,
        );
      } catch (e: unknown) {
        this.handleError(e as IStreamError);
        return;
      }
      this.setEvent(video.id, convertFBLiveVideoToEvent({ ...video, ...fbOptions }));
    }
    this.closeModal();
  }

  /**
   * Create a new event via platform's API
   */
  private async saveNewEvent() {
    const { selectedPlatform, time } = this.state;
    const streamSettings = getDefined(this.state.platformSettings[selectedPlatform]);
    const service = getPlatformService(selectedPlatform);

    assertIsDefined(service.scheduleStream);
    let video!: IFacebookLiveVideo | IYoutubeLiveBroadcast;
    try {
      video = await service.scheduleStream(time, streamSettings);
    } catch (e: unknown) {
      this.handleError(e as IStreamError);
      return;
    }
    let event: IStreamEvent;
    if (selectedPlatform === 'youtube') {
      event = convertYTBroadcastToEvent(video as IYoutubeLiveBroadcast);
    } else {
      assertIsDefined(this.fbSettings);
      const fbSettings = getDefined(this.fbSettings);
      const destinationId = (service as FacebookService).views.getDestinationId(fbSettings);
      event = convertFBLiveVideoToEvent({
        ...video,
        destinationType: fbSettings.destinationType,
        destinationId,
      } as IFacebookLiveVideoExtended);
    }
    this.addEvent(event);
    this.closeModal();
  }

  /**
   * Handles errors from the platform's API
   */
  private handleError(err: IStreamError) {
    if (this.state.selectedPlatform === 'facebook') {
      message.error(
        $t(
          'Please schedule no further than 7 days in advance and no sooner than 10 minutes in advance.',
        ),
      );
    } else {
      message.error($t('Can not schedule the stream for the given date/time'));
    }
    this.hideLoader();
  }

  /**
   * Removes the event via platform's API
   * also deletes it from the module's state
   */
  remove() {
    const { selectedPlatform, selectedEventId } = this.state;
    this.showLoader();
    if (selectedPlatform === 'youtube') {
      Services.YoutubeService.actions.return.removeBroadcast(selectedEventId);
    } else {
      const event = getDefined(this.selectedEvent);
      const fbOptions = getDefined(event.facebook);
      Services.FacebookService.actions.return.removeLiveVideo(selectedEventId, fbOptions);
    }
    this.REMOVE_EVENT(selectedEventId);
    this.closeModal();
  }

  @mutation()
  private SHOW_EDIT_EVENT_MODAL(
    event: IStreamEvent,
    platformSettings: IYoutubeStartStreamOptions | IFacebookStartStreamOptions,
  ) {
    this.state.selectedEventId = event.id;
    this.state.selectedPlatform = event.platform;
    this.state.platformSettings[event.platform] = platformSettings as any;
    this.state.isModalVisible = true;
    this.state.time = event.date;
  }

  @mutation()
  closeModal() {
    this.state.selectedEventId = '';
    this.state.isModalVisible = false;
    this.state.platformSettings = this.defaultPlatformSettings;
    this.state.isLoading = false;
  }

  @mutation()
  updatePlatform<T extends TPlatform>(platform: T, patch: ISchedulerPlatformSettings[T]) {
    Object.assign(this.state.platformSettings[platform], patch);
  }

  @mutation()
  setTime(time: number) {
    this.state.time = time;
    if (this.state.selectedPlatform === 'facebook') {
      getDefined(this.state.platformSettings.facebook).plannedStartTime = time;
    } else {
      getDefined(this.state.platformSettings.youtube).scheduledStartTime = time;
    }
  }

  @mutation()
  private reset() {
    this.state.events = [];
    this.state.platformSettings = this.defaultPlatformSettings;
  }

  @mutation()
  private setEvents(events: IStreamEvent[]) {
    this.state.isEventsLoaded = true;
    this.state.events = events;
  }

  @mutation()
  private addEvent(event: IStreamEvent) {
    this.state.events.push(event);
  }

  @mutation()
  private setEvent(id: string, event: IStreamEvent) {
    const ind = this.state.events.findIndex(ev => ev.id === id);
    this.state.events.splice(ind, 1, event);
  }

  @mutation()
  private REMOVE_EVENT(id: string) {
    this.state.events = this.state.events.filter(ev => ev.id !== id);
  }

  /**
   * Shows a spinner in the modal window
   */
  @mutation()
  private showLoader() {
    this.state.isLoading = true;
  }

  /**
   * Shows a spinner in the modal window
   */
  @mutation()
  private hideLoader() {
    this.state.isLoading = false;
  }
}

/**
 * Converts YT broadcast to IStreamEvent
 */
function convertYTBroadcastToEvent(ytBroadcast: IYoutubeLiveBroadcast): IStreamEvent {
  let status: IStreamEvent['status'] = 'completed';
  if (
    ytBroadcast.status.lifeCycleStatus === 'created' ||
    ytBroadcast.status.lifeCycleStatus === 'ready'
  ) {
    status = 'scheduled';
  }

  return {
    platform: 'youtube',
    id: ytBroadcast.id,
    date: new Date(
      ytBroadcast.snippet.scheduledStartTime || ytBroadcast.snippet.actualStartTime,
    ).valueOf(),
    title: ytBroadcast.snippet.title,
    status,
  };
}

/**
 * Converts FB liveVideo to IStreamEvent
 */
function convertFBLiveVideoToEvent(fbLiveVideo: IFacebookLiveVideoExtended): IStreamEvent {
  return {
    platform: 'facebook',
    id: fbLiveVideo.id,
    date: new Date(fbLiveVideo.planned_start_time || fbLiveVideo.broadcast_start_time).valueOf(),
    title: fbLiveVideo.title,
    status: 'scheduled',
    facebook: {
      destinationType: fbLiveVideo.destinationType,
      destinationId: fbLiveVideo.destinationId,
    },
  };
}
