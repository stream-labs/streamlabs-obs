import { Component } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import { $t } from 'services/i18n';
import { ISettingsSubCategory } from 'services/settings';
import TsxComponent from 'components/tsx-component';
import {
  ICustomStreamDestination,
  StreamSettingsService,
} from '../../../services/settings/streaming';
import GenericFormGroups from '../../obs/inputs/GenericFormGroups.vue';
import { UserService } from 'services/user';
import styles from './StreamSettings.m.less';
import { RestreamService } from 'services/restream';
import { NavigationService } from 'services/navigation';
import { WindowsService } from 'services/windows';
import { EStreamingState, StreamingService } from 'services/streaming';
import BrowserView from 'components/shared/BrowserView';
import { getPlatformService, TPlatform } from '../../../services/platforms';
import cx from 'classnames';
import ValidatedForm from '../../shared/inputs/ValidatedForm';
import { formMetadata, metadata } from 'components/shared/inputs';
import VFormGroup from '../../shared/inputs/VFormGroup.vue';
import cloneDeep from 'lodash/cloneDeep';
import namingHelpers from '../../../util/NamingHelpers';
import { PlatformLogo } from '../../shared/ReactComponent';
import { MagicLinkService } from 'services/magic-link';

@Component({ components: { GenericFormGroups, PlatformLogo, BrowserView } })
export default class StreamSettings extends TsxComponent {
  @Inject() private streamSettingsService: StreamSettingsService;
  @Inject() private userService: UserService;
  @Inject() private restreamService: RestreamService;
  @Inject() private navigationService: NavigationService;
  @Inject() private windowsService: WindowsService;
  @Inject() private streamingService: StreamingService;
  @Inject() private magicLinkService: MagicLinkService;

  $refs: {
    customDestForm: ValidatedForm;
  };

  private customDestModel: ICustomStreamDestination = {
    name: '',
    url: '',
    streamKey: '',
    enabled: false,
  };
  private customDestMetadata = formMetadata({
    name: metadata.text({ title: $t('Name'), required: true }),
    url: metadata.text({ title: 'URL', required: true }),
    streamKey: metadata.text({ title: $t('Stream Key'), masked: true }),
  });

  private editCustomDestMode: boolean | number = false;

  get platforms() {
    return this.streamingView.allPlatforms.filter(platform => {
      // Only show tiktok if it's already linked
      if (platform === 'tiktok') {
        return !!this.userService.views.auth?.platforms?.tiktok;
      }

      return true;
    });
  }

  saveObsSettings(obsSettings: ISettingsSubCategory[]) {
    this.streamSettingsService.setObsStreamSettings(obsSettings);
  }

  get obsSettings() {
    return this.streamSettingsService.views.obsStreamSettings;
  }

  disableProtectedMode() {
    this.streamSettingsService.actions.setSettings({ protectedModeEnabled: false });
  }

  private enableProtectedMode() {
    this.streamSettingsService.actions.setSettings({
      protectedModeEnabled: true,
      key: '',
      streamType: 'rtmp_common',
    });
  }

  get protectedModeEnabled(): boolean {
    return this.streamSettingsService.protectedModeEnabled;
  }

  get streamingView() {
    return this.streamingService.views;
  }

  get needToShowWarning() {
    return this.userService.isLoggedIn && !this.protectedModeEnabled;
  }

  get canEditSettings() {
    return this.streamingService.state.streamingStatus === EStreamingState.Offline;
  }

  get customDestinations() {
    return this.streamingView.savedSettings.customDestinations;
  }

  private platformMerge(platform: TPlatform) {
    this.navigationService.navigate('PlatformMerge', { platform });
    this.windowsService.actions.closeChildWindow();
  }

  private platformUnlink(platform: TPlatform) {
    getPlatformService(platform).unlink();
  }

  private editCustomDest(ind: number) {
    this.customDestModel = cloneDeep(this.customDestinations[ind]);
    this.editCustomDestMode = ind;
  }

