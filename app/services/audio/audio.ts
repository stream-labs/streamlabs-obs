import Vue from 'vue';
import omit from 'lodash/omit';
import { Observable, Subject, Subscription } from 'rxjs';
import { mutation, StatefulService, ServiceHelper, InitAfter, Inject } from 'services';
import { SourcesService, ISource, Source } from 'services/sources';
import { ScenesService } from 'services/scenes';
import * as obs from '../../../obs-api';
import Utils from 'services/utils';
import { WindowsService } from 'services/windows';
import {
  IObsBitmaskInput,
  IObsInput,
  IObsListInput,
  IObsNumberInputValue,
  TObsFormData,
} from 'components/obs/inputs/ObsInput';
import {
  IAudioServiceApi,
  IAudioSource,
  IAudioSourceApi,
  IAudioSourcesState,
  IFader,
  IVolmeter,
} from './audio-api';
import { EDeviceType, HardwareService, IDevice } from 'services/hardware';
import { $t } from 'services/i18n';
import { ipcRenderer } from 'electron';
import without from 'lodash/without';
import { ViewHandler } from 'services/core';

export enum E_AUDIO_CHANNELS {
  OUTPUT_1 = 1,
  OUTPUT_2 = 2,
  INPUT_1 = 3,
  INPUT_2 = 4,
  INPUT_3 = 5,
}

interface IAudioSourceData {
  fader?: obs.IFader;
  volmeter?: obs.IVolmeter;
  callbackInfo?: obs.ICallbackData;
  stream?: Observable<IVolmeter>;
  timeoutId?: number;
  isControlledViaObs?: boolean;
}

class AudioViews extends ViewHandler<IAudioSourcesState> {
  get activeSceneId() {
    return this.getServiceViews(ScenesService).activeSceneId;
  }

  get sourcesForCurrentScene(): AudioSource[] {
    return this.getSourcesForScene(this.activeSceneId);
  }

  getSourcesForScene(sceneId: string): AudioSource[] {
    const scene = this.getServiceViews(ScenesService).getScene(sceneId);
    const sceneSources = scene
      .getNestedSources({ excludeScenes: true })
      .filter(sceneItem => sceneItem.audio);

    const globalSources = this.getServiceViews(SourcesService)
      .getSources()
      .filter(source => source.channel !== void 0);
    return globalSources
      .concat(sceneSources)
      .map((sceneSource: ISource) => this.getSource(sceneSource.sourceId))
      .filter(item => item);
  }

  isSourceVisible(sourceId: string) {
    const sceneItems = this.getServiceViews(ScenesService).getSceneItemsBySourceId(sourceId);
    const sceneItemInActiveScene = sceneItems.find(
      sceneItem => sceneItem.sceneId === this.activeSceneId,
    );

    if (!sceneItemInActiveScene) return true;
    if (!sceneItemInActiveScene.video) return true;

    return sceneItemInActiveScene.visible;
  }

  getSource(sourceId: string): AudioSource {
    return this.state.audioSources[sourceId] ? new AudioSource(sourceId) : void 0;
  }

  getSources(): AudioSource[] {
    return Object.keys(this.state.audioSources).map(sourceId => this.getSource(sourceId));
  }
}

@InitAfter('SourcesService')
export class AudioService extends StatefulService<IAudioSourcesState> {
  static initialState: IAudioSourcesState = {
    audioSources: {},
  };

  audioSourceUpdated = new Subject<IAudioSource>();

  sourceData: Dictionary<IAudioSourceData> = {};

  @Inject() private sourcesService: SourcesService;
  @Inject() private scenesService: ScenesService;
  @Inject() private windowsService: WindowsService;
  @Inject() private hardwareService: HardwareService;

  get views() {
    return new AudioViews(this.state);
  }

