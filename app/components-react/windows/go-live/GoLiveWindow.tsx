import styles from './GoLive.m.less';
import { ModalLayout } from '../../shared/ModalLayout';
import { Button } from 'antd';
import { useOnDestroy } from '../../hooks';
import { Services } from '../../service-provider';
import GoLiveSettings from './GoLiveSettings';
import React from 'react';
import { $t } from '../../../services/i18n';
import GoLiveChecklist from './GoLiveChecklist';
import Form from '../../shared/inputs/Form';
import Animation from 'rc-animate';
import { SwitchInput } from '../../shared/inputs';
import { useGoLiveSettings } from './useGoLiveSettings';

export default function GoLiveWindow() {
  const { StreamingService, WindowsService } = Services;
  const {
    error,
    lifecycle,
    checklist,
    isMultiplatformMode,
    goLive,
    isAdvancedMode,
    switchAdvancedMode,
    prepopulate,
    isLoading,
    form,
  } = useGoLiveSettings().select();

  const shouldShowConfirm = ['prepopulate', 'waitForNewSettings'].includes(lifecycle);
  const shouldShowSettings = ['empty', 'prepopulate', 'waitForNewSettings'].includes(lifecycle);
  const shouldShowChecklist = ['runChecklist', 'live'].includes(lifecycle);
  const shouldShowAdvancedSwitch = shouldShowConfirm && isMultiplatformMode;
  const shouldShowGoBackButton =
    lifecycle === 'runChecklist' && error && checklist.startVideoTransmission !== 'done';

  // clear failed checks and warnings on window close
  useOnDestroy(() => {
    if (checklist.startVideoTransmission !== 'done') {
      StreamingService.actions.resetInfo();
    }
  });

  function close() {
    WindowsService.actions.closeChildWindow();
  }

  function goBackToSettings() {
    prepopulate();
  }

  function renderFooter() {
    return (
      <Form layout={'inline'}>
        {shouldShowAdvancedSwitch && (
          <SwitchInput
            label={$t('Show Advanced Settings')}
            name="advancedMode"
            onChange={switchAdvancedMode}
            value={isAdvancedMode}
            debounce={200}
            disabled={isLoading}
          />
        )}

        {/* CLOSE BUTTON */}
        <Button onClick={close}>{$t('Close')}</Button>

        {/* GO BACK BUTTON */}
        {shouldShowGoBackButton && (
          <Button onClick={goBackToSettings}>{$t('Go back to settings')}</Button>
        )}

        {/* GO LIVE BUTTON */}
        {shouldShowConfirm && (
          <Button type="primary" onClick={goLive} disabled={isLoading || !!error}>
            {$t('Confirm & Go Live')}
          </Button>
        )}
      </Form>
    );
  }

  return (
    <ModalLayout footer={renderFooter()}>
      <Form
        form={form}
        style={{ position: 'relative', height: '100%' }}
        layout="horizontal"
        name="editStreamForm"
      >
        <Animation transitionName={shouldShowChecklist ? 'slideright' : ''}>
          {/* STEP 1 - FILL OUT THE SETTINGS FORM */}
          {shouldShowSettings && <GoLiveSettings key={'settings'} />}

          {/* STEP 2 - RUN THE CHECKLIST */}
          {shouldShowChecklist && <GoLiveChecklist className={styles.page} key={'checklist'} />}
        </Animation>
      </Form>
    </ModalLayout>
  );
}
