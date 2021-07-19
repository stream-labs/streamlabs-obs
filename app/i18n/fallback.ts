/**
 * This file exports the fallback (en-US) locale dictionary to
 * an object that is compiled into our webpack bundle. This
 * allows us to do small bundle updates that add new strings
 * to the dictionary, and have those strings be available
 * immediately. All other locales are shipped with the main
 * app container and are loaded at runtime.
 *
 * Any new locale files should be registered here or they will
 * not function properly.
 */

const fallbackDictionary = {
  ...require('./en-US/advanced-statistics.json'),
  ...require('./en-US/app.json'),
  ...require('./en-US/apps.json'),
  ...require('./en-US/audio.json'),
  ...require('./en-US/common.json'),
  ...require('./en-US/customization.json'),
  ...require('./en-US/facebook.json'),
  ...require('./en-US/filters.json'),
  ...require('./en-US/game-overlay.json'),
  ...require('./en-US/hotkeys.json'),
  ...require('./en-US/media-gallery.json'),
  ...require('./en-US/notifications.json'),
  ...require('./en-US/onboarding.json'),
  ...require('./en-US/overlays.json'),
  ...require('./en-US/performance-metric.json'),
  ...require('./en-US/promotional-copy.json'),
  ...require('./en-US/recent-events.json'),
  ...require('./en-US/remote-control.json'),
  ...require('./en-US/scenes.json'),
  ...require('./en-US/settings.json'),
  ...require('./en-US/socials.json'),
  ...require('./en-US/source-props.json'),
  ...require('./en-US/sources.json'),
  ...require('./en-US/streaming.json'),
  ...require('./en-US/streamlabels.json'),
  ...require('./en-US/transitions.json'),
  ...require('./en-US/troubleshooter.json'),
  ...require('./en-US/twitter.json'),
  ...require('./en-US/twitch.json'),
  ...require('./en-US/undo.json'),
  ...require('./en-US/widget-alertbox.json'),
  ...require('./en-US/widget-chat-box.json'),
  ...require('./en-US/widget-credits.json'),
  ...require('./en-US/widget-donation-ticker.json'),
  ...require('./en-US/widget-event-list.json'),
  ...require('./en-US/widget-goal.json'),
  ...require('./en-US/widget-media-share.json'),
  ...require('./en-US/widget-spin-wheel.json'),
  ...require('./en-US/widget-sponsor-banner.json'),
  ...require('./en-US/widget-stream-boss.json'),
  ...require('./en-US/widget-tip-jar.json'),
  ...require('./en-US/widget-viewer-count.json'),
  ...require('./en-US/widget-poll.json'),
  ...require('./en-US/widgets.json'),
  ...require('./en-US/youtube.json'),
  ...require('./en-US/grow.json'),
  ...require('./en-US/tiktok.json'),
};

export default fallbackDictionary;
