import TsxComponent, { createProps } from 'components/tsx-component';
import { $t } from 'services/i18n';
import { Component } from 'vue-property-decorator';
import { Inject } from 'services/core';
import { UserService } from 'services/user';
import { getPlatformService, TPlatform } from 'services/platforms';
import { IGoLiveSettings, StreamingService } from 'services/streaming';
import { Spinner } from 'streamlabs-beaker';
import { StreamSettingsService } from '../../../services/settings/streaming';
import ValidatedForm from 'components/shared/inputs/ValidatedForm';
import GoLiveError from './GoLiveError';
import { SyncWithValue } from '../../../services/app/app-decorators';
import CommonPlatformFields from './CommonPlatformFields';
import TwitchEditStreamInfo from './platforms/TwitchEditStreamInfo';
import FacebookEditStreamInfo from './platforms/FacebookEditStreamInfo';
import YoutubeEditStreamInfo from './platforms/youtube/YoutubeEditStreamInfo';
import Section from './Section';

class Props {
  isScheduleMode?: boolean = false;
  isUpdateMode?: boolean = false;
}
/**
 * Renders the form with stream settings for each enabled platform
 **/
@Component({ props: createProps(Props) })
export default class PlatformSettings extends TsxComponent<Props> {
  @Inject() private streamingService: StreamingService;
  @Inject() private streamSettingsService: StreamSettingsService;
  @Inject() private userService: UserService;

  @SyncWithValue()
  private settings: IGoLiveSettings = null;

  private get view() {
    return this.streamingService.views;
  }

  private getPlatformName(platform: TPlatform): string {
    return getPlatformService(platform).displayName;
  }

  private render() {
    const enabledPlatforms = Object.keys(this.settings.platforms).filter(
      dest => this.settings.platforms[dest].enabled,
    ) as TPlatform[];

    // don't render platform settings if platform has not prepopulated the channel data
    if (!this.view.isPrepopulated) {
      return '';
    }
    const hasPlatforms = enabledPlatforms.length > 0;
    const isErrorMode = this.view.info.error;
    const isLoadingMode =
      !isErrorMode && ['empty', 'prepopulate'].includes(this.view.info.lifecycle);
    const shouldShowSettings = !isErrorMode && !isLoadingMode && hasPlatforms;
    const isMultiplePlatformMode = enabledPlatforms.length > 1;
    return (
      <ValidatedForm class="flex" ref="settingsForm">
        <div style={{ width: '100%' }}>
          {!hasPlatforms && $t('Enable at least one destination to start streaming')}

          {isLoadingMode && this.renderLoading()}
          <GoLiveError />

          {shouldShowSettings && (
            <div style={{ width: '100%' }}>
              {/*COMMON FIELDS*/}
              {isMultiplePlatformMode && <CommonPlatformFields vModel={this.settings} />}

              {/*SETTINGS FOR EACH ENABLED PLATFORM*/}
              {enabledPlatforms.map((platform: TPlatform) => this.renderPlatformSettings(platform))}
            </div>
          )}
        </div>
      </ValidatedForm>
    );
  }

  /**
   * Renders settings for one platform
   */
  private renderPlatformSettings(platform: TPlatform) {
    const isAdvancedMode = this.view.savedSettings.advancedMode && this.view.isMultiplatformMode;
    const title = $t('%{platform} Settings', { platform: this.getPlatformName(platform) });
    return (
      <Section title={title} isSimpleMode={!isAdvancedMode}>
        {platform === 'twitch' && <TwitchEditStreamInfo vModel={this.settings} />}
        {platform === 'facebook' && (
          <FacebookEditStreamInfo
            vModel={this.settings}
            isScheduleMode={this.props.isScheduleMode}
            isUpdateMode={this.props.isUpdateMode}
          />
        )}
        {platform === 'youtube' && (
          <YoutubeEditStreamInfo
            vModel={this.settings}
            isScheduleMode={this.props.isScheduleMode}
          />
        )}
      </Section>
    );
  }

  private renderLoading() {
    return <Spinner />;
  }
}
