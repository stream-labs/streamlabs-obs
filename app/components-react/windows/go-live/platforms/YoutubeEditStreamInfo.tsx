import { CommonPlatformFields } from '../CommonPlatformFields';
import {
  CheckboxInput,
  createBinding,
  ImageInput,
  InputComponent,
  ListInput,
} from '../../../shared/inputs';
import React, { useEffect } from 'react';
import { Services } from '../../../service-provider';
import { $t } from '../../../../services/i18n';
import BroadcastInput from './BroadcastInput';
import { useAsyncState } from '../../../hooks';
import InputWrapper from '../../../shared/inputs/InputWrapper';
import Form from '../../../shared/inputs/Form';
import electron from 'electron';
import { IYoutubeStartStreamOptions } from '../../../../services/platforms/youtube';
import PlatformSettingsLayout, { IPlatformComponentParams } from './PlatformSettingsLayout';

/***
 * Stream Settings for YT
 */
export const YoutubeEditStreamInfo = InputComponent((p: IPlatformComponentParams<'youtube'>) => {
  const { YoutubeService, StreamingService } = Services;
  const { isScheduleMode, isUpdateMode } = p;
  const isMidStreamMode = StreamingService.views.isMidStreamMode;

  function updateSettings(patch: Partial<IYoutubeStartStreamOptions>) {
    p.onChange({ ...ytSettings, ...patch });
  }

  const ytSettings = p.value;
  const is360video = ytSettings.projection === '360';
  const shouldShowSafeForKidsWarn = ytSettings.selfDeclaredMadeForKids;
  const broadcastId = ytSettings.broadcastId;
  const bind = createBinding(
    ytSettings,
    newYtSettings => updateSettings(newYtSettings),
    fieldName => ({ disabled: fieldIsDisabled(fieldName as keyof IYoutubeStartStreamOptions) }),
  );

  const [{ broadcastLoading, broadcasts }] = useAsyncState(
    { broadcastLoading: true, broadcasts: [] },
    async () => {
      return {
        broadcastLoading: false,
        broadcasts: await YoutubeService.actions.return.fetchEligibleBroadcasts(),
      };
    },
  );

  useEffect(() => {
    if (!broadcastId) return;
    YoutubeService.actions.return
      .fetchStartStreamOptionsForBroadcast(broadcastId)
      .then(newYtSettings => {
        updateSettings(newYtSettings);
      });
  }, [broadcastId]);

  function openThumbnailsEditor() {
    electron.remote.shell.openExternal(
      'https://streamlabs.com/dashboard#/prime/thumbnails?refl=slobs-thumbnail-editor',
    );
  }

  function fieldIsDisabled(fieldName: keyof IYoutubeStartStreamOptions): boolean {
    // selfDeclaredMadeForKids can be set only on the broadcast creating step
    if (broadcastId && fieldName === 'selfDeclaredMadeForKids') {
      return true;
    }

    if (!isMidStreamMode) return false;
    return !YoutubeService.updatableSettings.includes(fieldName);
  }

  function projectionChangeHandler(enable360: boolean) {
    updateSettings({ projection: enable360 ? '360' : 'rectangular' });
  }

  function renderCommonFields() {
    return (
      <CommonPlatformFields
        key="common"
        platform="youtube"
        layoutMode={p.layoutMode}
        value={ytSettings}
        onChange={updateSettings}
      />
    );
  }

  function renderBroadcastInput() {
    return (
      <div key={'broadcast'}>
        {!isScheduleMode && (
          <BroadcastInput
            label={$t('Event')}
            loading={broadcastLoading}
            broadcasts={broadcasts}
            disabled={isUpdateMode}
            {...bind.broadcastId}
          />
        )}
      </div>
    );
  }

  function renderOptionalFields() {
    return (
      <div key="optional">
        <ListInput
          {...bind.privacyStatus}
          label={$t('Privacy')}
          options={[
            {
              value: 'public',
              label: $t('Public'),
              description: $t('Anyone can search for and view'),
            },
            {
              value: 'unlisted',
              label: $t('Unlisted'),
              description: $t('Anyone with the link can view'),
            },
            { value: 'private', label: $t('Private'), description: $t('Only you can view') },
          ]}
        />
        <ListInput
          {...bind.categoryId}
          label={$t('Category')}
          showSearch
          options={YoutubeService.state.categories.map(category => ({
            value: category.id,
            label: category.snippet.title,
          }))}
        />
        <ImageInput
          label={$t('Thumbnail')}
          maxFileSize={2 * 1024 * 1024} // 2 mb
          extra={<a onClick={openThumbnailsEditor}>{$t('Try our new thumbnail editor')}</a>}
          {...bind.thumbnail}
        />

        <ListInput
          label={$t('Stream Latency')}
          tooltip={$t('latencyTooltip')}
          options={[
            { value: 'normal', label: $t('Normal Latency') },
            { value: 'low', label: $t('Low-latency') },
            {
              value: 'ultraLow',
              label: $t('Ultra low-latency'),
              description: $t('Does not support: Closed captions, 1440p, and 4k resolutions'),
            },
          ]}
          {...bind.latencyPreference}
        />

        <InputWrapper label={$t('Additional Settings')}>
          {!isScheduleMode && (
            <CheckboxInput
              {...bind.enableAutoStart}
              label={$t('Enable Auto-start')}
              tooltip={$t(
                'Enabling auto-start will automatically start the stream when you start sending data from your streaming software',
              )}
            />
          )}
          {!isScheduleMode && (
            <CheckboxInput
              {...bind.enableAutoStop}
              label={$t('Enable Auto-stop')}
              tooltip={$t(
                'Enabling auto-stop will automatically stop the stream when you stop sending data from your streaming software',
              )}
            />
          )}
          <CheckboxInput
            {...bind.enableDvr}
            label={$t('Enable DVR')}
            tooltip={$t(
              'DVR controls enable the viewer to control the video playback experience by pausing, rewinding, or fast forwarding content',
            )}
          />
          <CheckboxInput
            label={$t('360° video')}
            value={is360video}
            onChange={projectionChangeHandler}
          />
          <CheckboxInput label={$t('Made for kids')} {...bind.selfDeclaredMadeForKids} />
          {shouldShowSafeForKidsWarn && (
            <p>
              {$t(
                "Features like personalized ads and live chat won't be available on live streams made for kids.",
              )}
            </p>
          )}
        </InputWrapper>
      </div>
    );
  }

  return (
    <Form name="youtube-settings">
      <PlatformSettingsLayout
        layoutMode={p.layoutMode}
        commonFields={renderCommonFields()}
        requiredFields={<div key={'empty'} />}
        optionalFields={renderOptionalFields()}
        essentialOptionalFields={renderBroadcastInput()}
      />
    </Form>
  );
});
