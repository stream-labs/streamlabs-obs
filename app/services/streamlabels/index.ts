import { Service } from 'services/core/service';
import { UserService } from 'services/user';
import { Inject } from 'services/core/injector';
import { HostsService } from 'services/hosts';
import { authorizedHeaders, handleResponse } from 'util/requests';
import { TSocketEvent, WebsocketService } from 'services/websocket';
import { AppService } from 'services/app';
import { InitAfter } from '../core';
import { BehaviorSubject } from 'rxjs';

interface IStreamlabelActiveSubscriptions {
  filename: string;
  subscribers: string[];
}

export interface IStreamlabelSettings {
  format: string;
  item_format?: string;
  item_separator?: string;
  limit?: number;
  duration?: number;
  show_clock?: 'always' | 'active';
  show_count?: 'always' | 'active';
  show_latest?: 'always' | 'active';
  include_resubs?: boolean;
}

interface ITrainInfo {
  mostRecentEventAt: number;
  mostRecentName: string;
  counter: number;
  setting: string;
}

interface IDonationTrainInfo extends ITrainInfo {
  mostRecentAmount: number;
  totalAmount: number;
  donationTrain: boolean;
}

interface ITrains {
  donation: IDonationTrainInfo;
  subscription: ITrainInfo;
  follow: ITrainInfo;
}

export interface IStreamlabelSet {
  [categoryName: string]: IStreamlabelCategory;
}

export interface IStreamlabelCategory {
  label: string;
  files: IStreamlabelDefinition[];
}

export interface IStreamlabelDefinition {
  name: string;
  label: string;
  settings: IStreamlabelSettingsDefinition;
}

export interface IStreamlabelSettingsDefinition {
  format?: { tokens: string[] };
  item_format?: { tokens: string[] };
  item_separator?: { tokens: string[] };
  settingsStat?: string;
  settingsWhitelist?: string[];
}

type TTrainType = 'donation' | 'follow' | 'subscription';

function isDonationTrain(train: ITrainInfo | IDonationTrainInfo): train is IDonationTrainInfo {
  return (train as IDonationTrainInfo).donationTrain;
}

const capitalize = (val: string) =>
  val
    .split('_')
    .map(word => `${word[0].toLocaleUpperCase()}${word.slice(1)}`)
    .join(' ');

@InitAfter('UserService')
export class StreamlabelsService extends Service {
  @Inject() userService: UserService;
  @Inject() hostsService: HostsService;
  @Inject() websocketService: WebsocketService;
  @Inject() appService: AppService;

  /**
   * Represents the raw string value of the sources
   */
  output = new BehaviorSubject({});

  /**
   * Represents settings which are stored on the server
   */
  settings: Dictionary<IStreamlabelSettings> = {};

  /**
   * Holds info about currently active subscribers
   */
  subscriptions: Dictionary<IStreamlabelActiveSubscriptions> = {};

  trainInterval: number;

  socket: SocketIOClient.Socket;

  /**
   * Holds data about the currently running trains.
   * Will be updated by socket events and be used to
   * generate output.
   */
  trains: ITrains = {
    donation: {
      mostRecentEventAt: null,
      mostRecentName: null,
      counter: 0,
      mostRecentAmount: null,
      totalAmount: 0,
      donationTrain: true,
      setting: 'train_tips',
    },
    subscription: {
      mostRecentEventAt: null,
      mostRecentName: null,
      counter: 0,
      setting: 'train_twitch_subscriptions',
    },
    follow: {
      mostRecentEventAt: null,
      mostRecentName: null,
      counter: 0,
      setting: 'train_twitch_follows',
    },
  };

  async init() {
    this.initSocketConnection();
    this.initTrainClockInterval();

    this.userService.userLogin.subscribe(() => {
      this.onUserLogin();
    });
  }

  onUserLogin() {
    this.fetchInitialData();
    this.fetchSettings();
    this.fetchDefinitions();
  }

