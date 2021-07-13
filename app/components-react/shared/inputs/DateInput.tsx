import React from 'react';
import { DatePicker, DatePickerProps } from 'antd';
import { InputComponent, TSlobsInputProps, useInput, ValuesOf } from './inputs';
import InputWrapper from './InputWrapper';
import { Moment } from 'moment';

const ANT_DATEPICKER_FEATURES = [] as const;

export type TTextAreaInputProps = TSlobsInputProps<
  {},
  Date,
  DatePickerProps,
  ValuesOf<typeof ANT_DATEPICKER_FEATURES>
>;

export const DateInput = InputComponent((p: TTextAreaInputProps) => {
  const { inputAttrs, wrapperAttrs } = useInput('date', p, ANT_DATEPICKER_FEATURES);
  return (
    <InputWrapper {...wrapperAttrs}>
      <DatePicker
        picker="date"
        {...inputAttrs}
        onChange={(newVal, dateString) => inputAttrs.onChange(new Date(dateString))}
      />
    </InputWrapper>
  );
});
