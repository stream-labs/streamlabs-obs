import { HostsService } from 'services/hosts';
import { StatefulService, Inject, mutation } from 'services/core';
import { UserService, LoginLifecycle } from 'services/user';
import { authorizedHeaders, handleResponse } from 'util/requests';
import { $t } from 'services/i18n';
import { WindowsService } from 'services/windows';
import { WebsocketService, TSocketEvent, IEventSocketEvent } from 'services/websocket';
import { pick, cloneDeep } from 'lodash';
import uuid from 'uuid/v4';
import { Subscription } from 'rxjs';
import mapValues from 'lodash/mapValues';

export interface IRecentEvent {
  name?: string;
  from?: string;
  type: string;
  platform: string;
  created_at: string;
  display_name?: string;
  from_display_name?: string;
  amount?: string;
  crate_item?: any;
  message?: string;
  product?: string;
  viewers?: number;
  host_type?: 'manual' | 'auto';
  raiders?: number;
  formatted_amount?: string;
  sub_plan?: string;
  months?: number;
  streak_months?: number;
  gifter?: string;
  currency?: string;
  skill?: string;
  since?: string;
  displayString?: string;
  comment?: string;
  title?: string;
  iso8601Created?: string;
  createdAt?: string;
  streamer?: string;
  giftType?: string;
  _id?: string;
  read: boolean;
  hash: string;
  isTest?: boolean;
  repeat?: boolean;
  // uuid is local and will NOT persist across app restarts/ fetches
  uuid: string;
}

interface IRecentEventsConfig {
  eventsPanelMuted: boolean;
  settings: IRecentEventFilterConfig;
}

interface IRecentEventFilterConfig {
  donation: boolean;
  merch: boolean;
  // Twitch
  follow?: boolean;
  subscription?: boolean;
  subscription_tier_1?: boolean;
  subscription_tier_2?: boolean;
  subscription_tier_3?: boolean;
  filter_subscription_3_months?: boolean;
  filter_subscription_6_months?: boolean;
  filter_subscription_9_months?: boolean;
  filter_subscription_12_months?: boolean;
  filter_subscription_minimum_enabled?: boolean;
  filter_subscription_minimum_months?: number;
  primesub?: boolean;
  resub?: boolean;
  resub_tier_1?: boolean;
  resub_tier_2?: boolean;
  resub_tier_3?: boolean;
  resub_prime?: boolean;
  gifted_sub?: boolean;
  gifted_sub_tier_1?: boolean;
  gifted_sub_tier_2?: boolean;
  gifted_sub_tier_3?: boolean;
  host?: boolean;
  bits?: boolean;
  raid?: boolean;
  // YouTube
  subscriber?: boolean;
  sponsor?: boolean;
  superchat?: boolean;
  // Mixer
  sticker?: boolean;
  effect?: boolean;
  // Facebook Live
  facebook_support?: boolean;
  facebook_like?: boolean;
  facebook_share?: boolean;
  facebook_stars?: boolean;
}

interface IRecentEventsState {
  recentEvents: IRecentEvent[];
  muted: boolean;
  mediaShareEnabled: boolean;
  filterConfig: IRecentEventFilterConfig;
  queuePaused: boolean;
}

const subscriptionMap = (subPlan: string) => {
  return {
    '1000': $t('Tier 1'),
    '2000': $t('Tier 2'),
    '3000': $t('Tier 3'),
    Prime: $t('Prime'),
  }[subPlan];
};