  private addCustomDest() {
    if (!this.userService.isPrime) {
      this.magicLinkService.actions.linkToPrime('slobs-multistream');
      return;
    }
    this.customDestModel = {
      name: this.suggestCustomDestName(),
      streamKey: '',
      url: '',
      enabled: false,
    };
    this.editCustomDestMode = true;
  }

  private async saveCustomDest() {
    if (!(await this.$refs.customDestForm.validate())) return;

    // add "/" to the end of url string
    if (
      this.customDestModel.streamKey &&
      this.customDestModel.url.charAt(this.customDestModel.url.length - 1) !== '/'
    ) {
      this.customDestModel.url += '/';
    }

    const destinations = cloneDeep(this.customDestinations);
    const isUpdateMode = typeof this.editCustomDestMode === 'number';
    if (isUpdateMode) {
      const ind = this.editCustomDestMode as number;
      destinations.splice(ind, 1, this.customDestModel);
    } else {
      destinations.push(this.customDestModel);
    }
    this.streamSettingsService.setGoLiveSettings({ customDestinations: destinations });
    this.editCustomDestMode = false;
  }

  private suggestCustomDestName() {
    const destinations = this.customDestinations;
    return namingHelpers.suggestName($t('Destination'), (name: string) =>
      destinations.find(dest => dest.name === name),
    );
  }

  private removeCustomDest(ind: number) {
    const destinations = cloneDeep(this.customDestinations);
    destinations.splice(ind, 1);
    this.streamSettingsService.setGoLiveSettings({ customDestinations: destinations });
  }

  render() {
    return (
      <div>
        {/* account info */}
        {this.protectedModeEnabled && (
          <div>
            <h2>{$t('Stream Destinations')}</h2>
            {this.platforms.map(platform => this.renderPlatform(platform))}

            {<div>{this.renderCustomDestinations()}</div>}

            {this.canEditSettings && (
              <div>
                <a onClick={this.disableProtectedMode}>{$t('Stream to custom ingest')}</a>
              </div>
            )}
          </div>
        )}

        {/* WARNING messages */}
        {!this.canEditSettings && (
          <div class="section section--warning">
            {$t("You can not change these settings when you're live")}
          </div>
        )}
        {this.needToShowWarning && (
          <div class="section section--warning">
            <b>{$t('Warning')}: </b>
            {$t(
              'Streaming to a custom ingest is advanced functionality. Some features of Streamlabs OBS may stop working as expected',
            )}
            <br />
            <br />

            {this.canEditSettings && (
              <button class="button button--warn" onClick={() => this.enableProtectedMode()}>
                {$t('Use recommended settings')}
              </button>
            )}
          </div>
        )}

        {/* OBS settings */}
        {!this.protectedModeEnabled && this.canEditSettings && (
          <GenericFormGroups value={this.obsSettings} onInput={this.saveObsSettings} />
        )}
      </div>
    );
  }

