import React, { useContext, useEffect, useState } from 'react';
import { Form as AntForm } from 'antd';
import { FormInstance, FormProps, FormItemProps } from 'antd/lib/form';
import { TInputLayout } from './inputs';

type TFormContext = {
  antForm: FormInstance;
  layout?: TInputLayout;
} & Pick<FormItemProps, 'labelCol' | 'wrapperCol'>;

/**
 * stores the antForm instance and layout parameters for form inputs
 */
export const FormContext = React.createContext<TFormContext | null>(null);

/**
 * Form handle validations and sets the layout for the input components
 */
export default React.memo(function Form(p: FormProps & { disabled?: boolean }) {
  const context = useContext(FormContext);
  const [antForm] = AntForm.useForm(context?.antForm || p.form);
  const [contextValue, setContextValue] = useState(() => {
    // set default layout to horizontal
    const layout = p.layout || 'horizontal';
    return {
      layout,
      antForm,
    };
  });

  useEffect(() => {
    const layout = p.layout || 'horizontal';
    setContextValue(prevContext => ({ ...prevContext, layout }));
  }, [p.layout]);

  // data attributes helps to find this form in DOM in tests
  const dataAttrs = {
    'data-role': 'form',
    'data-name': p.name,
  };

  /* eslint-disable no-template-curly-in-string */
  const validateMessages = {
    required: '${label} is required',
    types: { number: '${label} is not a valid number' },
    string: {
      max: '${label} cannot be more than ${max} characters',
    },
    number: {
      range: '${label} must be between ${min} and ${max}',
    },
  };
  /* eslint-enable no-template-curly-in-string */

  return (
    <FormContext.Provider value={contextValue}>
      {context ? (
        // if the context exists then AntForm is already created as an ancestor
        // create a simple div
        <div {...dataAttrs}>{p.children}</div>
      ) : (
        // there is no AntForm in ancestor, this is a root form
        // create the AntForm container for children
        <AntForm {...dataAttrs} validateMessages={validateMessages} {...p} form={antForm}>
          {p.children}
        </AntForm>
      )}
    </FormContext.Provider>
  );
});

export function useForm() {
  return AntForm.useForm()[0];
}
