import Vue from 'vue';
import { Subject, Subscription } from 'rxjs';
import electron from 'electron';
import * as obs from '../../obs-api';
import { StatefulService, mutation, Service, Inject } from 'services';
import { throttle } from 'lodash-decorators';
import {
  NotificationsService,
  ENotificationType,
  ENotificationSubType,
} from 'services/notifications';
import { ServicesManager } from '../services-manager';
import { JsonrpcService } from './api/jsonrpc';
import { TroubleshooterService, TIssueCode } from 'services/troubleshooter';
import { $t } from 'services/i18n';

interface IPerformanceState {
  CPU: number;
  numberDroppedFrames: number;
  percentageDroppedFrames: number;
  numberSkippedFrames: number;
  percentageSkippedFrames: number;
  numberLaggedFrames: number;
  percentageLaggedFrames: number;
  numberEncodedFrames: number;
  numberRenderedFrames: number;
  bandwidth: number;
  frameRate: number;
}

interface INextStats {
  framesSkipped: number;
  framesEncoded: number;
  skippedFactor: number;
  framesLagged: number;
  framesRendered: number;
  laggedFactor: number;
  droppedFramesFactor: number;
}

export enum EStreamQuality {
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
}

const STATS_UPDATE_INTERVAL = 5 * 1000;
const NOTIFICATION_INTERVAL = 2 * 60 * 1000;

interface IMonitorState {
  framesLagged: number;
  framesRendered: number;
  framesSkipped: number;
  framesEncoded: number;
}

// Keeps a store of up-to-date performance metrics
export class PerformanceService extends StatefulService<IPerformanceState> {
  @Inject() private notificationsService: NotificationsService;
  @Inject() private jsonrpcService: JsonrpcService;
  @Inject() private troubleshooterService: TroubleshooterService;

  static initialState: IPerformanceState = {
    CPU: 0,
    numberDroppedFrames: 0,
    percentageDroppedFrames: 0,
    numberSkippedFrames: 0,
    percentageSkippedFrames: 0,
    numberLaggedFrames: 0,
    percentageLaggedFrames: 0,
    numberEncodedFrames: 0,
    numberRenderedFrames: 0,
    bandwidth: 0,
    frameRate: 0,
  };

  private intervalId: number = null;

  @mutation()
  private SET_PERFORMANCE_STATS(stats: Partial<IPerformanceState>) {
    Object.keys(stats).forEach(stat => {
      Vue.set(this.state, stat, stats[stat]);
    });
  }

  // Starts interval to poll updates from OBS
  startMonitoringPerformance() {
    this.intervalId = window.setInterval(() => {
      electron.ipcRenderer.send('requestPerformanceStats');
    }, STATS_UPDATE_INTERVAL);

    electron.ipcRenderer.on(
      'performanceStatsResponse',
      (e: electron.Event, am: electron.ProcessMetric[]) => {
        const stats: IPerformanceState = obs.NodeObs.OBS_API_getPerformanceStatistics();

        stats.CPU += am
          .map(proc => {
            return proc.cpu.percentCPUUsage;
          })
          .reduce((sum, usage) => sum + usage);

        this.SET_PERFORMANCE_STATS(stats);
        this.monitorAndUpdateStats();
      },
    );
  }

  nextStats(currentStats: IMonitorState): INextStats {
    const framesSkipped = currentStats.framesSkipped - this.state.numberSkippedFrames;
    const framesEncoded = currentStats.framesEncoded - this.state.numberEncodedFrames;
    const skippedFactor = framesSkipped / framesEncoded;

    const framesLagged = currentStats.framesLagged - this.state.numberLaggedFrames;
    const framesRendered = currentStats.framesRendered - this.state.numberRenderedFrames;
    const laggedFactor = framesLagged / framesRendered;

    const droppedFramesFactor = this.state.percentageDroppedFrames / 100;

    return {
      framesSkipped,
      framesEncoded,
      skippedFactor,
      framesLagged,
      framesRendered,
      laggedFactor,
      droppedFramesFactor,
    };
  }

