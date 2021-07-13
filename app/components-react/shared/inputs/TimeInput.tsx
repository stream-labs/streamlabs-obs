import { TimePicker, TimePickerProps } from 'antd';
import React, { useEffect, useRef } from 'react';
import { InputComponent, TSlobsInputProps, useInput } from './inputs';
import InputWrapper from './InputWrapper';
import moment, { Moment } from 'moment';
import { findDOMNode } from 'react-dom';

export type TTimeInputProps = TSlobsInputProps<{}, number, TimePickerProps>;

export const TimeInput = InputComponent((p: TTimeInputProps) => {
  const { wrapperAttrs, inputAttrs } = useInput('time', p);
  const value = getAntdValue(inputAttrs.value);
  const inputRef = useRef<Element>(null);

  // By some unknown reason the Ant TimePicker renders the input in the `readonly` state
  // Add a dirty fix here
  useEffect(() => {
    const $input: Element = findDOMNode(inputRef.current);
    $input.querySelector('input')!.removeAttribute('readonly');
  });

  function onChange(moment: Moment) {
    inputAttrs.onChange(moment?.valueOf() || 0);
  }

  return (
    <InputWrapper {...wrapperAttrs}>
      <TimePicker
        {...inputAttrs}
        ref={inputRef}
        value={value}
        onSelect={onChange}
        onChange={onChange}
        use12Hours
        format="h:mm a"
        showNow={false}
        allowClear={false}
      />
    </InputWrapper>
  );
});

function getAntdValue(value: number) {
  return moment(value);
}

// tell the Form to convert a timestamp value to a Moment value when call `Form.setFieldsValue`
TimeInput['getAntdValue'] = getAntdValue;
