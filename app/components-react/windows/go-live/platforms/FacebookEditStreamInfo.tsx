import { isAdvancedMode, TSetPlatformSettingsFn } from '../go-live';
import FormSection from '../../../shared/inputs/FormSection';
import CommonPlatformFields from '../CommonPlatformFields';
import React, { useState } from 'react';
import { Services } from '../../../service-provider';
import { TTwitchTag } from '../../../../services/platforms/twitch/tags';
import { IGoLiveSettings } from '../../../../services/streaming';
import { TPlatform } from '../../../../services/platforms';
import ContextForm from '../../../shared/inputs/ContextForm';
import { useStateActions, useVuex } from '../../../hooks';
import { assertIsDefined } from '../../../../util/properties-type-guards';
import { EDismissable } from '../../../../services/dismissables';
import { $t } from '../../../../services/i18n';
import { createVModel, ListInput } from '../../../shared/inputs';
import { TwitchTagsInput } from './TwitchTagsInput';
import GameSelector from '../GameSelector';
import { IFacebookStartStreamOptions } from '../../../../services/platforms/facebook';

interface IProps {
  settings: IGoLiveSettings;
  setPlatformSettings: TSetPlatformSettingsFn;
  isScheduleMode?: boolean;
  isUpdateMode?: boolean;
}

