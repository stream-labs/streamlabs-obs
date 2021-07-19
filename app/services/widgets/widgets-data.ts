import { IWidgetTester, IWidget } from './widgets-api';
import { AnchorPoint } from 'util/ScalableRectangle';
import { $t } from 'services/i18n';

export interface IWidgetDisplayData {
  name: string;
  description: string;
  platforms?: Set<string>;
  demoVideo: boolean;
  demoFilename: string;
  supportList: string[];
}
// Do not alter the order of this enum, it is coupled to the user's local config
export enum WidgetType {
  AlertBox = 0,
  DonationGoal = 1,
  FollowerGoal = 2,
  SubscriberGoal = 3,
  BitGoal = 4,
  DonationTicker = 5,
  ChatBox = 6,
  EventList = 7,
  TipJar = 8,
  ViewerCount = 9,
  StreamBoss = 10,
  Credits = 11,
  SpinWheel = 12,
  SponsorBanner = 13,
  MediaShare = 14,
  SubGoal = 15,
  StarsGoal = 16,
  SupporterGoal = 17,
  CharityGoal = 18,
  Poll = 19,
}

export const WidgetTesters: IWidgetTester[] = [
  {
    name: 'Follow',
    url(host, platform) {
      return `https://${host}/api/v5/slobs/test/${platform}_account/follow`;
    },
    platforms: ['twitch', 'facebook'],
  },
  {
    name: 'Subscriber',
    url(host, platform) {
      return `https://${host}/api/v5/slobs/test/${platform}_account/follow`;
    },
    platforms: ['youtube'],
  },
  {
    name: 'Subscription',
    url(host, platform) {
      return `https://${host}/api/v5/slobs/test/${platform}_account/subscription`;
    },
    platforms: ['twitch'],
  },
  {
    name: 'Membership',
    url(host, platform) {
      return `https://${host}/api/v5/slobs/test/${platform}_account/subscription`;
    },
    platforms: ['youtube'],
  },
  {
    name: 'Donation',
    url(host) {
      return `https://${host}/api/v5/slobs/test/streamlabs/donation`;
    },
    platforms: ['twitch', 'youtube', 'facebook', 'tiktok'],
  },
  {
    name: 'Bits',
    url(host, platform) {
      return `https://${host}/api/v5/slobs/test/${platform}_account/bits`;
    },
    platforms: ['twitch'],
  },
  {
    name: 'Host',
    url(host, platform) {
      return `https://${host}/api/v5/slobs/test/${platform}_account/host`;
    },
    platforms: ['twitch'],
  },
  {
    name: 'Super Chat',
    url(host, platform) {
      return `https://${host}/api/v5/slobs/test/${platform}_account/superchat`;
    },
    platforms: ['youtube'],
  },
  {
    name: 'Share',
    url(host, platform) {
      return `https://${host}/api/v5/slobs/test/${platform}_account/share`;
    },
    platforms: ['facebook'],
  },
  {
    name: 'Support',
    url(host, platform) {
      return `https://${host}/api/v5/slobs/test/${platform}_account/support`;
    },
    platforms: ['facebook'],
  },
  {
    name: 'Stars',
    url(host, platform) {
      return `https://${host}/api/v5/slobs/test/${platform}_account/stars`;
    },
    platforms: ['facebook'],
  },
  {
    name: 'Like',
    url(host, platform) {
      return `https://${host}/api/v5/slobs/test/${platform}_account/like`;
    },
    platforms: ['facebook'],
  },
];

