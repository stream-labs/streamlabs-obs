import { Switch } from 'antd';
import React from 'react';
import { InputComponent, TSlobsInputProps, useInput, ValuesOf } from './inputs';
import InputWrapper from './InputWrapper';
import { SwitchProps } from 'antd/lib/switch';

// select which features from the antd lib we are going to use
const ANT_SWITCH_FEATURES = ['checkedChildren', 'unCheckedChildren'] as const;

export type TSwitchInputProps = TSlobsInputProps<
  { inputRef?: React.Ref<HTMLInputElement> },
  boolean,
  SwitchProps,
  ValuesOf<typeof ANT_SWITCH_FEATURES>
>;

export const SwitchInput = InputComponent((p: TSwitchInputProps) => {
  const { wrapperAttrs, inputAttrs } = useInput('switch', p, ANT_SWITCH_FEATURES);
  return (
    <InputWrapper {...wrapperAttrs}>
      <Switch checked={inputAttrs.value} size="small" {...inputAttrs} ref={p.inputRef} />
    </InputWrapper>
  );
});
