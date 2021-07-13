import { Component } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import ValidatedForm from 'components/shared/inputs/ValidatedForm';
import HFormGroup from 'components/shared/inputs/HFormGroup.vue';
import { createProps } from 'components/tsx-component';
import CommonPlatformFields from '../CommonPlatformFields';
import { ListInput } from 'components/shared/inputs/inputs';
import { formMetadata, IListOption, metadata } from 'components/shared/inputs';
import { $t } from 'services/i18n';
import {
  FacebookService,
  IFacebookLiveVideo,
  IFacebookStartStreamOptions,
} from 'services/platforms/facebook';
import { IStreamSettings, StreamingService } from 'services/streaming';
import { SyncWithValue } from 'services/app/app-decorators';
import BaseEditSteamInfo from './BaseEditSteamInfo';
import moment from 'moment';
import GameSelector from '../GameSelector';
import MessageLayout from '../MessageLayout';
import { UserService } from 'services/user';
import { NavigationService } from 'services/navigation';
import { WindowsService } from 'services/windows';
import Translate from 'components/shared/translate';
import electron from 'electron';
import styles from './FacebookEditStreamInfo.m.less';
import { DismissablesService, EDismissable } from 'services/dismissables';

class Props {
  value?: IStreamSettings = undefined;
  /**
   * show the event selector?
   */
  isScheduleMode?: boolean = false;
  isUpdateMode?: boolean = false;
}

/**
 * Edit Facebook stream settings
 */
@Component({ props: createProps(Props) })
export default class FacebookEditStreamInfo extends BaseEditSteamInfo<Props> {
  @Inject() private userService: UserService;
  @Inject() private facebookService: FacebookService;
  @Inject() private streamingService: StreamingService;
  @Inject() private navigationService: NavigationService;
  @Inject() private windowsService: WindowsService;
  @Inject() private dismissablesService: DismissablesService;
  @SyncWithValue() settings: IStreamSettings;

  private scheduledVideos: IFacebookLiveVideo[] = [];
  private scheduledVideosLoaded = false;

  /**
   * cached pictures for groups and pages
   */
  private pictures: Dictionary<string> = {};

  private get view() {
    return this.streamingService.views;
  }

  private get fbSettings(): IFacebookStartStreamOptions {
    return this.settings.platforms.facebook;
  }

  async created() {
    this.loadScheduledBroadcasts();
    if (this.fbSettings.pageId) this.loadPicture(this.fbSettings.pageId);
    if (this.fbSettings.groupId) this.loadPicture(this.fbSettings.groupId);
  }

  private async loadScheduledBroadcasts() {
    const fbSettings = this.fbSettings;
    let destinationId = this.facebookService.views.getDestinationId(this.fbSettings);

    // by some unknown reason FB returns scheduled events for groups
    // only if you request these events from the user's personal page
    const destinationType =
      fbSettings.destinationType === 'group' ? 'me' : fbSettings.destinationType;
    if (destinationType === 'me') destinationId = 'me';

    this.scheduledVideos = await this.facebookService.fetchScheduledVideos(
      destinationType,
      destinationId,
      true,
    );
    this.scheduledVideosLoaded = true;
  }

  private async loadPicture(objectId: string): Promise<string> {
    if (this.pictures[objectId]) return this.pictures[objectId];
    this.$set(this.pictures, objectId, await this.facebookService.fetchPicture(objectId));
  }

  private async loadPictures(groupOrPage: IFacebookStartStreamOptions['destinationType']) {
    const ids =
      groupOrPage === 'group'
        ? this.facebookService.state.facebookGroups.map(item => item.id)
        : this.facebookService.state.facebookPages.map(item => item.id);
    ids.forEach(id => this.loadPicture(id));
  }

  private get privacyOptions(): IListOption[] {
    const options: any = [
      {
        value: 'EVERYONE',
        title: $t('Public'),
        data: {
          image: 'https://slobs-cdn.streamlabs.com/media/fb_privacy_public.png',
        },
      },
      {
        value: 'ALL_FRIENDS',
        title: $t('Friends'),
        data: {
          image: 'https://slobs-cdn.streamlabs.com/media/fb_privacy_friends.png',
        },
      },
      {
        value: 'SELF',
        title: $t('Only Me'),
        data: {
          image: 'https://slobs-cdn.streamlabs.com/media/fb_privacy_noone.png',
        },
      },
    ];

    // we cant read the privacy property of already created video
    if (this.fbSettings.liveVideoId || this.view.isMidStreamMode) {
      options.unshift({ value: '', title: $t('Do not change privacy settings') });
    }
    return options;
  }