  private renderPlatform(platform: TPlatform) {
    const isMerged = this.streamingView.checkPlatformLinked(platform);
    const username = this.userService.state.auth.platforms[platform]?.username;
    const platformName = getPlatformService(platform).displayName;
    const buttonClass = {
      facebook: 'button--facebook',
      youtube: 'button--youtube',
      twitch: 'button--twitch',
      tiktok: 'button--tiktok',
    }[platform];
    const isPrimary = this.streamingView.checkPrimaryPlatform(platform);
    const shouldShowPrimaryBtn = isPrimary;
    const shouldShowConnectBtn = !isMerged && this.canEditSettings;
    const shouldShowUnlinkBtn = !isPrimary && isMerged && this.canEditSettings;

    return (
      <div class="section flex">
        <div class="margin-right--20" style={{ width: '50px' }}>
          <PlatformLogo componentProps={{ platform, size: 'medium' }} class={styles.platformLogo} />
        </div>
        <div>
          {platformName} <br />
          {isMerged ? username : <span style={{ opacity: '0.5' }}>{$t('unlinked')}</span>} <br />
        </div>

        <div style={{ marginLeft: 'auto' }}>
          {shouldShowConnectBtn && (
            <span>
              <button
                onclick={() => this.platformMerge(platform)}
                class={cx(`button ${buttonClass}`, styles.platformButton)}
              >
                {$t('Connect')}
              </button>
            </span>
          )}
          {shouldShowUnlinkBtn && (
            <button
              onclick={() => this.platformUnlink(platform)}
              class={cx('button button--soft-warning', styles.platformButton)}
            >
              {$t('Unlink')}
            </button>
          )}
          {shouldShowPrimaryBtn && (
            <span
              vTooltip={$t(
                'You cannot unlink the platform you used to sign in to Streamlabs OBS. If you want to unlink this platform, please sign in with a different platform.',
              )}
            >
              <button disabled={true} class={cx('button button--action', styles.platformButton)}>
                {$t('Logged in')}
              </button>
            </span>
          )}
        </div>
      </div>
    );
  }

  private renderCustomDestinations() {
    const isPrime = this.userService.isPrime;
    const shouldShowPrimeLabel = !isPrime;
    const destinations = this.customDestinations;
    const isEditMode = this.editCustomDestMode !== false;
    const shouldShowAddForm = this.editCustomDestMode === true;
    const canAddMoreDestinations = destinations.length < 2;
    return (
      <p>
        {destinations.map((dest, ind) => this.renderCustomDestination(dest, ind))}
        {!isEditMode && canAddMoreDestinations && (
          <a class={styles.addDestinationBtn} onclick={() => this.addCustomDest()}>
            <i class="fa fa-plus" />
            <span>{$t('Add Destination')}</span>
            {shouldShowPrimeLabel ? (
              <b class={styles.prime}>prime</b>
            ) : (
              <div class={styles.prime} />
            )}
          </a>
        )}
        {!canAddMoreDestinations && <p>{$t('Maximum custom destinations has been added')}</p>}
        {shouldShowAddForm && <div class="section">{this.renderCustomDestForm()}</div>}
      </p>
    );
  }

  private renderCustomDestination(dest: ICustomStreamDestination, ind: number) {
    const isEditMode = this.editCustomDestMode === ind;
    return (
      <div class="section">
        <div class="flex">
          <div class="margin-right--20" style={{ width: '50px' }}>
            <i class={cx(styles.destinationLogo, 'fa fa-globe')} />
          </div>
          <div class={styles.destinationName}>
            <span>{dest.name}</span> <br />
            {dest.url}
            <br />
          </div>

          <div style={{ marginLeft: 'auto' }}>
            {!isEditMode && (
              <div>
                <i
                  class={cx('fa fa-trash', styles.actionIcon)}
                  onClick={() => this.removeCustomDest(ind)}
                />
                <i
                  class={cx('fa fa-pen', styles.actionIcon)}
                  onClick={() => this.editCustomDest(ind)}
                />
              </div>
            )}
          </div>
        </div>
        {isEditMode && this.renderCustomDestForm()}
      </div>
    );
  }

  private renderCustomDestForm() {
    return (
      <ValidatedForm ref="customDestForm">
        <VFormGroup vModel={this.customDestModel.name} metadata={this.customDestMetadata.name} />
        <VFormGroup vModel={this.customDestModel.url} metadata={this.customDestMetadata.url} />
        <VFormGroup
          vModel={this.customDestModel.streamKey}
          metadata={this.customDestMetadata.streamKey}
        />

        <p style={{ textAlign: 'right' }}>
          <button class="button button--default" onClick={() => (this.editCustomDestMode = false)}>
            {$t('Cancel')}
          </button>
          <button class="button button--action" onClick={() => this.saveCustomDest()}>
            {$t('Save')}
          </button>
        </p>
      </ValidatedForm>
    );
  }
}
