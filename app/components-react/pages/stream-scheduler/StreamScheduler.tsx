import React, { MouseEvent } from 'react';
import moment, { Moment } from 'moment';
import css from './StreamScheduler.m.less';
import cx from 'classnames';
import { Button, Calendar, Modal, Row, Col, Spin } from 'antd';
import { YoutubeEditStreamInfo } from '../../windows/go-live/platforms/YoutubeEditStreamInfo';
import { $t } from '../../../services/i18n';
import FacebookEditStreamInfo from '../../windows/go-live/platforms/FacebookEditStreamInfo';
import { ListInput, TimeInput } from '../../shared/inputs';
import Form, { useForm } from '../../shared/inputs/Form';
import { confirm } from '../../modals';
import { IStreamEvent, useStreamScheduler } from './useStreamScheduler';

/**
 * StreamScheduler page layout
 */
export default function StreamScheduler() {
  const { isEventsLoaded } = useStreamScheduler();
  return (
    <div className={cx(css.streamSchedulerPage)}>
      <Spin tip="Loading..." spinning={!isEventsLoaded}>
        <SchedulerCalendar />
      </Spin>
      <EventSettingsModal />
    </div>
  );
}

/**
 * Calendar component
 */
function SchedulerCalendar() {
  const { showEditEventModal, showNewEventModal, selectedPlatform, events } = useStreamScheduler();

  /**
   * Renders a day cell in the calendar
   */
  function dateCellRender(date: Moment) {
    const start = moment(date).startOf('day');
    const end = moment(date).endOf('day');

    const dayEvents = events
      .filter(ev => {
        return moment(ev.date).isBetween(start, end);
      })
      .sort((ev1, ev2) => ev1.date - ev2.date);

    return (
      <div data-role="day" onClick={() => showNewEventModal(selectedPlatform, date)}>
        {dayEvents.map(renderEvent)}
      </div>
    );
  }

  /**
   * Renders a single event
   */
  function renderEvent(event: IStreamEvent) {
    const time = moment(event.date).format('hh:mma');
    return (
      <p
        key={event.id}
        className={cx({
          [css.event]: true,
          [css.eventFacebook]: event.platform === 'facebook',
          [css.eventYoutube]: event.platform === 'youtube',
        })}
        onClick={ev => {
          ev.stopPropagation();
          showEditEventModal(event.id);
        }}
      >
        <span className={css.eventTime}>{time}</span> &nbsp;
        <span className={css.eventTitle}>{event.title}</span>
      </p>
    );
  }

  /**
   * Antd Calendar doesn't provide a good way for attaching a click event on the calendar's cell
   * So delegate the click event to the root div
   */
  function onCalendarClick(event: MouseEvent) {
    const $td = event.target!['closest']('td');
    if (!$td) return;
    $td.querySelector('[data-role="day"]')!['click']();
  }

  // define the date boundaries
  const minDate = moment().subtract(12, 'month');
  const maxDate = moment().add(1, 'month');

  return (
    <div onClick={onCalendarClick}>
      <Calendar dateCellRender={dateCellRender} validRange={[minDate, maxDate]} />
    </div>
  );
}

/**
 * A modal for creating/editing an event
 */
function EventSettingsModal() {
  const {
    isUpdateMode,
    time,
    isModalVisible,
    submit,
    closeModal,
    setForm,
    isLoading,
    selectedPlatform,
    platforms,
    getPlatformDisplayName,
    showNewEventModal,
    setTime,
    ytSettings,
    fbSettings,
    updatePlatform,
  } = useStreamScheduler();

  // initialize the form
  const form = useForm();

  // make form accessible for the whole module
  setForm(form);

  // we only can change the platform when creating a new event
  const canChangePlatform = !isUpdateMode;

  // create a title with a legible date
  const formattedDate = moment(time).calendar();
  const title = isUpdateMode
    ? $t('Update Scheduled Stream for %{formattedDate}', { formattedDate })
    : $t('Schedule Stream for %{formattedDate}', { formattedDate });

  return (
    <Modal
      title={title}
      visible={isModalVisible}
      onOk={submit}
      onCancel={closeModal}
      afterClose={closeModal}
      destroyOnClose={true}
      footer={<ModalButtons />}
      getContainer={`.${css.streamSchedulerPage}`}
    >
      <Form form={form}>
        <Spin spinning={isLoading}>
          {/* PLATFORM SELECTOR */}
          {canChangePlatform && (
            <ListInput
              label={$t('Platform')}
              value={selectedPlatform}
              options={platforms.map(platform => ({
                value: platform,
                label: getPlatformDisplayName(platform),
              }))}
              onChange={platform => showNewEventModal(platform)}
            />
          )}

          {/* TIME PICKER */}
          <TimeInput name="time" label={$t('Time')} value={time} onChange={setTime} />

          {/* YOUTUBE SETTINGS */}
          {selectedPlatform === 'youtube' && (
            <YoutubeEditStreamInfo
              layoutMode="singlePlatform"
              isUpdateMode={isUpdateMode}
              isScheduleMode={true}
              value={ytSettings}
              onChange={newSettings => updatePlatform('youtube', newSettings)}
            />
          )}

          {/* FACEBOOK SETTINGS */}
          {selectedPlatform === 'facebook' && (
            <FacebookEditStreamInfo
              layoutMode="singlePlatform"
              isUpdateMode={isUpdateMode}
              isScheduleMode={true}
              value={fbSettings}
              onChange={newSettings => updatePlatform('facebook', newSettings)}
            />
          )}
        </Spin>
      </Form>
    </Modal>
  );
}

/**
 * Renders Schedule/Save/Delete buttons
 */
function ModalButtons() {
  const { selectedEvent, remove, submit, isLoading } = useStreamScheduler();
  const shouldShowSave = !!selectedEvent;
  const shouldShowSchedule = !selectedEvent;

  // allow removing only those events which the user has not streamed to
  // removing the event with the finished stream leads to deletion of recorded video too
  const shouldShowRemove = selectedEvent && selectedEvent.status === 'scheduled';

  /**
   * confirm and delete
   */
  async function onDeleteClick() {
    if (await confirm($t('Delete the event?'))) remove();
  }

  return (
    <Row>
      <Col flex={'50%'} style={{ textAlign: 'left' }}>
        {/* DELETE BUTTON */}
        {shouldShowRemove && (
          <Button danger onClick={onDeleteClick}>
            {$t('Delete')}
          </Button>
        )}
      </Col>
      <Col flex={'50%'}>
        {/*/!* GO LIVE BUTTON *!/*/}
        {/*{shouldShowGoLive && <Button type="primary">{$t('Go Live')}</Button>}*/}

        {/* SAVE BUTTON */}
        {shouldShowSave && (
          <Button type="primary" onClick={submit} disabled={isLoading}>
            {$t('Save')}
          </Button>
        )}

        {/* SCHEDULE BUTTON */}
        {shouldShowSchedule && (
          <Button type="primary" onClick={submit} disabled={isLoading}>
            {$t('Schedule')}
          </Button>
        )}
      </Col>
    </Row>
  );
}