  private get formMetadata() {
    return formMetadata({
      destinationType: metadata.list({
        title: $t('Facebook Destination'),
        fullWidth: true,
        disabled: this.props.isUpdateMode,
        options: [
          {
            value: 'me',
            title: $t('Share to Your Timeline'),
            data: {
              image: this.facebookService.state.userAvatar,
            },
          },
          {
            value: 'page',
            title: $t('Share to a Page You Manage'),
            data: {
              image: 'https://slobs-cdn.streamlabs.com/media/fb-page.png',
            },
          },
          {
            value: 'group',
            title: $t('Share in a Group'),
            data: {
              image: 'https://slobs-cdn.streamlabs.com/media/fb-group.png',
            },
          },
        ].filter(opt => {
          if (opt.value === 'me' && !this.canStreamToTimeline) return false;
          if (opt.value === 'group' && !this.canStreamToGroup) return false;
          return true;
        }),
        required: true,
      }),

      privacy: metadata.list({
        title: $t('Privacy'),
        fullWidth: true,
        options: this.privacyOptions,
        required: true,
      }),

      page: metadata.list({
        title: $t('Facebook Page'),
        fullWidth: true,
        disabled: this.props.isUpdateMode,
        options:
          this.facebookService.state.facebookPages.map(page => ({
            value: page.id,
            title: `${page.name} | ${page.category}`,
            data: { image: this.pictures[page.id] },
          })) || [],
        required: true,
      }),

      group: metadata.list({
        title: $t('Facebook Group'),
        fullWidth: true,
        disabled: this.props.isUpdateMode,
        options:
          this.facebookService.state.facebookGroups.map(group => ({
            value: group.id,
            title: group.name,
            data: { image: this.pictures[group.id] },
          })) || [],
        required: true,
      }),

      fbEvent: metadata.list({
        title: $t('Scheduled Video'),
        fullWidth: true,
        options: [
          ...this.scheduledVideos.map(vid => ({
            value: vid.id,
            title: vid.title,
            data: {
              startTime: vid.planned_start_time
                ? moment(new Date(vid.planned_start_time)).calendar()
                : '',
            },
          })),
        ],
        required: false,
        allowEmpty: true,
        loading: !this.scheduledVideosLoaded,
        placeholder: $t('Not selected'),
      }),
    });
  }

  private onSelectScheduledVideoHandler() {
    // set title and description fields from selected video
    const fbSettings = this.settings.platforms.facebook;
    const selectedLiveVideo = this.scheduledVideos.find(
      video => video.id === fbSettings.liveVideoId,
    );
    if (!selectedLiveVideo) return;
    const { title, description } = selectedLiveVideo;
    fbSettings.title = title;
    fbSettings.description = description;
    fbSettings.privacy = { value: '' }; // we can't read privacy
  }

  private get eventInputSlots() {
    return {
      item: (props: { option: IListOption<string, { startTime: string }> }) => {
        return (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>{props.option.title}</div>
            <div>{props.option.data.startTime}</div>
          </div>
        );
      },
    };
  }

  private get canStreamToTimeline() {
    return this.facebookService.state.grantedPermissions.includes('publish_video');
  }

  private get canStreamToGroup() {
    return this.facebookService.state.grantedPermissions.includes('publish_to_groups');
  }

  private async reLogin() {
    await this.userService.actions.return.reLogin();
    await this.streamingService.actions.showGoLiveWindow();
  }

  private reconnectFB() {
    const platform = 'facebook';
    this.navigationService.actions.navigate('PlatformMerge', { platform });
    this.windowsService.actions.closeChildWindow();
  }

  private openCreateGamingPage() {
    this.facebookService.actions.createFBPage();
  }

  private openIntegrationSettings() {
    electron.remote.shell.openExternal('https://www.facebook.com/settings?tab=business_tools');
  }

  private verifyGroup() {
    const groupId = this.fbSettings.groupId;
    electron.remote.shell.openExternal(`https://www.facebook.com/groups/${groupId}/edit`);
  }

  private dismissWarning() {
    this.dismissablesService.actions.dismiss(EDismissable.FacebookNeedPermissionsTip);
  }

