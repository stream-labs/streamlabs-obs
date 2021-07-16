import styles from './GoLive.m.less';
import { ModalLayout } from '../../shared/ModalLayout';
import { Button } from 'antd';
import { useOnCreate } from '../../hooks';
import { Services } from '../../service-provider';
import React from 'react';
import { $t } from '../../../services/i18n';
import GoLiveChecklist from './GoLiveChecklist';
import Form, { useForm } from '../../shared/inputs/Form';
import Animation from 'rc-animate';
import { SwitchInput } from '../../shared/inputs';
import { useGoLiveSettings } from './useGoLiveSettings';
import PlatformSettings from './PlatformSettings';
import Scrollable from '../../shared/Scrollable';
import Spinner from '../../shared/Spinner';
import GoLiveError from './GoLiveError';

export default function EditStreamWindow() {
  const { StreamingService, WindowsService } = Services;
  const {
    error,
    lifecycle,
    isMultiplatformMode,
    updateStream,
    isAdvancedMode,
    switchAdvancedMode,
    prepopulate,
    isLoading,
    form,
  } = useGoLiveSettings({ isUpdateMode: true }).select();

  const shouldShowChecklist = lifecycle === 'runChecklist';
  const shouldShowSettings = !shouldShowChecklist;
  const shouldShowUpdateButton = lifecycle !== 'runChecklist';
  const shouldShowGoBackButton = !shouldShowUpdateButton && error;
  const shouldShowAdvancedSwitch = isMultiplatformMode;

  useOnCreate(() => {
    // the streamingService still may keep a error from GoLive flow like a "Post a Tweet" error
    // reset error for allowing update channel info
    StreamingService.actions.resetError();
    prepopulate();
  });

  function close() {
    WindowsService.actions.closeChildWindow();
  }

  function goBackToSettings() {
    StreamingService.actions.showEditStream();
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
            debounce={300}
            disabled={isLoading}
          />
        )}

        {/* CLOSE BUTTON */}
        <Button onClick={close}>{$t('Close')}</Button>

        {/* GO BACK BUTTON */}
        {shouldShowGoBackButton && (
          <Button onClick={goBackToSettings}>{$t('Go back to settings')}</Button>
        )}

        {/* UPDATE BUTTON */}
        {shouldShowUpdateButton && (
          <Button type="primary" onClick={updateStream} disabled={isLoading}>
            {$t('Update')}
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
        <Spinner visible={isLoading} />
        <Animation transitionName="fade">
          {/* STEP 1 - FILL OUT THE SETTINGS FORM */}
          {shouldShowSettings && (
            <Scrollable key={'settings'} style={{ maxHeight: '100%' }} snapToWindowEdge>
              <GoLiveError />
              <PlatformSettings />
            </Scrollable>
          )}

          {/* STEP 2 - RUN THE CHECKLIST */}
          {shouldShowChecklist && <GoLiveChecklist className={styles.page} key={'checklist'} />}
        </Animation>
      </Form>
    </ModalLayout>
  );
}