  protected init() {
    this.initVolmeterRelay();

    this.sourcesService.sourceAdded.subscribe(sourceModel => {
      const source = this.sourcesService.views.getSource(sourceModel.sourceId);
      if (!source.audio) return;
      this.createAudioSource(source);
    });

    this.sourcesService.sourceUpdated.subscribe(source => {
      const audioSource = this.views.getSource(source.sourceId);
      const obsSource = this.sourcesService.views.getSource(source.sourceId);
      const formData = obsSource
        .getPropertiesFormData()
        .find(data => data.name === 'reroute_audio');
      if (formData) {
        this.UPDATE_AUDIO_SOURCE(source.sourceId, {
          isControlledViaObs: !!formData.value,
        });
      }

      if (!audioSource && source.audio) {
        this.createAudioSource(this.sourcesService.views.getSource(source.sourceId));
      }

      if (audioSource && !source.audio) {
        this.removeAudioSource(source.sourceId);
      }
    });

    this.sourcesService.sourceRemoved.subscribe(source => {
      if (source.audio) this.removeAudioSource(source.sourceId);
    });
  }

  static timeSpecToMs(timeSpec: obs.ITimeSpec): number {
    return timeSpec.sec * 1000 + Math.floor(timeSpec.nsec / 1000000);
  }

  static msToTimeSpec(ms: number): obs.ITimeSpec {
    return { sec: Math.trunc(ms / 1000), nsec: Math.trunc(ms % 1000) * 1000000 };
  }

  volmeterSubscriptions: Dictionary<number[]> = {};

  /**
   * Special IPC channel for volmeter updates
   */
  initVolmeterRelay() {
    ipcRenderer.on('volmeterSubscribe', (e, sourceId: string) => {
      this.volmeterSubscriptions[sourceId] = this.volmeterSubscriptions[sourceId] || [];
      this.volmeterSubscriptions[sourceId].push(e.senderId);
    });

    ipcRenderer.on('volmeterUnsubscribe', (e, sourceId: string) => {
      this.volmeterSubscriptions[sourceId] = without(
        this.volmeterSubscriptions[sourceId],
        e.senderId,
      );
    });
  }

  unhideAllSourcesForCurrentScene() {
    this.views.sourcesForCurrentScene.forEach(source => {
      source.setHidden(false);
    });
  }

  fetchFaderDetails(sourceId: string): IFader {
    const source = this.sourcesService.views.getSource(sourceId);
    const obsFader = this.sourceData[source.sourceId].fader;
    const deflection = Math.round(obsFader.deflection * 100) / 100.0;

    return {
      deflection,
      db: obsFader.db || 0,
      mul: obsFader.mul,
    };
  }

  generateAudioSourceData(sourceId: string): IAudioSource {
    const source = this.sourcesService.views.getSource(sourceId);
    const obsSource = source.getObsInput();

    const fader = this.fetchFaderDetails(sourceId);
    const isControlledViaObs =
      obsSource.settings?.reroute_audio == null ? true : obsSource.settings?.reroute_audio;

    return {
      fader,
      isControlledViaObs,
      sourceId: source.sourceId,
      audioMixers: obsSource.audioMixers,
      monitoringType: obsSource.monitoringType,
      forceMono: !!(obsSource.flags & obs.ESourceFlags.ForceMono),
      syncOffset: AudioService.timeSpecToMs(obsSource.syncOffset),
      muted: obsSource.muted,
      mixerHidden: false,
    };
  }

  getDevices(): IDevice[] {
    return this.hardwareService
      .getDevices()
      .filter(device => [EDeviceType.audioOutput, EDeviceType.audioInput].includes(device.type));
  }

  showAdvancedSettings() {
    this.windowsService.showWindow({
      componentName: 'AdvancedAudio',
      title: $t('Advanced Audio Settings'),
      size: {
        width: 915,
        height: 600,
      },
    });
  }

  setSettings(sourceId: string, patch: Partial<IAudioSource>) {
    const obsInput = this.sourcesService.views.getSource(sourceId).getObsInput();

    // Fader is ignored by this method.  Use setFader instead
    const newPatch = omit(patch, 'fader');

    Object.keys(newPatch).forEach(name => {
      const value = newPatch[name];
      if (value === void 0) return;

      if (name === 'syncOffset') {
        obsInput.syncOffset = AudioService.msToTimeSpec(value);
      } else if (name === 'forceMono') {
        if (this.views.getSource(sourceId).forceMono !== value) {
          value
            ? (obsInput.flags = obsInput.flags | obs.ESourceFlags.ForceMono)
            : (obsInput.flags -= obs.ESourceFlags.ForceMono);
        }
      } else if (name === 'muted') {
        this.sourcesService.setMuted(sourceId, value);
      } else {
        obsInput[name] = value;
      }
    });

    this.UPDATE_AUDIO_SOURCE(sourceId, newPatch);
    this.audioSourceUpdated.next(this.state.audioSources[sourceId]);
  }

