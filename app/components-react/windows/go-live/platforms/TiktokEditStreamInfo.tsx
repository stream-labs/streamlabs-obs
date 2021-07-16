import { useGoLiveSettings } from '../useGoLiveSettings';
import React from 'react';
import { createBinding, TextInput } from '../../../shared/inputs';
import Form from '../../../shared/inputs/Form';
import electron from 'electron';
import { $t } from '../../../../services/i18n';
import { Services } from '../../../service-provider';
import { Button } from 'antd';
import InputWrapper from '../../../shared/inputs/InputWrapper';
import { IPlatformComponentParams } from './PlatformSettingsLayout';

export function TiktokEditStreamInfo(p: IPlatformComponentParams<'tiktok'>) {
  const bind = createBinding(p.value, updatedSettings =>
    p.onChange({ ...p.value, ...updatedSettings }),
  );

  return (
    <Form name="tiktok-settings">
      <TextInput label={$t('TikTok Server URL')} required {...bind.serverUrl} />
      <TextInput label={$t('TikTok Stream Key')} required {...bind.streamKey} />
      <InputWrapper
        extra={
          <p>
            <a onClick={openInfoPage}>{$t('Click here to learn more about streaming on TikTok')}</a>
          </p>
        }
      >
        <Button onClick={openStreamPage} style={{ marginBottom: '10px' }}>
          {$t('Locate my Stream Key')}
        </Button>
      </InputWrapper>
    </Form>
  );
}

function openStreamPage() {
  const username = Services.UserService.state.auth?.platforms.tiktok?.username;
  electron.remote.shell.openExternal(`https://www.tiktok.com/@${username}/live`);
}

function openInfoPage() {
  electron.remote.shell.openExternal(
    'https://streamlabs.com/content-hub/post/how-to-livestream-from-your-tiktok-account-using-streamlabs-from-web',
  );
}
