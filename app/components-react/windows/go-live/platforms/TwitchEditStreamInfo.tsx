import { useGoLiveSettings } from '../useGoLiveSettings';
import CommonPlatformFields from '../CommonPlatformFields';
import React from 'react';
import { createBinding } from '../../../shared/inputs';
import { $t } from '../../../../services/i18n';
import { TwitchTagsInput } from './TwitchTagsInput';
import GameSelector from '../GameSelector';
import Form from '../../../shared/inputs/Form';

export function TwitchEditStreamInfo() {
  const { updatePlatform, renderPlatformSettings, getSettings, useBinding } = useGoLiveSettings();

  const bind = useBinding(
    () => getSettings().platforms.twitch,
    updatedSettings => updatePlatform('twitch', updatedSettings),
  );

  return (
    <Form name="twitch-settings">
      {renderPlatformSettings(
        <CommonPlatformFields key="common" platform="twitch" />,
        <GameSelector key="required" platform={'twitch'} {...bind.game} />,
        <TwitchTagsInput key="optional" label={$t('Twitch Tags')} {...bind.tags} />,
      )}
    </Form>
  );
}
