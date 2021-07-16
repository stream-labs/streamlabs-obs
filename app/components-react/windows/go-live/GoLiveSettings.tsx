import styles from './GoLive.m.less';
import Scrollable from '../../shared/Scrollable';
import { Services } from '../../service-provider';
import React from 'react';
import { useGoLiveSettings } from './useGoLiveSettings';
import { DestinationSwitchers } from './DestinationSwitchers';
import { $t } from '../../../services/i18n';
import { Row, Col } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Section } from './Section';
import PlatformSettings from './PlatformSettings';
import TwitterInput from './Twitter';
import OptimizedProfileSwitcher from './OptimizedProfileSwitcher';
import Spinner from '../../shared/Spinner';
import GoLiveError from './GoLiveError';

const PlusIcon = PlusOutlined as Function;

/**
 * Renders settings for starting the stream
 * - Platform switchers
 * - Settings for each platform
 * - Extras settings
 **/
export default function GoLiveSettings() {
  const { RestreamService, SettingsService, UserService, MagicLinkService } = Services;

  const {
    isAdvancedMode,
    protectedModeEnabled,
    error,
    isLoading,
    canAddDestinations,
  } = useGoLiveSettings().selectExtra(module => {
    const linkedPlatforms = module.linkedPlatforms;
    const customDestinations = module.customDestinations;
    return {
      canAddDestinations: linkedPlatforms.length + customDestinations.length < 5,
    };
  });

  const shouldShowSettings = !error && !isLoading;
  const shouldShowPrimeLabel = !RestreamService.state.grandfathered;
  const shouldShowLeftCol = protectedModeEnabled;
  const shouldShowAddDestButton = canAddDestinations;

  function addDestination() {
    // open the stream settings or prime page
    if (UserService.views.isPrime) {
      SettingsService.actions.showSettings('Stream');
    } else {
      MagicLinkService.linkToPrime('slobs-multistream');
    }
  }

  return (
    <Row gutter={16} style={{ height: 'calc(100% + 24px)' }}>
      {/*LEFT COLUMN*/}
      {shouldShowLeftCol && (
        <Col span={8}>
          {/*DESTINATION SWITCHERS*/}
          <DestinationSwitchers />
          {/*ADD DESTINATION BUTTON*/}
          {shouldShowAddDestButton && (
            <a className={styles.addDestinationBtn} onClick={addDestination}>
              <PlusIcon />
              {$t('Add Destination')}{' '}
              {shouldShowPrimeLabel && <b className={styles.prime}>prime</b>}
            </a>
          )}
        </Col>
      )}

      {/*RIGHT COLUMN*/}
      <Col span={shouldShowLeftCol ? 16 : 24} style={{ height: '100%' }}>
        <Spinner visible={isLoading} />
        <GoLiveError />
        {shouldShowSettings && (
          <Scrollable style={{ maxHeight: '100%' }} snapToWindowEdge>
            {/*PLATFORM SETTINGS*/}
            <PlatformSettings />
            {/*ADD SOME SPACE IN ADVANCED MODE*/}
            {isAdvancedMode && <div className={styles.spacer} />}
            {/*EXTRAS*/}
            <Section isSimpleMode={!isAdvancedMode} title={$t('Extras')}>
              <TwitterInput />
              <OptimizedProfileSwitcher />
            </Section>
          </Scrollable>
        )}
      </Col>
    </Row>
  );
}