  render() {
    const hasPages = this.facebookService.state.facebookPages.length;
    const fbSettings = this.settings.platforms.facebook;
    const shouldShowGroups = fbSettings.destinationType === 'group' && !this.props.isUpdateMode;
    const shouldShowPages = fbSettings.destinationType === 'page' && !this.props.isUpdateMode;
    const shouldShowGamingWarning = !hasPages && fbSettings.game;
    const shouldShowEvents = !this.props.isUpdateMode && !this.props.isScheduleMode;
    const shouldShowPrivacy = fbSettings.destinationType === 'me';
    const shouldShowPrivacyWarn =
      (!fbSettings.liveVideoId && fbSettings.privacy.value !== 'SELF') ||
      (fbSettings.liveVideoId && fbSettings.privacy.value);
    const shouldShowPermissionWarn =
      (!this.canStreamToTimeline || !this.canStreamToGroup) &&
      this.dismissablesService.views.shouldShow(EDismissable.FacebookNeedPermissionsTip);
    const outageWarn = this.facebookService.state.outageWarning;
    const shouldShowOutageWarn = outageWarn && fbSettings.destinationType === 'group';

    return (
      <ValidatedForm name="facebook-settings">
        {!this.props.isUpdateMode && (
          <div>
            {shouldShowPermissionWarn && this.renderMissedPermissionsWarning()}
            <HFormGroup title={this.formMetadata.destinationType.title}>
              <ListInput
                vModel={this.settings.platforms.facebook.destinationType}
                metadata={this.formMetadata.destinationType}
                imageSize={{ width: 35, height: 35 }}
                onInput={() => this.loadScheduledBroadcasts()}
              />
            </HFormGroup>
          </div>
        )}

        {shouldShowOutageWarn && <MessageLayout type="error" message={outageWarn} />}

        {shouldShowPages && (
          <HFormGroup title={this.formMetadata.page.title}>
            <ListInput
              vModel={fbSettings.pageId}
              metadata={this.formMetadata.page}
              handleOpen={() => this.loadPictures('page')}
              showImagePlaceholder={true}
              imageSize={{ width: 44, height: 44 }}
              onInput={() => this.loadScheduledBroadcasts()}
            />
          </HFormGroup>
        )}

        {shouldShowGroups && (
          <HFormGroup title={this.formMetadata.group.title}>
            <ListInput
              vModel={fbSettings.groupId}
              metadata={this.formMetadata.group}
              handleOpen={() => this.loadPictures('group')}
              showImagePlaceholder={true}
              imageSize={{ width: 44, height: 44 }}
            />
            <p>
              {$t('Make sure the Streamlabs app is added to your Group.')}
              <a onClick={() => this.verifyGroup()}> {$t('Click here to verify.')}</a>
            </p>
          </HFormGroup>
        )}

        {!this.canShowOnlyRequiredFields && (
          <div>
            {shouldShowEvents && (
              <HFormGroup title={this.formMetadata.fbEvent.title}>
                <ListInput
                  vModel={fbSettings.liveVideoId}
                  metadata={this.formMetadata.fbEvent}
                  onInput={() => this.onSelectScheduledVideoHandler()}
                  scopedSlots={this.eventInputSlots}
                />
              </HFormGroup>
            )}

            {shouldShowPrivacy && (
              <HFormGroup title={this.formMetadata.privacy.title}>
                <ListInput
                  vModel={this.settings.platforms.facebook.privacy.value}
                  metadata={this.formMetadata.privacy}
                  imageSize={{ width: 24, height: 24 }}
                  class={styles.privacySelector}
                />
                {shouldShowPrivacyWarn && (
                  <div class="input-description">
                    <Translate
                      message={$t('FBPrivacyWarning')}
                      scopedSlots={{
                        link: (text: string) => (
                          <a onClick={() => this.openIntegrationSettings()}>{{ text }}</a>
                        ),
                      }}
                    />
                  </div>
                )}
              </HFormGroup>
            )}

            <HFormGroup title={$t('Facebook Game')}>
              <GameSelector vModel={this.settings} platform="facebook" />
              {shouldShowGamingWarning && (
                <p>
                  <Translate
                    message={$t('facebookGamingWarning')}
                    scopedSlots={{
                      createPageLink: (text: string) => (
                        <a onClick={() => this.openCreateGamingPage()}>{{ text }}</a>
                      ),
                    }}
                  />
                </p>
              )}
            </HFormGroup>

            <CommonPlatformFields vModel={this.settings} platform={'facebook'} />
          </div>
        )}
      </ValidatedForm>
    );
  }

  private renderMissedPermissionsWarning() {
    const isPrimary = this.view.checkPrimaryPlatform('facebook');
    return (
      <MessageLayout
        message={$t('You can stream to your timeline and groups now')}
        type={'success'}
      >
        {isPrimary && (
          <div>
            <p>{$t('Please log-out and log-in again to get these new features')}</p>
            <button class="button button--facebook" onClick={() => this.reLogin()}>
              {$t('Re-login now')}
            </button>
            <button class="button button--trans" onclick={() => this.dismissWarning()}>
              {$t('Do not show this message again')}
            </button>
          </div>
        )}
        {!isPrimary && (
          <div>
            <p>{$t('Please reconnect Facebook to get these new features')}</p>
            <button class="button button--facebook" onClick={() => this.reconnectFB()}>
              {$t('Reconnect now')}
            </button>
            <button class="button button--trans" onclick={() => this.dismissWarning()}>
              {$t('Do not show this message again')}
            </button>
          </div>
        )}
      </MessageLayout>
    );
  }
}
