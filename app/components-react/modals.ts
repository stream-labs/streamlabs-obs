import { Services } from './service-provider';
import { Modal, Button } from 'antd';
import Utils from '../services/utils';
import { ModalFuncProps } from 'antd/lib/modal';
import { $t } from '../services/i18n';

/**
 * Show an Confirmation modal and return a Promise<confirmed: boolean>
 * Uses Modal.confirm under the hood
 *
 * @example
 * confirmAsync('Confirm me')
 * .then(confirmed => console.log(confirmed ? 'Confirmed' : 'Canceled'))
 *
 */
export function confirmAsync(
  p: Omit<ModalFuncProps, 'afterClose' | 'onOk' | 'onCancel'> | string,
): Promise<boolean> {
  const { WindowsService } = Services;
  const modalProps = typeof p === 'string' ? { title: p } : p;
  WindowsService.updateStyleBlockers(Utils.getWindowId(), true);
  return new Promise(resolve => {
    Modal.confirm({
      ...modalProps,
      afterClose: () => {
        WindowsService.updateStyleBlockers(Utils.getWindowId(), false);
      },
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
    fixBodyWidth();
  });
}

/**
 * The asynchronous alternative for Windows.alert
 * Uses Modal.info under the hood
 * @example
 * alert('This is Alert').then(() => console.log('Alert closed'))
 *
 */
export function alertAsync(p: Omit<ModalFuncProps, 'afterClose'> | string): Promise<void> {
  const modalProps = typeof p === 'string' ? { title: p } : p;
  const { WindowsService } = Services;
  WindowsService.updateStyleBlockers(Utils.getWindowId(), true);
  return new Promise(resolve => {
    Modal.confirm({
      ...modalProps,
      cancelButtonProps: { style: { display: 'none' } },
      okButtonProps: { type: 'default' },
      okText: $t('Close'),
      afterClose: () => {
        WindowsService.updateStyleBlockers(Utils.getWindowId(), false);
        resolve();
      },
    });
    fixBodyWidth();
  });
}

/**
 * The Antd lib adds additional styles to body most likely to handle scrollbars
 * these styles add additional width that makes the window looks junkie
 * Just remove these styles with this function after each modal show
 */
function fixBodyWidth() {
  setTimeout(() => {
    document.querySelector('body')!.setAttribute('style', '');
  });
}
