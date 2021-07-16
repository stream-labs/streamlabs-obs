import React, { useState, useEffect, useRef } from 'react';
import { Tooltip } from 'antd';
import moment from 'moment';
import cx from 'classnames';
import { useVuex, useRenderInterval } from '../hooks';
import cloneDeep from 'lodash/cloneDeep';
import { Services } from '../service-provider';
import { ENotificationType, INotification, ENotificationSubType } from 'services/notifications';
import { $t } from 'services/i18n';
import styles from './NotificationsArea.m.less';
const notificationAudio = require('../../../media/sound/ding.wav');

interface IUiNotification extends INotification {
  outdated?: boolean;
}

export default function NotificationsArea() {
  const { NotificationsService } = Services;

  const [showExtendedNotifications, setShowExtendedNotifications] = useState(true);
  const [canShowNextNotif, setCanShowNextNotif] = useState(true);
  const [notificationQueue, setNotificationQueue] = useState(() => {
    if (NotificationsService.state.notifications) {
      return cloneDeep(NotificationsService.state.notifications);
    }
    return [];
  });
  const [notifications, setNotifications] = useState([] as IUiNotification[]);

  const { unreadCount, settings } = useVuex(() => ({
    unreadCount: NotificationsService.views.getUnread(ENotificationType.WARNING).length,
    settings: NotificationsService.state.settings,
  }));

  const notificationsContainer = useRef<HTMLDivElement>(null);

  const notifyAudio = useRef(new Audio(notificationAudio));

  const showNotificationsTooltip = $t('Click to open your Notifications window');
  const showUnreadNotificationsTooltip = $t('Click to read your unread Notifications');

  useRenderInterval(checkQueue, 5000);
  useRenderInterval(() => {
    if (!notificationsContainer.current) return;
    setShowExtendedNotifications(notificationsContainer.current?.offsetWidth >= 150);
  }, 1000);

  useEffect(() => {
    if (notificationQueue) {
      checkQueue();
    }

    const notifPushedSub = NotificationsService.notificationPushed.subscribe(notif => {
      onNotificationHandler(notif);
    });
    const notifReadSub = NotificationsService.notificationRead.subscribe(notif => {
      onNotificationsReadHandler(notif);
    });

    return () => {
      notifPushedSub.unsubscribe();
      notifReadSub.unsubscribe();
    };
  }, []);

  function fromNow(time: number): string {
    return moment(time).fromNow();
  }

  function checkQueue() {
    hideOutdated();

    if (notificationQueue.length > 0) {
      const notif = notificationQueue[0];
      setNotificationQueue(notificationQueue.slice(1));
      showNotification(notif);
      setCanShowNextNotif(false);
    } else {
      setCanShowNextNotif(true);
    }
  }

  function onNotificationsReadHandler(ids: number[]) {
    // remove read notifications from queue
    setNotificationQueue(
      notificationQueue.filter(notify => {
        return ids.includes(notify.id);
      }),
    );
    setNotifications(
      notifications.map(notif => ({
        ...notif,
        outdated: ids.includes(notif.id) ? true : notif.outdated,
      })),
    );
  }

  function showNotification(notif: INotification) {
    if (!settings.enabled || !notif.playSound) return;
    notifyAudio.current.play();

    setNotifications(notifications.filter(note => !note.outdated));

    // setup order of appearing elements to have a correct animation
    requestAnimationFrame(() => {
      setNotifications(
        notifications.map((n, i) => ({ ...n, outdated: i === 0 ? true : n.outdated })),
      );

      requestAnimationFrame(() => {
        setNotifications([...notifications, { ...notif, outdated: false }]);
        if (notif.lifeTime !== -1) window.setTimeout(() => hideOutdated(), notif.lifeTime);
      });
    });
  }

  function onNotificationHandler(notif: INotification) {
    if (
      [
        ENotificationSubType.DROPPED,
        ENotificationSubType.LAGGED,
        ENotificationSubType.SKIPPED,
      ].includes(notif.subType)
    ) {
      return;
    }
    setNotificationQueue([...notificationQueue, notif]);
    if (canShowNextNotif) checkQueue();
  }

  function showNotifications() {
    NotificationsService.showNotifications();
  }

  function onNotificationClickHandler(id: number) {
    const notif = notifications.find(notif => notif.id === id);
    if (!notif || notif.outdated) return;
    NotificationsService.applyAction(id);
    NotificationsService.markAsRead(id);
    notif.outdated = true;
  }

  function hideOutdated() {
    notifications.forEach(uiNotif => {
      const notif = NotificationsService.views.getNotification(uiNotif.id);
      if (!notif) return;
      const now = Date.now();
      if (!notif.unread || (notif.lifeTime !== -1 && now - notif.date > notif.lifeTime)) {
        uiNotif.outdated = true;
      }
    });
  }

  if (!settings.enabled) return;

  return (
    <div className={styles.notificationsArea}>
      {unreadCount && (
        <Tooltip placement="right" title={showUnreadNotificationsTooltip}>
          <div
            className={cx(styles.notificationsCounter, styles.notificationsCounterWarning)}
            onClick={showNotifications}
          >
            <i className="fa fa-exclamation-triangle" />
            {unreadCount}
          </div>
        </Tooltip>
      )}
      {!unreadCount && (
        <Tooltip placement="right" title={showNotificationsTooltip}>
          <div className={styles.notificationsCounter} onClick={showNotifications}>
            <i className="icon-information" />
          </div>
        </Tooltip>
      )}
      <div className={cx(styles.notificationsContainer, 'flex--grow')} ref={notificationsContainer}>
        {notifications.map(
          notif =>
            showExtendedNotifications && (
              <div
                key={`${notif.message}${notif.date}`}
                className={cx(styles.notification, {
                  [styles.info]: notif.type === 'INFO',
                  [styles.warning]: notif.type === 'WARNING',
                  [styles.success]: notif.type === 'SUCCESS',
                  [styles.hasAction]: notif.action && !notif.outdated,
                  [styles.outdated]: notif.outdated,
                })}
                onClick={() => onNotificationClickHandler(notif.id)}
              >
                {notif.message} {notif.showTime && <span> {fromNow(notif.date)}</span>}
              </div>
            ),
        )}
      </div>
    </div>
  );
}