  setFader(sourceId: string, patch: Partial<IFader>) {
    const obsFader = this.sourceData[sourceId].fader;
    if (patch.deflection != null) obsFader.deflection = patch.deflection;
    if (patch.mul != null) obsFader.mul = patch.mul;
    // We never set db directly

    const fader = this.fetchFaderDetails(sourceId);
    this.UPDATE_AUDIO_SOURCE(sourceId, { fader });
    this.audioSourceUpdated.next(this.state.audioSources[sourceId]);
  }

  private createAudioSource(source: Source) {
    this.sourceData[source.sourceId] = {};

    const obsVolmeter = obs.VolmeterFactory.create(obs.EFaderType.IEC);
    obsVolmeter.attach(source.getObsInput());
    this.sourceData[source.sourceId].volmeter = obsVolmeter;

    const obsFader = obs.FaderFactory.create(obs.EFaderType.IEC);
    obsFader.attach(source.getObsInput());
    this.sourceData[source.sourceId].fader = obsFader;

    this.initVolmeterStream(source.sourceId);
    this.ADD_AUDIO_SOURCE(this.generateAudioSourceData(source.sourceId));
  }

  private initVolmeterStream(sourceId: string) {
    let gotEvent = false;
    let lastVolmeterValue: IVolmeter;
    this.sourceData[sourceId].callbackInfo = this.sourceData[sourceId].volmeter.addCallback(
      (magnitude: number[], peak: number[], inputPeak: number[]) => {
        const volmeter: IVolmeter = { magnitude, peak, inputPeak };

        this.sendVolmeterData(sourceId, volmeter);
        lastVolmeterValue = volmeter;
        gotEvent = true;
      },
    );

    /* This is useful for media sources since the volmeter will abruptly stop
     * sending events in the case of hiding the source. It might be better
     * to eventually just hide the mixer item as well though */
    const volmeterCheck = () => {
      if (!this.sourceData[sourceId]) return;

      if (!gotEvent && lastVolmeterValue) {
        const channelsCount = lastVolmeterValue.peak.length;
        const channelsValue = Array(channelsCount).fill(-60);
        this.sendVolmeterData(sourceId, {
          ...lastVolmeterValue,
          magnitude: channelsValue,
          peak: channelsValue,
          inputPeak: channelsValue,
        });
      }

      gotEvent = false;
      this.sourceData[sourceId].timeoutId = window.setTimeout(volmeterCheck, 100);
    };

    volmeterCheck();
  }

  private sendVolmeterData(sourceId: string, data: IVolmeter) {
    const subscribers = this.volmeterSubscriptions[sourceId] || [];

    subscribers.forEach(id => {
      ipcRenderer.sendTo(id, `volmeter-${sourceId}`, data);
    });
  }

  private removeAudioSource(sourceId: string) {
    this.sourceData[sourceId].fader.detach();
    this.sourceData[sourceId].fader.destroy();
    this.sourceData[sourceId].volmeter.removeCallback(this.sourceData[sourceId].callbackInfo);
    this.sourceData[sourceId].volmeter.detach();
    this.sourceData[sourceId].volmeter.destroy();
    if (this.sourceData[sourceId].timeoutId) clearTimeout(this.sourceData[sourceId].timeoutId);
    delete this.sourceData[sourceId];
    this.REMOVE_AUDIO_SOURCE(sourceId);
  }

  @mutation()
  private ADD_AUDIO_SOURCE(source: IAudioSource) {
    Vue.set(this.state.audioSources, source.sourceId, source);
  }

  @mutation()
  private UPDATE_AUDIO_SOURCE(sourceId: string, patch: Partial<IAudioSource>) {
    Object.assign(this.state.audioSources[sourceId], patch);
  }

