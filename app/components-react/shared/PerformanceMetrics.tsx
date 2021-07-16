import React from 'react';
import { Tooltip } from 'antd';
import cx from 'classnames';
import { useVuex } from '../hooks';
import { Services } from '../service-provider';
import cloneDeep from 'lodash/cloneDeep';
import styles from './PerformanceMetrics.m.less';
import { $t } from '../../services/i18n';

type TPerformanceMetricsMode = 'full' | 'limited';

export default function PerformanceMetrics(props: {
  mode: TPerformanceMetricsMode;
  className?: string;
}) {
  const { CustomizationService, PerformanceService } = Services;

  const v = useVuex(
    () => ({
      pinnedStats: CustomizationService.views.pinnedStatistics,
      cpuPercent: PerformanceService.views.cpuPercent,
      frameRate: PerformanceService.views.frameRate,
      droppedFrames: PerformanceService.views.droppedFrames,
      percentDropped: PerformanceService.views.percentDropped,
      bandwidth: PerformanceService.views.bandwidth,
    }),
    false,
  );

  function showAttribute(attribute: string) {
    return props.mode === 'full' || v.pinnedStats[attribute];
  }

  function pinTooltip(stat: string) {
    return props.mode === 'full' ? $t('Click to add %{stat} info to your footer', { stat }) : '';
  }

  function classForStat(stat: string) {
    if (props.mode === 'limited') return '';
    return `clickable ${v.pinnedStats[stat] ? 'active' : ''}`;
  }

  function updatePinnedStats(key: string, value: boolean) {
    if (props.mode === 'limited') return;
    const newStats = cloneDeep(v.pinnedStats);
    newStats[key] = value;
    CustomizationService.actions.setPinnedStatistics(newStats);
  }

  const metadata = {
    cpu: { value: `${v.cpuPercent}%`, label: $t('CPU'), icon: 'icon-cpu' },
    fps: { value: v.frameRate, label: 'FPS', icon: 'icon-fps' },
    droppedFrames: {
      value: `${v.droppedFrames} (${v.percentDropped}%)`,
      label: $t('Dropped Frames'),
      icon: 'icon-dropped-frames',
    },
    bandwidth: { value: v.bandwidth, label: 'kb/s', icon: 'icon-bitrate' },
  };

  const shownCells = ['cpu', 'fps', 'droppedFrames', 'bandwidth'].filter((val: string) =>
    showAttribute(val),
  );

  function showLabel(attribute: string) {
    if (attribute !== 'droppedFrames') return true;
    return props.mode === 'full';
  }

  return (
    <div
      className={cx(
        styles.performanceMetrics,
        'performance-metrics',
        'flex flex--center',
        props.className,
      )}
    >
      {shownCells.map(attribute => {
        const data = metadata[attribute];
        return (
          <Tooltip placement="bottom" title={pinTooltip(data.label)} key={attribute}>
            <span
              className={cx(
                styles.performanceMetricWrapper,
                classForStat(attribute),
                'performance-metric-wrapper',
              )}
              onClick={() => updatePinnedStats(attribute, !v.pinnedStats[attribute])}
            >
              <i className={cx(styles.performanceMetricIcon, data.icon)} />
              <span className={styles.performanceMetric}>
                <span className={styles.performanceMetricValue}>{data.value}</span>
                {showLabel(attribute) && (
                  <span className={styles.performanceMetricLabel}> {data.label}</span>
                )}
              </span>
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}