  /* Monitor frame rate statistics
  /  Update values in state
  /  Dispatch notifications when thresholds are crossed */
  private monitorAndUpdateStats() {
    /* Fetch variables only once. */
    const currentStats: IMonitorState = {
      framesLagged: obs.Global.laggedFrames,
      framesRendered: obs.Global.totalFrames,
      framesSkipped: obs.Video.skippedFrames,
      framesEncoded: obs.Video.encodedFrames,
    };

    const nextStats = this.nextStats(currentStats);
    this.sendNotifications(currentStats, nextStats);

    this.SET_PERFORMANCE_STATS({
      numberSkippedFrames: nextStats.framesSkipped,
      percentageSkippedFrames: nextStats.skippedFactor * 100,
      numberLaggedFrames: nextStats.framesLagged,
      percentageLaggedFrames: nextStats.laggedFactor * 100,
      numberEncodedFrames: nextStats.framesEncoded,
      numberRenderedFrames: nextStats.framesRendered,
    });
  }

  // Check if any notification thresholds are met and send applicable notification
  sendNotifications(currentStats: IMonitorState, nextStats: INextStats) {
    const troubleshooterSettings = this.troubleshooterService.getSettings();

    // Check if skipped frames exceed notification threshold
    if (
      troubleshooterSettings.skippedEnabled &&
      currentStats.framesEncoded !== 0 &&
      nextStats.framesEncoded !== 0 &&
      nextStats.skippedFactor >= troubleshooterSettings.skippedThreshold
    ) {
      this.pushSkippedFramesNotify(nextStats.skippedFactor);
    }

    // Check if lagged frames exceed notification threshold
    if (
      troubleshooterSettings.laggedEnabled &&
      currentStats.framesRendered !== 0 &&
      nextStats.framesRendered !== 0 &&
      nextStats.laggedFactor >= troubleshooterSettings.laggedThreshold
    ) {
      this.pushLaggedFramesNotify(nextStats.laggedFactor);
    }

    // Check if dropped frames exceed notification threshold
    if (
      troubleshooterSettings.droppedEnabled &&
      nextStats.droppedFramesFactor >= troubleshooterSettings.droppedThreshold
    ) {
      this.pushDroppedFramesNotify(nextStats.droppedFramesFactor);
    }
  }

  @throttle(NOTIFICATION_INTERVAL)
  private pushSkippedFramesNotify(factor: number) {
    const code: TIssueCode = 'FRAMES_SKIPPED';
    this.notificationsService.push({
      code,
      type: ENotificationType.WARNING,
      data: factor,
      lifeTime: -1,
      showTime: true,
      subType: ENotificationSubType.SKIPPED,
      // tslint:disable-next-line:prefer-template
      message: $t('Skipped frames detected:') + Math.round(factor * 100) + '%',
      action: this.jsonrpcService.createRequest(
        Service.getResourceId(this.troubleshooterService),
        'showTroubleshooter',
        code,
      ),
    });
  }

  @throttle(NOTIFICATION_INTERVAL)
  private pushLaggedFramesNotify(factor: number) {
    const code: TIssueCode = 'FRAMES_LAGGED';
    this.notificationsService.push({
      code,
      type: ENotificationType.WARNING,
      data: factor,
      lifeTime: -1,
      showTime: true,
      subType: ENotificationSubType.LAGGED,
      message: `Lagged frames detected: ${Math.round(factor * 100)}%`,
      action: this.jsonrpcService.createRequest(
        Service.getResourceId(this.troubleshooterService),
        'showTroubleshooter',
        code,
      ),
    });
  }

  @throttle(NOTIFICATION_INTERVAL)
  private pushDroppedFramesNotify(factor: number) {
    const code: TIssueCode = 'FRAMES_DROPPED';
    this.notificationsService.push({
      code,
      type: ENotificationType.WARNING,
      data: factor,
      lifeTime: -1,
      showTime: true,
      subType: ENotificationSubType.DROPPED,
      message: `Dropped frames detected: ${Math.round(factor * 100)}%`,
      action: this.jsonrpcService.createRequest(
        Service.getResourceId(this.troubleshooterService),
        'showTroubleshooter',
        code,
      ),
    });
  }

  get streamQuality() {
    if (
      this.state.percentageDroppedFrames > 50 ||
      this.state.percentageLaggedFrames > 50 ||
      this.state.percentageSkippedFrames > 50
    ) {
      return EStreamQuality.POOR;
    }
    if (
      this.state.percentageDroppedFrames > 30 ||
      this.state.percentageLaggedFrames > 30 ||
      this.state.percentageSkippedFrames > 30
    ) {
      return EStreamQuality.FAIR;
    }
    return EStreamQuality.GOOD;
  }

  stop() {
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.SET_PERFORMANCE_STATS(PerformanceService.initialState);
  }
}
