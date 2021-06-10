import { Select, Tag } from 'antd';
import React, { useMemo, ReactElement, useState } from 'react';
import { InputComponent, SingleType, TSlobsInputProps, useInput, ValuesOf } from './inputs';
import InputWrapper from './InputWrapper';
import { SelectProps } from 'antd/lib/select';
import { ICustomListProps, IListOption, renderOption } from './ListInput';
import { TagProps } from 'antd/lib/tag';
import keyBy from 'lodash/keyBy';
import { $t } from '../../../services/i18n';
import Message from '../Message';
import { useFormState } from '../../hooks';
import Utils from '../../../services/utils';
import cx from 'classnames';

// select which features from the antd lib we are going to use
const ANT_SELECT_FEATURES = ['showSearch', 'loading', 'mode', 'tokenSeparators'] as const;

interface ICustomTagsProps<TValue> extends ICustomListProps<SingleType<TValue>> {
  max?: number;
  tagRender?: (
    tagProps: TagProps,
    tag: IListOption<SingleType<TValue>>,
  ) => ReactElement<typeof Tag>;
}

export type TTagsInputProps<TValue> = TSlobsInputProps<
  ICustomTagsProps<TValue>,
  TValue,
  SelectProps<TValue>,
  ValuesOf<typeof ANT_SELECT_FEATURES>
>;

export const TagsInput = InputComponent(<T extends any[]>(props: TTagsInputProps<T>) => {
  const defaultProps = { mode: 'multiple' };
  const p = { ...defaultProps, ...props };
  const { inputAttrs, wrapperAttrs } = useInput('tags', p, ANT_SELECT_FEATURES);
  const options = p.options;
  const tagsMap = useMemo(() => keyBy(options, 'value'), [options]);
  const { s, updateState } = useFormState({ isAnimating: false });

  async function animateWarning() {
    if (s.isAnimating) return;
    updateState({ isAnimating: true });
    await Utils.sleep(1000);
    updateState({ isAnimating: false });
  }

  function renderTag(tagProps: TagProps) {
    const tag = tagsMap[tagProps['value']] || {
      value: tagProps['value'],
      label: tagProps['value'],
    };
    if (p.tagRender) {
      return p.tagRender(tagProps, tag);
    }
    return <Tag {...tagProps}>{tag.label}</Tag>;
  }

  function dropdownRender(menu: JSX.Element) {
    const maxTagsReached = p.max && inputAttrs.value?.length >= p.max;
    return (
      <div>
        {maxTagsReached && (
          <Message
            type="warning"
            className={cx({ animate__shakeX: s.isAnimating })}
            style={{ textAlign: 'center', fontSize: '16px', padding: '7px' }}
          >
            {$t('You can only select up to %{max} items', { max: p.max })}
          </Message>
        )}
        {menu}
      </div>
    );
  }

  function onChangeHandler(values: T) {
    const max = p.max;
    const count = values.length;
    if (max && count > max) {
      values.pop();
      animateWarning();
    }
    inputAttrs.onChange(values);
  }

  return (
    <InputWrapper {...wrapperAttrs}>
      <Select
        {...inputAttrs}
        // search by label instead value
        optionFilterProp={'label'}
        allowClear
        onChange={val => onChangeHandler((val as unknown) as T)}
        tagRender={renderTag}
        placeholder={$t('Start typing to search')}
        dropdownRender={dropdownRender}
      >
        {options && options.map((opt, ind) => renderOption(opt, ind, p))}
      </Select>
    </InputWrapper>
  );
});