  @mutation()
  private REMOVE_AUDIO_SOURCE(sourceId: string) {
    Vue.delete(this.state.audioSources, sourceId);
  }
}

@ServiceHelper()
export class AudioSource implements IAudioSourceApi {
  name: string;
  sourceId: string;
  fader: IFader;
  muted: boolean;
  forceMono: boolean;
  audioMixers: number;
  monitoringType: obs.EMonitoringType;
  syncOffset: number;
  resourceId: string;
  mixerHidden: boolean;
  isControlledViaObs: boolean;

  @Inject()
  private audioService: AudioService;

  @Inject()
  private sourcesService: SourcesService;

  private readonly audioSourceState: IAudioSource;

  constructor(sourceId: string) {
    this.audioSourceState = this.audioService.state.audioSources[sourceId];
    const sourceState =
      this.sourcesService.state.sources[sourceId] ||
      this.sourcesService.state.temporarySources[sourceId];
    Utils.applyProxy(this, this.audioSourceState);
    Utils.applyProxy(this, sourceState);
  }

  isDestroyed(): boolean {
    return !this.audioService.state.audioSources[this.sourceId];
  }

  getModel(): IAudioSource & ISource {
    return { ...this.source.state, ...this.audioSourceState };
  }

  getSettingsForm(): TObsFormData {
    return [
      <IObsNumberInputValue>{
        name: 'deflection',
        value: Math.round(this.fader.deflection * 100),
        description: $t('Volume (%)'),
        showDescription: false,
        visible: true,
        enabled: true,
        minVal: 0,
        maxVal: 100,
        type: 'OBS_PROPERTY_INT',
      },

      <IObsInput<boolean>>{
        value: this.mixerHidden,
        name: 'mixerHidden',
        description: $t('Hide in Mixer'),
        showDescription: false,
        type: 'OBS_PROPERTY_BOOL',
        visible: true,
        enabled: true,
      },

      <IObsInput<boolean>>{
        value: this.forceMono,
        name: 'forceMono',
        description: $t('Downmix to Mono'),
        showDescription: false,
        type: 'OBS_PROPERTY_BOOL',
        visible: true,
        enabled: true,
      },

      <IObsInput<number>>{
        value: this.syncOffset,
        name: 'syncOffset',
        description: $t('Sync Offset (ms)'),
        showDescription: false,
        type: 'OBS_PROPERTY_INT',
        visible: true,
        enabled: true,
        minVal: -950,
        maxVal: 20000,
      },

      <IObsListInput<obs.EMonitoringType>>{
        value: this.monitoringType,
        name: 'monitoringType',
        description: $t('Audio Monitoring'),
        showDescription: false,
        type: 'OBS_PROPERTY_LIST',
        visible: true,
        enabled: true,
        options: [
          { value: obs.EMonitoringType.None, description: $t('Monitor Off') },
          {
            value: obs.EMonitoringType.MonitoringOnly,
            description: $t('Monitor Only (mute output)'),
          },
          { value: obs.EMonitoringType.MonitoringAndOutput, description: $t('Monitor and Output') },
        ],
      },

      <IObsBitmaskInput>{
        value: this.audioMixers,
        name: 'audioMixers',
        description: $t('Tracks'),
        showDescription: false,
        type: 'OBS_PROPERTY_BITMASK',
        visible: true,
        enabled: true,
        size: 6,
      },
    ];
  }

  get source() {
    return this.sourcesService.views.getSource(this.sourceId);
  }

  setSettings(patch: Partial<IAudioSource>) {
    this.audioService.setSettings(this.sourceId, patch);
  }

  setDeflection(deflection: number) {
    this.audioService.setFader(this.sourceId, { deflection });
  }

  setMul(mul: number) {
    this.audioService.setFader(this.sourceId, { mul });
  }

  setHidden(hidden: boolean) {
    this.audioService.setSettings(this.sourceId, { mixerHidden: hidden });
  }

  setMuted(muted: boolean) {
    this.sourcesService.setMuted(this.sourceId, muted);
  }

  subscribeVolmeter(cb: (volmeter: IVolmeter) => void): Subscription {
    const stream = this.audioService.sourceData[this.sourceId].stream;
    return stream.subscribe(cb);
  }
}
