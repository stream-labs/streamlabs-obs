import { CommonPlatformFields } from './CommonPlatformFields';
import { useGoLiveSettings } from './useGoLiveSettings';
import { $t } from '../../../services/i18n';
import React from 'react';
import { TPlatform } from '../../../services/platforms';
import { TwitchEditStreamInfo } from './platforms/TwitchEditStreamInfo';
import { Section } from './Section';
import { YoutubeEditStreamInfo } from './platforms/YoutubeEditStreamInfo';
import FacebookEditStreamInfo from './platforms/FacebookEditStreamInfo';
import { TiktokEditStreamInfo } from './platforms/TiktokEditStreamInfo';
import { IPlatformComponentParams, TLayoutMode } from './platforms/PlatformSettingsLayout';
import { getDefined } from '../../../util/properties-type-guards';

export default function PlatformSettings() {
  const {
    isMultiplatformMode,
    error,
    isAdvancedMode,
    enabledPlatforms,
    getPlatformDisplayName,
    isLoading,
    updatePlatform,
    platforms,
    commonFields,
    updateCommonFields,
    descriptionIsRequired,
    getPlatformSettings,
  } = useGoLiveSettings().selectExtra(settings => {
    const fbSettings = settings.platforms['facebook'];
    const descriptionIsRequired = fbSettings && fbSettings.enabled && !fbSettings.useCustomFields;
    return { descriptionIsRequired };
  });

  const shouldShowSettings = !error && !isLoading;

  let layoutMode: TLayoutMode;
  if (isMultiplatformMode) {
    layoutMode = isAdvancedMode ? 'multiplatformAdvanced' : 'multiplatformSimple';
  } else {
    layoutMode = 'singlePlatform';
  }

  function createPlatformBinding<T extends TPlatform>(platform: T): IPlatformComponentParams<T> {
    return {
      layoutMode,
      get value() {
        return getDefined(getPlatformSettings(platform));
      },
      onChange(newSettings) {
        updatePlatform(platform, newSettings);
      },
    };
  }

  return (
    // minHeight is required for the loading spinner
    <div style={{ minHeight: '150px' }}>
      {shouldShowSettings && (
        <div style={{ width: '100%' }}>
          {/*COMMON FIELDS*/}
          {isMultiplatformMode && (
            <Section isSimpleMode={!isAdvancedMode} title={$t('Common Stream Settings')}>
              <CommonPlatformFields
                descriptionIsRequired={descriptionIsRequired}
                value={commonFields}
                onChange={updateCommonFields}
              />
            </Section>
          )}

          {/*SETTINGS FOR EACH ENABLED PLATFORM*/}
          {enabledPlatforms.map((platform: TPlatform) => (
            <Section
              title={$t('%{platform} Settings', { platform: getPlatformDisplayName(platform) })}
              isSimpleMode={!isAdvancedMode}
              key={platform}
            >
              {platform === 'twitch' && (
                <TwitchEditStreamInfo {...createPlatformBinding('twitch')} />
              )}
              {platform === 'facebook' && (
                <FacebookEditStreamInfo {...createPlatformBinding('facebook')} />
              )}
              {platform === 'youtube' && (
                <YoutubeEditStreamInfo {...createPlatformBinding('youtube')} />
              )}
              {platform === 'tiktok' && (
                <TiktokEditStreamInfo {...createPlatformBinding('tiktok')} />
              )}
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}
