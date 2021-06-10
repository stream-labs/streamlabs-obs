import React, { useEffect, useRef } from 'react';
import InputWrapper from '../../shared/inputs/InputWrapper';
import { Services } from '../../service-provider';
import cx from 'classnames';
import { $t } from '../../../services/i18n';
import css from './Twitter.m.less';
import { SwitchInput, TextAreaInput, TextInput } from '../../shared/inputs';
import { Row, Col, Button } from 'antd';
import { useGoLiveSettings } from './useGoLiveSettings';
import { useVuex } from '../../hooks';

export default function TwitterInput() {
  const { TwitterService } = Services;
  const { tweetText, updateSettings, getTweetText, streamTitle } = useGoLiveSettings(view => ({
    streamTitle: view.commonFields.title,
  }));

  const { tweetWhenGoingLive, linked, screenName } = useVuex(() => {
    const state = TwitterService.state;
    return {
      tweetWhenGoingLive: state.tweetWhenGoingLive,
      linked: state.linked,
      screenName: state.screenName,
    };
  });

  useEffect(() => {
    const tweetText = getTweetText(streamTitle);
    updateSettings({ tweetText });
  }, [streamTitle]);

  function unlink() {
    TwitterService.actions.return
      .unlinkTwitter()
      .then(() => TwitterService.actions.getTwitterStatus());
  }

  function renderLinkedView() {
    return (
      <div className={cx('section', css.section)}>
        <p className={css.twitterShareText}>{$t('Share Your Stream')}</p>
        <Row className={css.switcherRow}>
          <Col span={14}>
            <SwitchInput
              label={$t('Enable Tweet Sharing')}
              layout="inline"
              onChange={shouldTweet => TwitterService.actions.setTweetPreference(shouldTweet)}
              value={tweetWhenGoingLive}
              className={css.twitterTweetToggle}
            />
          </Col>
          <Col span={10} style={{ textAlign: 'right' }}>
            <InputWrapper layout="inline">@{screenName}</InputWrapper>
          </Col>
        </Row>

        <TextAreaInput
          name="tweetText"
          value={tweetText}
          onChange={tweetText => updateSettings({ tweetText })}
          nowrap={true}
          showCount={true}
          maxLength={280}
          rows={5}
          disabled={!tweetWhenGoingLive}
        />
        <div style={{ marginTop: '30px', textAlign: 'right' }}>
          <Button onClick={unlink}>{$t('Unlink Twitter')}</Button>
        </div>
      </div>
    );
  }

  function renderUnlinkedView() {
    return (
      <div className={css.section}>
        <p className={css.twitterShareText}>{$t('Share Your Stream')}</p>
        <p>{$t("Tweet to let your followers know you're going live")}</p>
        <button
          className="button button--default"
          onClick={() => TwitterService.actions.openLinkTwitterDialog()}
        >
          {$t('Connect to Twitter')} <i className="fab fa-twitter" />
        </button>
      </div>
    );
  }

  return <InputWrapper>{linked ? renderLinkedView() : renderUnlinkedView()}</InputWrapper>;
}
