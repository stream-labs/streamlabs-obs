import { TPlatform } from '../../../services/platforms';
import { $t } from '../../../services/i18n';
import React from 'react';
import { CheckboxInput, InputComponent, TextAreaInput, TextInput } from '../../shared/inputs';
import { assertIsDefined } from '../../../util/properties-type-guards';
import InputWrapper from '../../shared/inputs/InputWrapper';
import Animate from 'rc-animate';
import { TLayoutMode } from './platforms/PlatformSettingsLayout';
import { Services } from '../../service-provider';

interface ICommonPlatformSettings {
  title: string;
  description?: string;
  useCustomFields?: boolean;
}

interface IProps {
  /**
   * if provided then change props only for the provided platform
   */
  platform?: TPlatform;
  layoutMode?: TLayoutMode;
  value: ICommonPlatformSettings;
  descriptionIsRequired?: boolean;
  onChange: (newValue: ICommonPlatformSettings) => unknown;
}

type TCustomFieldName = 'title' | 'description';

/**
 * Component for modifying common platform fields such as "Title" and "Description"
 * if "props.platform" is provided it changes props for a single platform
 * otherwise it changes props for all enabled platforms
 */
export const CommonPlatformFields = InputComponent((rawProps: IProps) => {
  const defaultProps = { layoutMode: 'singlePlatform' as TLayoutMode };
  const p: IProps = { ...defaultProps, ...rawProps };

  function updatePlatform(patch: Partial<ICommonPlatformSettings>) {
    const platformSettings = p.value;
    p.onChange({ ...platformSettings, ...patch });
  }

  /**
   * Toggle the "Use different title and description " checkbox
   **/
  function toggleUseCustom() {
    assertIsDefined(p.platform);
    const isEnabled = p.value.useCustomFields;
    updatePlatform({ useCustomFields: !isEnabled });
  }

  function updateCommonField(fieldName: TCustomFieldName, value: string) {
    updatePlatform({ [fieldName]: value });
  }

  const view = Services.StreamingService.views;
  const hasCustomCheckbox = p.layoutMode === 'multiplatformAdvanced';
  const fieldsAreVisible = !hasCustomCheckbox || p.value.useCustomFields;
  const descriptionIsRequired =
    typeof p.descriptionIsRequired === 'boolean'
      ? p.descriptionIsRequired
      : p.platform === 'facebook';

  const hasDescription = p.platform
    ? view.supports('description', [p.platform as TPlatform])
    : view.supports('description');

  const fields = p.value;

  // find out the best title for common fields
  const title = hasDescription
    ? $t('Use different title and description')
    : $t('Use different title');

  return (
    <div>
      {/* USE CUSTOM CHECKBOX */}
      {hasCustomCheckbox && (
        <InputWrapper>
          <CheckboxInput
            name="customEnabled"
            value={p.value.useCustomFields}
            onChange={toggleUseCustom}
            label={title}
          />
        </InputWrapper>
      )}

      <Animate transitionName="slidedown">
        {fieldsAreVisible && (
          <div>
            {/*TITLE*/}
            <TextInput
              value={fields['title']}
              name="title"
              onChange={val => updateCommonField('title', val)}
              label={$t('Title')}
              required={true}
              max={p.platform === 'twitch' ? 140 : 120}
            />

            {/*DESCRIPTION*/}
            {hasDescription && (
              <TextAreaInput
                value={fields['description']}
                onChange={val => updateCommonField('description', val)}
                name="description"
                label={$t('Description')}
                required={descriptionIsRequired}
              />
            )}
          </div>
        )}
      </Animate>
    </div>
  );
});