export default function FacebookEditStreamInfo(p: IProps) {
  // calculate variables from props
  const fbSettings = p.settings.platforms.facebook;
  assertIsDefined(fbSettings);
  const isAdvanced = isAdvancedMode(p.settings);
  const shouldShowGroups = fbSettings.destinationType === 'group' && !p.isUpdateMode;
  const shouldShowPages = fbSettings.destinationType === 'page' && !p.isUpdateMode;
  const shouldShowEvents = !p.isUpdateMode && !p.isScheduleMode;
  const shouldShowPrivacy = fbSettings.destinationType === 'me';
  const shouldShowPrivacyWarn =
    (!fbSettings.liveVideoId && fbSettings.privacy?.value !== 'SELF') ||
    (fbSettings.liveVideoId && fbSettings.privacy?.value);
  const vModel = createVModel(fbSettings, newFbSettings =>
    p.setPlatformSettings('facebook', newFbSettings),
  );

  // inject services
  const { FacebookService, DismissablesService } = Services;

  // define local state
  const { s, setItem } = useStateActions({ pictures: {} as Record<string, string> });

  // define vuex state
  const v = useVuex(() => {
    const state = FacebookService.state;
    const hasPages = !!state.facebookPages.length;
    const canStreamToTimeline = state.grantedPermissions.includes('publish_video');
    const canStreamToGroup = state.grantedPermissions.includes('publish_to_groups');
    return {
      canStreamToTimeline,
      canStreamToGroup,
      hasPages,
      shouldShowGamingWarning: hasPages && fbSettings.game,
      shouldShowPermissionWarn:
        (!canStreamToTimeline || !canStreamToGroup) &&
        DismissablesService.views.shouldShow(EDismissable.FacebookNeedPermissionsTip),
    };
  });

  async function loadPicture(objectId: string) {
    if (s.pictures[objectId]) return s.pictures[objectId];
    setItem('pictures', objectId, await FacebookService.fetchPicture(objectId));
  }

  function loadPictures(groupOrPage: IFacebookStartStreamOptions['destinationType']) {
    const ids =
      groupOrPage === 'group'
        ? FacebookService.state.facebookGroups.map(item => item.id)
        : FacebookService.state.facebookPages.map(item => item.id);
    ids.forEach(id => loadPicture(id));
  }

  function render() {
    return (
      <FormSection name="facebook-settings">
        {isAdvanced
          ? [renderRequiredFields(), renderOptionalFields(), renderCommonFields()]
          : [renderCommonFields(), renderRequiredFields()]}

        {v.shouldShowPermissionWarn && renderMissedPermissionsWarning()}

        {/*{shouldShowPages && (*/}
        {/*  <HFormGroup title={this.formMetadata.page.title}>*/}
        {/*    <ListInput*/}
        {/*      vModel={fbSettings.pageId}*/}
        {/*      metadata={this.formMetadata.page}*/}
        {/*      handleOpen={() => this.loadPictures('page')}*/}
        {/*      showImagePlaceholder={true}*/}
        {/*      imageSize={{ width: 44, height: 44 }}*/}
        {/*    />*/}
        {/*  </HFormGroup>*/}
        {/*)}*/}

        {/*{shouldShowGroups && (*/}
        {/*  <HFormGroup title={this.formMetadata.group.title}>*/}
        {/*    <ListInput*/}
        {/*      vModel={fbSettings.groupId}*/}
        {/*      metadata={this.formMetadata.group}*/}
        {/*      handleOpen={() => this.loadPictures('group')}*/}
        {/*      showImagePlaceholder={true}*/}
        {/*      imageSize={{ width: 44, height: 44 }}*/}
        {/*    />*/}
        {/*    <p>*/}
        {/*      {$t('Make sure the Streamlabs app is added to your Group.')}*/}
        {/*      <a onClick={() => this.verifyGroup()}> {$t('Click here to verify.')}</a>*/}
        {/*    </p>*/}
        {/*  </HFormGroup>*/}
        {/*)}*/}
      </FormSection>
    );
  }

  function renderCommonFields() {
    return <CommonPlatformFields {...p} platform="facebook" />;
  }

  function renderRequiredFields() {
    return (
      <>
        {!p.isUpdateMode && (
          <>
            <ListInput
              label={$t('Facebook Destination')}
              {...vModel('destinationType')}
              hasImage
              imageSize={{ width: 35, height: 35 }}
              options={getDestinationOptions()}
            />
            {shouldShowPages && (
              <ListInput
                {...vModel('pageId')}
                onDropdownVisibleChange={() => loadPictures('page')}
                hasImage
                imageSize={{ width: 44, height: 44 }}
                options={FacebookService.state.facebookPages.map(page => ({
                  value: page.id,
                  label: `${page.name} | ${page.category}`,
                  image: s.pictures[page.id],
                }))}
              />
            )}
          </>
        )}
      </>
    );
  }

  function renderOptionalFields() {
    return (
      <>
        {/*{shouldShowEvents && (*/}
        {/*  <HFormGroup title={this.formMetadata.fbEvent.title}>*/}
        {/*    <ListInput*/}
        {/*      vModel={fbSettings.liveVideoId}*/}
        {/*      metadata={this.formMetadata.fbEvent}*/}
        {/*      onInput={() => this.onSelectScheduledVideoHandler()}*/}
        {/*      scopedSlots={this.eventInputSlots}*/}
        {/*    />*/}
        {/*  </HFormGroup>*/}
        {/*)}*/}

        {/*{shouldShowPrivacy && (*/}
        {/*  <HFormGroup title={this.formMetadata.privacy.title}>*/}
        {/*    <ListInput*/}
        {/*      vModel={this.settings.platforms.facebook.privacy.value}*/}
        {/*      metadata={this.formMetadata.privacy}*/}
        {/*      imageSize={{ width: 24, height: 24 }}*/}
        {/*      class={styles.privacySelector}*/}
        {/*    />*/}
        {/*    {shouldShowPrivacyWarn && (*/}
        {/*      <div class="input-description">*/}
        {/*        <Translate*/}
        {/*          message={$t('FBPrivacyWarning')}*/}
        {/*          scopedSlots={{*/}
        {/*            link: (text: string) => (*/}
        {/*              <a onClick={() => this.openIntegrationSettings()}>{{ text }}</a>*/}
        {/*            ),*/}
        {/*          }}*/}
        {/*        />*/}
        {/*      </div>*/}
        {/*    )}*/}
        {/*  </HFormGroup>*/}
        {/*)}*/}

        {/*<HFormGroup title={$t('Facebook Game')}>*/}
        {/*  <GameSelector vModel={this.settings} platform="facebook" />*/}
        {/*  {shouldShowGamingWarning && (*/}
        {/*    <p>*/}
        {/*      <Translate*/}
        {/*        message={$t('facebookGamingWarning')}*/}
        {/*        scopedSlots={{*/}
        {/*          createPageLink: (text: string) => (*/}
        {/*            <a onClick={() => this.openCreateGamingPage()}>{{ text }}</a>*/}
        {/*          ),*/}
        {/*        }}*/}
        {/*      />*/}
        {/*    </p>*/}
        {/*  )}*/}
        {/*</HFormGroup>*/}
      </>
    );
  }

  function renderMissedPermissionsWarning() {
    // TODO:
    return <div>renderMissedPermissionsWarning</div>;
    // const isPrimary = this.view.isPrimaryPlatform('facebook');
    // return (
    //   <MessageLayout
    //     message={$t('You can stream to your timeline and groups now')}
    //     type={'success'}
    //   >
    //     {isPrimary && (
    //       <div>
    //         <p>{$t('Please log-out and log-in again to get these new features')}</p>
    //         <button class="button button--facebook" onClick={() => this.reLogin()}>
    //           {$t('Re-login now')}
    //         </button>
    //         <button class="button button--trans" onclick={() => this.dismissWarning()}>
    //           {$t('Do not show this message again')}
    //         </button>
    //       </div>
    //     )}
    //     {!isPrimary && (
    //       <div>
    //         <p>{$t('Please reconnect Facebook to get these new features')}</p>
    //         <button class="button button--facebook" onClick={() => this.reconnectFB()}>
    //           {$t('Reconnect now')}
    //         </button>
    //         <button class="button button--trans" onclick={() => this.dismissWarning()}>
    //           {$t('Do not show this message again')}
    //         </button>
    //       </div>
    //     )}
    //   </MessageLayout>
    // );
  }

  function getDestinationOptions() {
    return [
      {
        value: 'me',
        label: $t('Share to Your Timeline'),
        image: FacebookService.state.userAvatar,
      },
      {
        value: 'page',
        label: $t('Share to a Page You Manage'),
        image: 'https://slobs-cdn.streamlabs.com/media/fb-page.png',
      },
      {
        value: 'group',
        label: $t('Share in a Group'),
        image: 'https://slobs-cdn.streamlabs.com/media/fb-group.png',
      },
    ].filter(opt => {
      if (opt.value === 'me' && !v.canStreamToTimeline) return false;
      if (opt.value === 'group' && !v.canStreamToGroup) return false;
      return true;
    });
  }

  return render();
}
