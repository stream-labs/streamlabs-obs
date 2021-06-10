import { Input } from 'antd';
import React from 'react';
import { InputComponent, TSlobsInputProps, useTextInput, ValuesOf } from './inputs';
import InputWrapper from './InputWrapper';
import { InputProps } from 'antd/lib/input';

// select which features from the antd lib we are going to use
const ANT_INPUT_FEATURES = ['addonBefore', 'addonAfter'] as const;

export type TTextInputProps = TSlobsInputProps<
  { uncontrolled?: boolean },
  string,
  InputProps,
  ValuesOf<typeof ANT_INPUT_FEATURES>
>;

export const TextInput = InputComponent((p: TTextInputProps) => {
  const { inputAttrs, wrapperAttrs } = useTextInput(p, ANT_INPUT_FEATURES);
  return (
    <InputWrapper {...wrapperAttrs}>
      <Input {...inputAttrs} />
    </InputWrapper>
  );
});