const filterName = (key: string): string => {
  return {
    donation: $t('Donations'),
    redemption: $t('Redemptions'),
    merch: $t('Merch'),
    follow: $t('Follows'),
    subscription: $t('Subs'),
    subscription_tier_1: $t('Tier 1'),
    subscription_tier_2: $t('Tier 2'),
    subscription_tier_3: $t('Tier 3'),
    filter_subscription_3_months: $t('3 Months'),
    filter_subscription_6_months: $t('6 Months'),
    filter_subscription_9_months: $t('9 Months'),
    filter_subscription_12_months: $t('12 Months'),
    filter_subscription_minimum_enabled: $t('Minimum'),
    filter_subscription_minimum_months: $t('months'),
    primesub: $t('Prime'),
    resub: $t('Resubs'),
    resub_tier_1: $t('Tier 1'),
    resub_tier_2: $t('Tier 2'),
    resub_tier_3: $t('Tier 3'),
    resub_prime: $t('Prime'),
    gifted_sub: $t('Gifted'),
    host: $t('Hosts'),
    bits: $t('Bits'),
    raid: $t('Raids'),
    subscriber: $t('Subscribers'),
    sponsor: $t('Members'),
    superchat: $t('Super Chats'),
    sticker: $t('Stickers'),
    effect: $t('Effects'),
    facebook_support: $t('Supports'),
    facebook_like: $t('Likes'),
    facebook_share: $t('Shares'),
    facebook_stars: $t('Stars'),
  }[key];
};

/**
 * This function duplicates per-event logic from streamlabs.com for
 * creating cache keys used in fetching read status of events and
 * serves as the best proxy for a unique identifier for each
 * event. Should be refactored when backend is rewritten for consistency
 */
function getHashForRecentEvent(event: IRecentEvent) {
  switch (event.type) {
    case 'donation':
      return [event.type, event.name, event.message, parseInt(event.amount, 10)].join(':');
    case 'bits':
      return [event.type, event.name, event.message, parseInt(event.amount, 10)].join(':');
    case 'donordrivedonation':
      return [event.type, event.name, event.message, parseInt(event.amount, 10)].join(':');
    case 'eldonation':
      return [event.type, event.name, event.message, parseInt(event.amount, 10)].join(':');
    case 'follow':
      return [event.type, event.name, event.message].join(':');
    case 'host':
      return [event.type, event.name, event.host_type].join(':');
    case 'justgivingdonation':
      return [event.type, event.name, event.message, parseInt(event.amount, 10)].join(':');
    case 'loyalty_store_redemption':
      return [event.type, event.from, event.message].join(':');
    case 'pledge':
      return [event.type, event.name, parseInt(event.amount, 10), event.from].join(':');
    case 'prime_sub_gift':
      return [event.type, event.name, event.streamer, event.giftType].join(':');
    case 'raid':
      return [event.type, event.name, event.from].join(':');
    case 'redemption':
      return [event.type, event.name, event.message].join(':');
    case 'sticker':
      return [event.name, event.type, event.currency].join(':');
    case 'subscription':
      return [event.type, event.name, event.message].join(':');
    case 'superchat':
      return [event.type, event.name, event.message].join(':');
    case 'superheart':
      return [event.type, event.name, event.message, parseInt(event.amount, 10)].join(':');
    case 'tiltifydonation':
      return [event.type, event.name, event.message, parseInt(event.amount, 10)].join(':');
    case 'treat':
      return [event.type, event.name, event.title, event.message, event.createdAt].join(':');
    case 'like':
      return [event.type, event.name, event._id].join(':');
    case 'share':
      return [event.type, event.name, event._id].join(':');
    case 'stars':
      return [event.type, event.name, event.message, parseInt(event.amount, 10)].join(':');
    case 'support':
      return [event.type, event.name, event._id].join(':');
    case 'merch':
      return [event.type, event.message, event.createdAt].join(':');
    default:
      return [event.type, event._id].join(':');
  }
}

const SUPPORTED_EVENTS = [
  'merch',
  'donation',
  'facemaskdonation',
  'follow',
  'subscription',
  'bits',
  'host',
  'raid',
  'sticker',
  'effect',
  'like',
  'stars',
  'support',
  'share',
  'superchat',
  'pledge',
  'eldonation',
  'tiltifydonation',
  'donordrivedonation',
  'justgivingdonation',
  'treat',
];

export class RecentEventsService extends StatefulService<IRecentEventsState> {
  @Inject() private hostsService: HostsService;
  @Inject() private userService: UserService;
  @Inject() private windowsService: WindowsService;
  @Inject() private websocketService: WebsocketService;