  getSettingsForStat(statname: string) {
    const settings = { ...this.settings[statname] };

    if (settings.item_separator) {
      settings.item_separator = settings.item_separator.replace(/\n/gi, '\\n');
    }

    return settings;
  }

  setSettingsForStat(statname: string, settings: IStreamlabelSettings): Promise<boolean> {
    if (settings.item_separator) {
      settings.item_separator = settings.item_separator.replace(/\\n/gi, '\n');
    }

    this.settings[statname] = {
      ...this.settings[statname],
      ...settings,
    };

    // Because trains are client-side, we can force a fast update
    if (['train_tips', 'train_twitch_follows', 'train_twitch_subscriptions'].includes(statname)) {
      this.outputAllTrains();
    }

    const headers = authorizedHeaders(this.userService.apiToken);
    headers.append('Content-Type', 'application/json');

    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/stream-labels/settings`;
    const request = new Request(url, {
      headers,
      method: 'POST',
      body: JSON.stringify(this.settings),
    });

    return fetch(request)
      .then(handleResponse)
      .then(() => true);
  }

  restartSession(): Promise<boolean> {
    if (!this.userService.isLoggedIn) return;

    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/stream-labels/restart-session`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers });

    return fetch(request)
      .then(handleResponse)
      .then(() => true);
  }

  private log(message: string, ...args: any[]) {
    console.debug(`Streamlabels: ${message}`, ...args);
  }

  /**
   * Attempt to load initial data via HTTP instead of waiting
   * for a socket event
   */
  private fetchInitialData(): void {
    if (!this.userService.isLoggedIn) return;

    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/stream-labels/files`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers });

    fetch(request)
      .then(handleResponse)
      .then(json => this.updateOutput(json.data));
  }

  private fetchSettings(): void {
    if (!this.userService.isLoggedIn) return;

    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/stream-labels/settings`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers });

    fetch(request)
      .then(handleResponse)
      .then(settings => this.updateSettings(settings));
  }

  async fetchDefinitions(): Promise<IStreamlabelSet> {
    if (!this.userService.isLoggedIn) return;

    const platform = this.userService.platform.type;
    const url = `https://${this.hostsService.streamlabs}/api/v5/slobs/stream-labels/app-settings/${platform}`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers });

    return await fetch(request)
      .then(handleResponse)
      .then((data: IStreamlabelSet) => this.formatTrainDefinitions(data));
  }

  formatTrainDefinitions(data: IStreamlabelSet) {
    const { trains_combos, ...rest } = data;
    const trainData = {};
    trains_combos.files.forEach(file => {
      const type = Object.keys(this.trains).find(key => this.trains[key].setting === file.name);
      const filetypes = ['train_counter', 'train_latest_name', 'train_clock'];
      if (file.name === 'train_tips') filetypes.push('train_latest_amount', 'train_total_amount');
      const files = filetypes.map(filetype => ({
        name: `${type}_${filetype}`,
        label: capitalize(`${type}_${filetype}`),
        settings: { settingsStat: file.name },
      }));
      trainData[file.name] = { label: file.label, files };
    });
    return {
      ...rest,
      ...trainData,
    };
  }

  private initSocketConnection(): void {
    this.websocketService.socketEvent.subscribe(e => this.onSocketEvent(e));
  }

  private initTrainClockInterval() {
    this.trainInterval = window.setInterval(() => {
      Object.keys(this.trains).forEach((trainType: TTrainType) => {
        const train = this.trains[trainType] as ITrainInfo;

        if (train.mostRecentEventAt == null) return;

        const statname = `${trainType}_train_clock`;
        const settings = this.getSettingsForStat(train.setting);

        // There is currently a bug where this will sometimes come back
        // from the server as a string.
        const duration = parseInt(settings.duration as any, 10) * 1000;
        const msRemaining = duration - (Date.now() - train.mostRecentEventAt);

        if (msRemaining < 0) {
          this.clearTrain(trainType);
          this.outputTrainInfo(trainType);
        } else {
          const minutes = Math.floor(msRemaining / (60 * 1000));
          const seconds = Math.floor((msRemaining % (60 * 1000)) / 1000);
          const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;

          this.updateOutput({
            [statname]: formatted,
          });
        }
      });
    }, 1000);
  }

  private clearTrain(trainType: TTrainType) {
    const train = this.trains[trainType] as ITrainInfo | IDonationTrainInfo;

    if (isDonationTrain(train)) {
      train.mostRecentAmount = null;
      train.totalAmount = 0;
    }

    train.counter = 0;
    train.mostRecentEventAt = null;
    train.mostRecentName = null;
  }

  private outputAllTrains() {
    Object.keys(this.trains).forEach((train: TTrainType) => this.outputTrainInfo(train));
  }

  /**
   * Outputs all files on a train, except for the clock while the
   * train is running.
   */
  private outputTrainInfo(trainType: TTrainType) {
    const train = this.trains[trainType] as ITrainInfo | IDonationTrainInfo;
    const settings = this.getSettingsForStat(train.setting);
    const output = {
      [`${trainType}_train_counter`]: settings.show_count ? train.counter.toString() : '',
      [`${trainType}_train_latest_name`]: settings.show_latest ? train.mostRecentName || '' : '',
    };

    if (isDonationTrain(train)) {
      const latestAmount = train.mostRecentAmount ? train.mostRecentAmount.toFixed(2) : '';
      const totalAmount = train.totalAmount ? train.totalAmount.toFixed(2) : '';

      output[`${trainType}_train_latest_amount`] = latestAmount;
      output[`${trainType}_train_total_amount`] = totalAmount;
    }

    if (train.mostRecentEventAt == null) {
      output[`${trainType}_train_clock`] = settings.show_clock === 'always' ? '0:00' : '';
    }

    this.updateOutput(output);
  }

  private onSocketEvent(event: TSocketEvent) {
    this.log('Socket Event', event);

    if (event.type === 'streamlabels') {
      this.updateOutput(event.message.data);
    } else if (event.type === 'donation') {
      this.trains.donation.mostRecentEventAt = Date.now();
      this.trains.donation.counter += event.message.length;
      this.trains.donation.totalAmount += event.message.reduce((sum: number, donation: any) => {
        return sum + parseFloat(donation.amount);
      }, 0);

      const latest = event.message[event.message.length - 1];
      this.trains.donation.mostRecentName = latest.name;
      this.trains.donation.mostRecentAmount = parseFloat(latest.amount);

      this.outputTrainInfo('donation');
    } else if (event.type === 'follow') {
      this.trains.follow.mostRecentEventAt = Date.now();
      this.trains.follow.counter += event.message.length;

      const latest = event.message[event.message.length - 1];
      this.trains.follow.mostRecentName = latest.name;

      this.outputTrainInfo('follow');
    } else if (event.type === 'subscription') {
      this.trains.subscription.mostRecentEventAt = Date.now();
      this.trains.subscription.counter += event.message.length;

      const latest = event.message[event.message.length - 1];
      this.trains.subscription.mostRecentName = latest.name;

      this.outputTrainInfo('subscription');
    }
  }

  /**
   * Applies a patch to the settings object
   * @param settingsPatch the new settings to be applied
   */
  private updateSettings(settingsPatch: Dictionary<IStreamlabelSettings>) {
    this.settings = {
      ...this.settings,
      ...settingsPatch,
    };
    this.outputAllTrains();
  }

  /**
   * Applies a patch to the output object and fires an update event
   * @param outputPatch the new output strings
   */
  private updateOutput(outputPatch: Dictionary<string>) {
    const oldOutput = this.output.getValue();
    this.output.next({
      ...oldOutput,
      ...outputPatch,
    });
  }
}
