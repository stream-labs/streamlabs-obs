import React from 'react';
import { remote } from 'electron';
import { Input, Button } from 'antd';
import { InputProps } from 'antd/lib/input';
import { InputComponent, useInput, TSlobsInputProps } from './inputs';
import InputWrapper from './InputWrapper';
import { $t } from '../../../services/i18n';

type TFileInputProps = TSlobsInputProps<
  { directory?: boolean; filters?: Electron.FileFilter[] },
  string,
  InputProps
>;

export const FileInput = InputComponent((p: TFileInputProps) => {
  const { inputAttrs, wrapperAttrs } = useInput('text', p);

  async function showFileDialog() {
    const options: Electron.OpenDialogOptions = {
      defaultPath: inputAttrs.value,
      filters: p.filters,
      properties: [],
    };

    if (p.directory && options.properties) {
      options.properties.push('openDirectory');
    } else if (options.properties) {
      options.properties.push('openFile');
    }

    const { filePaths } = await remote.dialog.showOpenDialog(options);

    if (filePaths[0]) {
      inputAttrs.onChange(filePaths[0]);
    }
  }

  console.log(p.value);
  console.log(inputAttrs.value);

  return (
    <InputWrapper {...wrapperAttrs}>
      <Input
        disabled
        value={p.value}
        style={{ marginRight: '16px' }}
        addonAfter={
          <Button onClick={showFileDialog} style={{ margin: '0 -11px' }}>
            {$t('Browse')}
          </Button>
        }
      />
    </InputWrapper>
  );
});
