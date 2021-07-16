import React, { useState, useEffect } from 'react';
import cx from 'classnames';
import { EStreamQuality } from '../../services/performance';
import { EStreamingState, EReplayBufferState } from '../../services/streaming';
import { Services } from '../service-provider';
import { $t } from '../../services/i18n';
import { useRenderInterval, useVuex } from '../hooks';
import styles from './StudioFooter.m.less';
import PerformanceMetrics from '../shared/PerformanceMetrics';
import TestWidgets from './TestWidgets';
import StartStreamingButton from './StartStreamingButton';
import NotificationsArea from './NotificationsArea';
import { Tooltip } from 'antd';

export default function StudioFooterComponent(p: { locked?: boolean }) {
  const {
    StreamingService,
    UserService,
    WindowsService,
    SettingsService,
    PerformanceService,
    YoutubeService,
    UsageStatisticsService,
  } = Services;

  const [recordingTime, setRecordingTime] = useState('');

  const {
    streamingStatus,
    platform,
    streamQuality,
    isRecording,
    isLoggedIn,
    canSchedule,
    replayBufferEnabled,
    replayBufferOffline,
    replayBufferStopping,
    replayBufferSaving,
  } = useVuex(() => ({
    streamingStatus: StreamingService.views.streamingStatus,
    platform: UserService.views.platform?.type,
    streamQuality: PerformanceService.views.streamQuality,
    isRecording: StreamingService.views.isRecording,
    isLoggedIn: UserService.views.isLoggedIn,
    canSchedule: StreamingService.views.supports('stream-schedule'),
    replayBufferEnabled: SettingsService.views.values.Output.RecRB,
    replayBufferOffline: StreamingService.state.replayBufferStatus === EReplayBufferState.Offline,
    replayBufferStopping: StreamingService.state.replayBufferStatus === EReplayBufferState.Stopping,
    replayBufferSaving: StreamingService.state.replayBufferStatus === EReplayBufferState.Saving,
  }));

  useRenderInterval(() => {
    if (!isRecording) return;
    setRecordingTime(StreamingService.formattedDurationInCurrentRecordingState);
  }, 1000);

  useEffect(confirmYoutubeEnabled, [platform]);

  const youtubeEnabled = platform === 'youtube' ? YoutubeService.state.liveStreamingEnabled : true;

  function toggleRecording() {
    StreamingService.toggleRecording();
  }

  function performanceIconClassName() {
    if (!streamingStatus || streamingStatus === EStreamingState.Offline) {
      return '';
    }

    if (streamingStatus === EStreamingState.Reconnecting || streamQuality === EStreamQuality.POOR) {
      return 'warning';
    }

    if (streamQuality === EStreamQuality.FAIR) {
      return 'info';
    }

    return 'success';
  }

  function confirmYoutubeEnabled() {
    if (platform === 'youtube') {
      YoutubeService.prepopulateInfo();
    }
  }

  function openYoutubeEnable() {
    YoutubeService.actions.openYoutubeEnable();
  }

  function openScheduleStream() {
    WindowsService.showWindow({
      componentName: 'ScheduleStreamWindow',
      title: $t('Schedule Stream'),
      size: { width: 800, height: 670 },
    });
  }

  function openMetricsWindow() {
    WindowsService.showWindow({
      componentName: 'AdvancedStatistics',
      title: $t('Performance Metrics'),
      size: { width: 700, height: 550 },
      resizable: true,
      maximizable: false,
      minWidth: 500,
      minHeight: 400,
    });
    UsageStatisticsService.recordFeatureUsage('PerformanceStatistics');
  }

  function toggleReplayBuffer() {
    if (StreamingService.state.replayBufferStatus === EReplayBufferState.Offline) {
      StreamingService.startReplayBuffer();
    } else {
      StreamingService.stopReplayBuffer();
    }
  }

  function saveReplay() {
    StreamingService.saveReplay();
  }

  return (
    <div className={styles.footer}>
      <div className="flex flex--center flex--grow flex--justify-start">
        {isLoggedIn && youtubeEnabled && (
          <div className={styles.errorWrapper}>
            <div className={styles.platformError}>
              <i className="fa fa-exclamation-triangle" />
              <span>{$t('YouTube account not enabled for live streaming')}</span>
              <button className="button alert-button" onClick={openYoutubeEnable}>
                {$t('Fix')}
              </button>
              <button className="button alert-button" onClick={confirmYoutubeEnabled}>
                {$t("I'm set up")}
              </button>
            </div>
          </div>
        )}
        <Tooltip placement="left" title={$t('Open Performance Window')}>
          <i
            className={cx('icon-leaderboard-4', 'metrics-icon', performanceIconClassName())}
            onClick={openMetricsWindow}
          />
        </Tooltip>
        <PerformanceMetrics mode="limited" className="performance-metrics" />
        <NotificationsArea />
      </div>

      <div className={styles.navRight}>
        <div className={styles.navItem}>{isLoggedIn && <TestWidgets />}</div>
        {isRecording && (
          <div className={cx(styles.navItem, styles.recordTime)}>{recordingTime}</div>
        )}
        <div className={styles.navItem}>
          <button
            disabled={p.locked}
            className={cx(styles.recordButton, { [styles.active]: isRecording })}
            onClick={toggleRecording}
          >
            <span>REC</span>
          </button>
        </div>
        {replayBufferEnabled && replayBufferOffline && (
          <div className={styles.navItem}>
            <Tooltip placement="left" title={$t('Start Replay Buffer')}>
              <button className="circle-button" onClick={toggleReplayBuffer}>
                <i className="icon-replay-buffer" />
              </button>
            </Tooltip>
          </div>
        )}
        {!replayBufferOffline && (
          <div className={cx(styles.navItem, styles.replayButtonGroup)}>
            <Tooltip placement="left" title={$t('Stop')}>
              <button
                className={cx('circle-button', styles.leftReplay, 'button--soft-warning')}
                onClick={toggleReplayBuffer}
              >
                <i className="fa fa-stop" />
              </button>
            </Tooltip>
            <Tooltip placement="left" title={$t('Save Replay')}>
              <button
                className={cx('circle-button', styles.rightReplay)}
                onClick={saveReplay}
                disabled={replayBufferSaving || replayBufferStopping}
              >
                <i className="icon-save" />
              </button>
            </Tooltip>
          </div>
        )}
        {canSchedule && (
          <div className={styles.navItem}>
            <Tooltip placement="left" title={$t('Schedule Stream')}>
              <button className="circle-button" onClick={openScheduleStream}>
                <i className="icon-date" />
              </button>
            </Tooltip>
          </div>
        )}
        <div className={styles.navItem}>
          <StartStreamingButton disabled={p.locked} />
        </div>
      </div>
    </div>
  );
}