  static initialState: IRecentEventsState = {
    recentEvents: [],
    muted: false,
    mediaShareEnabled: false,
    filterConfig: {
      donation: false,
      merch: false,
    },
    queuePaused: false,
  };

  lifecycle: LoginLifecycle;
  socketConnection: Subscription = null;

  async initialize() {
    this.lifecycle = await this.userService.withLifecycle({
      init: this.syncEventsState,
      destroy: () => Promise.resolve(this.onLogout()),
      context: this,
    });
  }

  async syncEventsState() {
    const config = await this.fetchConfig();
    this.applyConfig(config);
    this.formEventsArray();
    this.fetchMediaShareState();
    this.subscribeToSocketConnection();
  }

  subscribeToSocketConnection() {
    this.socketConnection = this.websocketService.socketEvent.subscribe(ev =>
      this.onSocketEvent(ev),
    );
  }

  unsubscribeFromSocketConnection() {
    this.socketConnection.unsubscribe();
  }

  onLogout() {
    this.SET_RECENT_EVENTS([]);
    this.unsubscribeFromSocketConnection();
  }

  fetchRecentEvents(): Promise<{ data: Dictionary<IRecentEvent[]> }> {
    const typeString = this.getEventTypesString();
    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/recentevents/${
      this.userService.widgetToken
    }?types=${typeString}`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers });
    return fetch(request)
      .then(handleResponse)
      .catch(() => null);
  }

  async fetchConfig(): Promise<IRecentEventsConfig> {
    const url = `https://${
      this.hostsService.streamlabs
    }/api/v5/slobs/widget/config?widget=recent_events`;
    const headers = authorizedHeaders(this.userService.apiToken);
    return fetch(new Request(url, { headers }))
      .then(handleResponse)
      .catch(() => null);
  }

  fetchMediaShareState() {
    const url = `https://${
      this.hostsService.streamlabs
    }/api/v5/slobs/widget/config?widget=media-sharing`;
    const headers = authorizedHeaders(this.userService.apiToken);
    return fetch(new Request(url, { headers }))
      .then(handleResponse)
      .then(resp => this.SET_MEDIA_SHARE(resp.settings.advanced_settings.enabled));
  }

  refresh() {
    return this.formEventsArray();
  }

  private async formEventsArray() {
    const events = await this.fetchRecentEvents();
    let eventArray: IRecentEvent[] = [];
    if (!events.data) return;
    Object.keys(events.data).forEach(key => {
      const fortifiedEvents = events.data[key].map(event => {
        event.hash = getHashForRecentEvent(event);
        event.uuid = uuid();
        return event;
      });

      // This server response returns a ton of stuff. We remove the noise
      // before adding it to the store.
      const culledEvents = fortifiedEvents.map(event => {
        return pick(event, [
          'name',
          'from',
          'type',
          'platform',
          'created_at',
          'display_name',
          'from_display_name',
          'amount',
          'crate_item',
          'message',
          'product',
          'viewers',
          'host_type',
          'raiders',
          'formatted_amount',
          'sub_plan',
          'months',
          'streak_months',
          'gifter',
          'currency',
          'skill',
          'since',
          'displayString',
          'comment',
          'title',
          'read',
          'hash',
          'uuid',
        ]);
      });

      eventArray = eventArray.concat(culledEvents);
    });

    // Format string of keys to look for in server event cache
    const hashValues = eventArray.map(event => event.hash).join('|##|');

    // Get read status for all events
    const readReceipts = await this.fetchReadReceipts(hashValues);
    eventArray.forEach(event => {
      event.read = readReceipts[event.hash] ? readReceipts[event.hash] : false;

      // Events older than 1 month are treated as read
      if (new Date(event.created_at).getTime() < new Date().getTime() - 1000 * 60 * 60 * 24 * 30) {
        event.read = true;
      }
    });

    eventArray.sort((a: IRecentEvent, b: IRecentEvent) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    this.SET_RECENT_EVENTS(eventArray);
  }

  async fetchReadReceipts(hashValues: string): Promise<{ data: Dictionary<boolean> }> {
    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/readreceipts`;
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    const request = new Request(url, { headers });
    const body = JSON.stringify({
      hashValues,
    });
    return await fetch(new Request(url, { headers, body, method: 'POST' })).then(handleResponse);
  }

  async repeatAlert(event: IRecentEvent) {
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/widget/repeatalert`;
    const body = JSON.stringify({
      data: event,
      type: event.type,
      token: this.userService.widgetToken,
    });
    return await fetch(new Request(url, { headers, body, method: 'POST' })).then(handleResponse);
  }

  async readAlert(event: IRecentEvent) {
    this.TOGGLE_RECENT_EVENT_READ(event.uuid);
    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/widget/readalert`;
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    const body = JSON.stringify({
      eventHash: event.hash,
      read: event.read,
    });
    const request = new Request(url, { headers, body, method: 'POST' });
    return await fetch(request).then(handleResponse);
  }

  async postUpdateFilterPreferences() {
    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/widget/recentevents`;
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    const body = JSON.stringify(this.state.filterConfig);
    const request = new Request(url, { headers, body, method: 'POST' });
    return await fetch(request).then(handleResponse);
  }

  async skipAlert() {
    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/alerts/skip`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers, method: 'POST' });
    return await fetch(request).then(handleResponse);
  }

  async pauseAlertQueue() {
    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/alerts/pause_queue`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers, method: 'POST' });
    return fetch(request).then(handleResponse);
  }

  async unpauseAlertQueue() {
    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/alerts/unpause_queue`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers, method: 'POST' });
    return fetch(request).then(handleResponse);
  }

  get filters() {
    const mainFilters = pick(this.state.filterConfig, [
      'donation',
      'merch',
      'follow',
      'host',
      'bits',
      'raid',
      'subscriber',
      'sponsor',
      'superchat',
      'sticker',
      'effect',
      'facebook_support',
      'facebook_like',
      'facebook_share',
      'facebook_stars',
    ]);

    const subFilters = pick(this.state.filterConfig, [
      'subscription',
      'subscription_tier_1',
      'subscription_tier_2',
      'subscription_tier_3',
      'primesub',
      'gifted_sub',
    ]);

    const resubFilters = pick(this.state.filterConfig, [
      'resub',
      'resub_tier_1',
      'resub_tier_2',
      'resub_tier_3',
      'resub_prime',
      'filter_subscription_3_months',
      'filter_subscription_6_months',
      'filter_subscription_9_months',
      'filter_subscription_12_months',
      'filter_subscription_minimum_enabled',
    ]);

    const minimumMonths = pick(this.state.filterConfig, ['filter_subscription_minimum_months']);

    const main = mapValues(mainFilters, (value, key) => {
      return {
        value,
        name: filterName(key),
      };
    });

    const sub = mapValues(subFilters, (value, key) => {
      return {
        value,
        name: filterName(key),
      };
    });

    const resub = mapValues(resubFilters, (value, key) => {
      return {
        value,
        name: filterName(key),
      };
    });

    const minMonths = mapValues(minimumMonths, (value, key) => {
      return {
        value,
        name: filterName(key),
      };
    });

    return {
      main,
      sub,
      resub,
      minMonths,
    };
  }

  updateFilterPreference(key: string, value: boolean | number) {
    this.SET_SINGLE_FILTER_CONFIG(key, value);
    this.postUpdateFilterPreferences().then(() => {
      this.formEventsArray();
    });
  }

  getEventTypesString() {
    return Object.keys(this.state.filterConfig)
      .filter((type: string) => this.state.filterConfig[type] === true)
      .join(',');
  }

  applyConfig(config: IRecentEventsConfig) {
    this.SET_MUTED(config.eventsPanelMuted);
    this.SET_FILTER_CONFIG(config.settings);
  }

  getSubString(event: IRecentEvent) {
    if (event.platform === 'youtube_account') {
      return $t('has sponsored since %{date}', { date: event.since });
    }
    if (event.gifter) {
      return $t('has gifted a sub (%{tier}) to', {
        tier: subscriptionMap(event.sub_plan),
      });
    }
    if (event.months > 1 && event.streak_months && event.streak_months > 1) {
      return $t('has resubscribed (%{tier}) for %{streak} months in a row! (%{months} total)', {
        tier: subscriptionMap(event.sub_plan),
        streak: event.streak_months,
        months: event.months,
      });
    }
    if (event.months > 1) {
      return $t('has resubscribed (%{tier}) for %{months} months', {
        tier: subscriptionMap(event.sub_plan),
        months: event.months,
      });
    }
    return $t('has subscribed (%{tier})', { tier: subscriptionMap(event.sub_plan) });
  }

  onSocketEvent(e: TSocketEvent) {
    if (e.type === 'eventsPanelSettingsUpdate') {
      if (e.message.muted != null) {
        this.SET_MUTED(e.message.muted);
      }
    }

    if (e.type === 'pauseQueue') {
      this.SET_PAUSED(true);
    }

    if (e.type === 'unpauseQueue') {
      this.SET_PAUSED(false);
    }

    if (e.type === 'mediaSharingSettingsUpdate') {
      if (e.message.advanced_settings.enabled != null) {
        this.SET_MEDIA_SHARE(e.message.advanced_settings.enabled);
      }
    }

    if (SUPPORTED_EVENTS.includes(e.type)) {
      this.onEventSocket(e as IEventSocketEvent);
    }
  }

  shouldFilterSubscription(event: IRecentEvent) {
    if (!this.state.filterConfig.subscription) {
      return false;
    }

    if (!this.state.filterConfig.subscription_tier_1 && event.sub_plan.toString() === '1000') {
      return false;
    }

    if (!this.state.filterConfig.subscription_tier_2 && event.sub_plan.toString() === '2000') {
      return false;
    }

    if (!this.state.filterConfig.subscription_tier_3 && event.sub_plan.toString() === '3000') {
      return false;
    }

    if (!this.state.filterConfig.primesub && event.sub_plan.toString() === 'Prime') {
      return false;
    }

    if (!this.state.filterConfig.gifted_sub && event.gifter) {
      return false;
    }

    return true;
  }

  shouldFilterResub(event: IRecentEvent) {
    if (!this.state.filterConfig.resub) {
      return false;
    }

    if (!this.state.filterConfig.resub_tier_1 && event.sub_plan.toString() === '1000') {
      return false;
    }

    if (!this.state.filterConfig.resub_tier_2 && event.sub_plan.toString() === '2000') {
      return false;
    }

    if (!this.state.filterConfig.resub_tier_3 && event.sub_plan.toString() === '3000') {
      return false;
    }

    if (!this.state.filterConfig.resub_prime && event.sub_plan.toString() === 'Prime') {
      return false;
    }

    if (!this.state.filterConfig.gifted_sub && event.gifter) {
      return false;
    }

    if (!this.state.filterConfig.filter_subscription_3_months && event.months < 3) {
      return false;
    }

    if (!this.state.filterConfig.filter_subscription_6_months && event.months < 6) {
      return false;
    }

    if (!this.state.filterConfig.filter_subscription_9_months && event.months < 9) {
      return false;
    }

    if (!this.state.filterConfig.filter_subscription_12_months && event.months < 12) {
      return false;
    }

    if (
      this.state.filterConfig.filter_subscription_minimum_enabled &&
      event.months < this.state.filterConfig.filter_subscription_minimum_months
    ) {
      return false;
    }

    return true;
  }

  isAllowed(event: IRecentEvent) {
    if (event.type === 'subscription') {
      if (event.months > 1) {
        return this.shouldFilterResub(event);
      }
      return this.shouldFilterSubscription(event);
    }
    return this.transformFilterForFB()[event.type];
  }

  transformFilterForFB() {
    const filterMap = cloneDeep(this.state.filterConfig);
    if (this.userService.platform.type === 'facebook') {
      filterMap['support'] = filterMap['facebook_support'];
      filterMap['like'] = filterMap['facebook_like'];
      filterMap['share'] = filterMap['facebook_share'];
      filterMap['stars'] = filterMap['facebook_stars'];
    }
    return filterMap;
  }

  onEventSocket(e: IEventSocketEvent) {
    const messages = e.message
      .filter(msg => !msg.isTest && !msg.repeat)
      .map(msg => {
        msg.type = e.type;
        msg.hash = getHashForRecentEvent(msg);
        msg.uuid = uuid();
        msg.read = false;
        msg.iso8601Created = new Date().toISOString();
        return msg;
      })
      .filter(msg => this.isAllowed(msg));

    this.ADD_RECENT_EVENT(messages);
  }

  getEventString(event: IRecentEvent) {
    return {
      donation:
        $t('has donated') +
        (event.crate_item ? $t(' with %{name}', { name: event.crate_item.name }) : ''),
      merch: $t('has purchased %{product} from the store', { product: event.product }),
      follow: event.platform === 'youtube_account' ? $t('has subscribed') : $t('has followed'),
      subscription: this.getSubString(event),
      // Twitch
      bits: $t('has used'),
      host: $t('has hosted you with %{viewers} viewers', { viewers: event.viewers }),
      raid: $t('has raided you with a party of %{viewers}', { viewers: event.raiders }),
      // Mixer
      sticker: $t('has used %{skill} for', { skill: event.skill }),
      effect: $t('has used %{skill} for', { skill: event.skill }),
      // Facebook
      like: $t('has liked'),
      stars: $t('has used'),
      support: $t('has supported for %{mounths} months', { months: event.months }),
      share: $t('has shared'),
      // Youtube
      superchat: $t('has superchatted'),
      // Integrations
      pledge: $t('has pledged on Patreon'),
      eldonation: $t('has donated to ExtraLife'),
      tiltifydonation: $t('has donated to Tiltify'),
      donordrivedonation: $t('has donated to Donor Drive'),
      justgivingdonation: $t('has donated to Just Giving'),
      treat: $t('has given a treat %{title}', { title: event.title }),
    }[event.type];
  }

  async toggleMuteEvents() {
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    const url = `https://${
      this.hostsService.streamlabs
    }/api/v5/slobs/widget/recentevents/eventspanel`;
    const body = JSON.stringify({ muted: !this.state.muted });
    return await fetch(new Request(url, { headers, body, method: 'POST' })).then(handleResponse);
  }

  async toggleQueue() {
    try {
      this.state.queuePaused ? await this.unpauseAlertQueue() : await this.pauseAlertQueue();
    } catch (e) {}
  }

  openRecentEventsWindow(isMediaShare?: boolean) {
    this.windowsService.createOneOffWindow(
      {
        componentName: 'RecentEvents',
        queryParams: { isMediaShare },
        title: $t('Recent Events'),
        size: { width: 800, height: 600 },
      },
      'RecentEvents',
    );
  }

  showFilterMenu() {
    this.windowsService.showWindow({
      componentName: 'MiniFeed',
      title: $t('Event Filters'),
      queryParams: {},
      size: {
        width: 450,
        height: 600,
      },
    });
  }

  @mutation()
  private ADD_RECENT_EVENT(events: IRecentEvent[]) {
    this.state.recentEvents = events.concat(this.state.recentEvents);
  }

  @mutation()
  private TOGGLE_RECENT_EVENT_READ(uuid: string) {
    this.state.recentEvents.forEach(event => {
      if (event.uuid === uuid) {
        event.read = !event.read;
      }
    });
  }

  @mutation()
  private SET_RECENT_EVENTS(eventArray: IRecentEvent[]) {
    this.state.recentEvents = eventArray;
  }

  @mutation()
  private SET_MUTED(muted: boolean) {
    this.state.muted = muted;
  }

  @mutation()
  private SET_MEDIA_SHARE(enabled: boolean) {
    this.state.mediaShareEnabled = enabled;
  }

  @mutation()
  private SET_FILTER_CONFIG(settings: IRecentEventFilterConfig) {
    this.state.filterConfig = settings;
  }

  @mutation()
  private SET_SINGLE_FILTER_CONFIG(key: string, value: boolean | number) {
    this.state.filterConfig[key] = value;
  }

  @mutation()
  private SET_PAUSED(queuePaused: boolean) {
    this.state.queuePaused = queuePaused;
  }
}
