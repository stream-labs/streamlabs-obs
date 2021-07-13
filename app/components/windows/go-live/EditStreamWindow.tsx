import TsxComponent from 'components/tsx-component';
import ModalLayout from 'components/ModalLayout.vue';
import { $t } from 'services/i18n';
import { Component } from 'vue-property-decorator';
import styles from './GoLive.m.less';
import { Inject } from 'services/core';
import { UserService } from 'services/user';
import { ToggleInput } from 'components/shared/inputs/inputs';
import cx from 'classnames';
import { SettingsService } from 'services/settings';
import { WindowsService } from 'services/windows';
import { IGoLiveSettings, StreamingService } from 'services/streaming';
import cloneDeep from 'lodash/cloneDeep';
import { StreamSettingsService } from '../../../services/settings/streaming';
import ValidatedForm from '../../shared/inputs/ValidatedForm';
import GoLiveChecklist from './GoLiveChecklist';
import PlatformSettings from './PlatformSettings';
import { TPlatform } from 'services/platforms';

/**
 * Allows to update stream setting while being live
 **/
@Component({})
export default class EditStreamWindow extends TsxComponent<{}> {
  @Inject() private userService: UserService;
  @Inject() private settingsService: SettingsService;
  @Inject() private streamingService: StreamingService;
  @Inject() private streamSettingsService: StreamSettingsService;
  @Inject() private windowsService: WindowsService;

  $refs: {
    form: ValidatedForm;
  };

  private settings: IGoLiveSettings = (() => {
    const settings = cloneDeep(this.streamingService.views.savedSettings);
    // if stream has not been started than we allow to change settings only for a primary platform
    // so delete other platforms from the settings object
    if (this.streamingService.state.info.checklist.startVideoTransmission !== 'done') {
      Object.keys(settings.platforms).forEach((platform: TPlatform) => {
        if (!this.view.checkPrimaryPlatform(platform)) delete settings.platforms[platform];
      });
    }
    return settings;
  })();

  created() {
    // the streamingService still may keep a error from GoLive flow like a "Post a Tweet" error
    // reset error for allowing update channel info
    this.streamingService.actions.resetError();
    this.streamingService.actions.prepopulateInfo();
  }

  private get view() {
    return this.streamingService.views;
  }

  private async submit() {
    if (!(await this.$refs.form.validate())) return;
    await this.streamingService.actions.return.updateStreamSettings(this.settings);
    if (!this.view.info.error) {
      this.$toasted.success($t('Successfully updated'), {
        position: 'bottom-center',
        duration: 1000,
        singleton: true,
      });
    }
  }

  private goBack() {
    this.streamingService.actions.showEditStream();
  }

  private close() {
    this.windowsService.actions.closeChildWindow();
  }

  private switchAdvancedMode(advancedMode: boolean) {
    this.settings.advancedMode = advancedMode;
    this.streamSettingsService.actions.setGoLiveSettings({ advancedMode });
  }

  private render() {
    const lifecycle = this.view.info.lifecycle;
    const shouldShowChecklist = lifecycle === 'runChecklist';
    const shouldShowSettings = !shouldShowChecklist;
    return (
      <ModalLayout customControls={true} showControls={false}>
        <ValidatedForm ref="form" slot="content" name="editStreamForm">
          {shouldShowSettings && <PlatformSettings vModel={this.settings} isUpdateMode={true} />}
          {shouldShowChecklist && <GoLiveChecklist isUpdateMode={true} />}
        </ValidatedForm>
        <div slot="controls">{this.renderControls()}</div>
      </ModalLayout>
    );
  }

  private renderControls() {
    const lifecycle = this.view.info.lifecycle;
    const shouldShowUpdateButton = lifecycle !== 'runChecklist';
    const shouldShowGoBackButton = !shouldShowUpdateButton && this.view.info.error;
    const shouldShowAdvancedSwitch =
      shouldShowUpdateButton && this.view.getEnabledPlatforms(this.settings.platforms).length > 1;

    return (
      <div class="controls" style={{ display: 'flex', 'flex-direction': 'row-reverse' }}>
        {/* UPDATE BUTTON */}
        {shouldShowUpdateButton && (
          <button
            class={cx('button button--action', styles.goLiveButton)}
            onClick={() => this.submit()}
          >
            {$t('Update')}
          </button>
        )}

        {/* GO BACK BUTTON */}
        {shouldShowGoBackButton && (
          <button
            class={cx('button button--action', styles.goLiveButton)}
            onClick={() => this.goBack()}
          >
            {$t('Go back')}
          </button>
        )}

        {/* CLOSE BUTTON */}
        <button
          onClick={() => this.close()}
          class={cx('button button--default', styles.cancelButton)}
        >
          {$t('Close')}
        </button>

        {/* ADVANCED MODE SWITCHER */}
        {shouldShowAdvancedSwitch && (
          <div class={styles.modeToggle}>
            <div>{$t('Show Advanced Settings')}</div>
            <ToggleInput
              onInput={(val: boolean) => this.switchAdvancedMode(val)}
              value={this.settings.advancedMode}
            />
          </div>
        )}
      </div>
    );
  }
}