export const WidgetDefinitions: { [x: number]: IWidget } = {
  [WidgetType.AlertBox]: {
    name: 'Alert Box',
    url(host, token) {
      return `https://${host}/alert-box/v3/${token}`;
    },

    width: 800,
    height: 600,

    x: 0.5,
    y: 0,

    anchor: AnchorPoint.North,
  },

  [WidgetType.DonationGoal]: {
    name: 'Donation Goal',
    url(host, token) {
      return `https://${host}/widgets/donation-goal?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.FollowerGoal]: {
    name: 'Follower Goal',
    url(host, token) {
      return `https://${host}/widgets/follower-goal?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.SubscriberGoal]: {
    name: 'Subscriber Goal',
    url(host, token) {
      return `https://${host}/widgets/follower-goal?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.SubGoal]: {
    name: 'Sub Goal',
    url(host, token) {
      return `https://${host}/widgets/sub-goal?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.BitGoal]: {
    name: 'Bit Goal',
    url(host, token) {
      return `https://${host}/widgets/bit-goal?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.StarsGoal]: {
    name: 'Stars Goal',
    url(host, token) {
      return `https://${host}/widgets/stars-goal?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.SupporterGoal]: {
    name: 'Supporter Goal',
    url(host, token) {
      return `https://${host}/widgets/supporter-goal?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.CharityGoal]: {
    name: 'Streamlabs Charity Goal',
    url(host, token) {
      return `https://${host}/widgets/streamlabs-charity-donation-goal?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.DonationTicker]: {
    name: 'Donation Ticker',
    url(host, token) {
      return `https://${host}/widgets/donation-ticker?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 1,
    y: 1,

    anchor: AnchorPoint.SouthEast,
  },

  [WidgetType.ChatBox]: {
    name: 'Chat Box',
    url(host, token) {
      return `https://${host}/widgets/chat-box/v1/${token}`;
    },

    width: 600,
    height: 600,

    x: 0,
    y: 0.5,

    anchor: AnchorPoint.West,
  },

  [WidgetType.EventList]: {
    name: 'Event List',
    url(host, token) {
      return `https://${host}/widgets/event-list/v1/${token}`;
    },

    width: 600,
    height: 600,

    x: 1,
    y: 0,

    anchor: AnchorPoint.NorthEast,
  },

  [WidgetType.TipJar]: {
    name: 'The Jar',
    url(host, token) {
      return `https://${host}/widgets/tip-jar/v1/${token}`;
    },

    width: 600,
    height: 600,

    x: 1,
    y: 0.5,

    anchor: AnchorPoint.East,
  },

  [WidgetType.ViewerCount]: {
    name: 'Viewer Count',
    url(host, token) {
      return `https://${host}/widgets/viewer-count?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.StreamBoss]: {
    name: 'Stream Boss',
    url(host, token) {
      return `https://${host}/widgets/streamboss?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.Credits]: {
    name: 'Credits',
    url(host, token) {
      return `https://${host}/widgets/end-credits?token=${token}`;
    },

    width: 1280,
    height: 720,

    x: 0.5,
    y: 0.5,

    anchor: AnchorPoint.Center,
  },

  [WidgetType.SponsorBanner]: {
    name: 'Sponsor Banner',
    url(host, token) {
      return `https://${host}/widgets/sponsor-banner?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.SpinWheel]: {
    name: 'Spin Wheel',
    url(host, token) {
      return `https://${host}/widgets/wheel?token=${token}`;
    },

    width: 600,
    height: 800,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.MediaShare]: {
    name: 'Media Share',
    url(host, token) {
      return `https://${host}/widgets/media/v1/${token}`;
    },

    width: 800,
    height: 600,

    x: 0.5,
    y: 0,

    anchor: AnchorPoint.North,
  },
  [WidgetType.Poll]: {
    name: 'Poll',
    url(host, token) {
      return `https://${host}/widgets/poll/${token}`;
    },

    width: 800,
    height: 400,

    x: 0.5,
    y: 0.5,

    anchor: AnchorPoint.Center,
  },
};

export const WidgetDisplayData = (platform?: string): { [x: number]: IWidgetDisplayData } => ({
  [WidgetType.AlertBox]: {
    name: $t('Alertbox'),
    description: $t('Thanks viewers with notification popups.'),
    demoVideo: true,
    demoFilename: 'source-alertbox.mp4',
    supportList: [$t('Donations'), $t('Subscriptions'), $t('Follows'), $t('Bits'), $t('Hosts')],
  },
  [WidgetType.DonationGoal]: {
    name: $t('Donation Goal'),
    description: $t('Set a goal for your viewers to help you reach.'),
    demoVideo: true,
    demoFilename: 'source-donation-goal.mp4',
    supportList: [$t('Donations')],
  },
  [WidgetType.FollowerGoal]: {
    name: $t('Follower Goal'),
    description: $t('Set a goal for your viewers to help you reach.'),
    demoVideo: false,
    demoFilename: 'source-follower-goal.png',
    platforms: new Set(['twitch', 'facebook']),
    supportList: [$t('Twitch Follows'), $t('Facebook Follows')],
  },
  [WidgetType.SubscriberGoal]: {
    name: $t('Subscription Goal'),
    description: $t('Set a goal for your viewers to help you reach.'),
    demoVideo: false,
    demoFilename: 'source-follower-goal.png',
    supportList: [$t('YouTube Subscribers')],
    platforms: new Set(['youtube']),
  },
  [WidgetType.SubGoal]: {
    name: platform === 'youtube' ? $t('Member Goal') : $t('Subscription Goal'),
    description: $t('Set a goal for your viewers to help you reach.'),
    demoVideo: false,
    demoFilename: 'source-follower-goal.png',
    supportList: [$t('Twitch Subscribers'), $t('YouTube Members')],
    platforms: new Set(['twitch', 'youtube']),
  },
  [WidgetType.BitGoal]: {
    name: $t('Bit Goal'),
    description: $t('Set a goal for your viewers to help you reach.'),
    demoVideo: false,
    demoFilename: 'source-bit-goal.png',
    supportList: [$t('Twitch Bits')],
    platforms: new Set(['twitch']),
  },
  [WidgetType.StarsGoal]: {
    name: $t('Stars Goal'),
    description: $t('Set a goal for your viewers to help you reach.'),
    demoVideo: false,
    demoFilename: 'source-bit-goal.png',
    supportList: [$t('Facebook Stars')],
    platforms: new Set(['facebook']),
  },
  [WidgetType.SupporterGoal]: {
    name: $t('Supporter Goal'),
    description: $t('Set a goal for your viewers to help you reach.'),
    demoVideo: false,
    demoFilename: 'source-follower-goal.png',
    supportList: [$t('Facebook Supporters')],
    platforms: new Set(['facebook']),
  },
  [WidgetType.CharityGoal]: {
    name: $t('Streamlabs Charity Goal'),
    description: $t('Set a goal for your viewers to help you reach.'),
    demoVideo: true,
    demoFilename: 'source-donation-goal.mp4',
    supportList: [$t('Streamlabs Charity Donations')],
    platforms: new Set(['twitch', 'youtube', 'facebook']),
  },
  [WidgetType.DonationTicker]: {
    name: $t('Tip Ticker'),
    description: $t('Show off your most recent donations to your viewers.'),
    demoVideo: true,
    demoFilename: 'source-donation-ticker.mp4',
    supportList: [$t('Donations')],
  },
  [WidgetType.ChatBox]: {
    name: $t('Chatbox'),
    description: $t("Include your channel's chat into your stream."),
    demoVideo: true,
    demoFilename: 'source-chatbox.mp4',
    supportList: [$t('Twitch chat'), $t('YouTube chat'), $t('Facebook chat')],
  },
  [WidgetType.EventList]: {
    name: $t('Event List'),
    description: $t("Include your channel's most recent events into your stream."),
    demoVideo: true,
    demoFilename: 'source-eventlist.mp4',
    supportList: [
      $t('Donations'),
      $t('Subscriptions'),
      $t('Follows'),
      $t('Bits'),
      $t('Hosts'),
      $t('Redemptions'),
    ],
  },
  [WidgetType.TipJar]: {
    name: $t('The Jar'),
    description: $t('The jar that catches bits, tips, and more.'),
    demoVideo: true,
    demoFilename: 'source-jar.mp4',
    supportList: [$t('Donations'), $t('Subscriptions'), $t('Follows'), $t('Bits'), $t('Hosts')],
  },
  [WidgetType.ViewerCount]: {
    name: $t('Viewer Count'),
    description: $t('Show off your viewers from multiple platforms.'),
    demoVideo: false,
    demoFilename: 'source-viewer-count.png',
    supportList: ['YouTube', 'Twitch', 'Facebook'],
  },
  [WidgetType.StreamBoss]: {
    name: $t('Stream Boss'),
    description: $t('Battle with bits to be the boss of the stream!'),
    demoVideo: false,
    demoFilename: 'streamboss-source.png',
    supportList: [$t('Twitch Bits')],
  },
  [WidgetType.Credits]: {
    name: $t('Credits'),
    description: $t('Rolling credits to play at the end of your stream.'),
    demoVideo: true,
    demoFilename: 'source-credits.mp4',
    supportList: [$t('New Followers'), $t('New Subscribers'), $t('Cheers'), $t('Donations')],
    platforms: new Set(['twitch', 'youtube']),
  },
  [WidgetType.SponsorBanner]: {
    name: $t('Sponsor Banner'),
    description: $t(
      'Set up a sponsor banner to be able to edit (add, remove, update) rotating sponsor logos on streamer channel.',
    ),
    demoVideo: false,
    demoFilename: 'source-sponsor-banner.png',
    supportList: [$t('The streamer manually adds images of sponsors.')],
  },
  [WidgetType.SpinWheel]: {
    name: $t('Spin Wheel'),
    description: $t('Spin the wheel to make a decision.'),
    demoVideo: true,
    demoFilename: 'source-wheel.mp4',
    supportList: [$t('The streamer manually triggers a spin anytime while they are live.')],
  },
  [WidgetType.MediaShare]: {
    name: $t('Media Share'),
    description: $t(
      'Please note that when advanced media share is enabled,' +
        ' media will no longer play through your alert box widget.' +
        ' Media will only play through this media share widget.',
    ),
    demoVideo: false,
    demoFilename: 'source-sponsor-banner.png',
    supportList: [],
  },
  [WidgetType.Poll]: {
    name: $t('Poll'),
    description: $t('Let your viewers vote on a result'),
    demoVideo: false,
    demoFilename: 'poll.png',
    supportList: [],
  },
});
