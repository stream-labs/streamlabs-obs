import styles from './GoLiveError.m.less';
import cx from 'classnames';
import React, { useState, HTMLAttributes } from 'react';
import { IStreamError } from '../../../services/streaming/stream-error';
import { $t } from '../../../services/i18n';
import { Alert } from 'antd';

interface IMessageLayoutProps {
  error?: IStreamError;
  /**
   * overrides the error message if provided
   */
  message?: string;
  type?: 'error' | 'success';
}

/**
 * Layout for displaying an single success message or error
 */
export default function MessageLayout(p: IMessageLayoutProps & HTMLAttributes<unknown>) {
  const [isErrorDetailsShown, setDetailsShown] = useState(false);
  const error = p.error;
  const message = p.message || error?.message;
  const details = error?.details;
  const type = error ? 'error' : p.type;

  function render() {
    return (
      <div>
        <Alert type={type} message={message} showIcon description={renderDescription()} />
      </div>
    );
  }

  function renderDescription() {
    return (
      <div style={{ marginTop: '16px' }}>
        <p>{p.children}</p>
        {details && !isErrorDetailsShown && (
          <p style={{ textAlign: 'right' }}>
            <a className={styles.link} onClick={() => setDetailsShown(true)}>
              {$t('Show details')}
            </a>
          </p>
        )}
        {details && isErrorDetailsShown && <p className={styles.details}>{details}</p>}
      </div>
    );
  }

  return render();
}