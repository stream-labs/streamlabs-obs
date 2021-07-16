import Vue from 'vue';
import { Component, Prop, Watch } from 'vue-property-decorator';
import { Chat } from 'components/shared/ReactComponent';
import { StreamingService, EStreamingState } from '../services/streaming';
import { Inject } from 'services/core/injector';
import { UserService } from '../services/user';
import { CustomizationService } from 'services/customization';
import electron from 'electron';
import { $t } from 'services/i18n';
import PlatformAppPageView from 'components/PlatformAppPageView.vue';
import { PlatformAppsService, EAppPageSlot, ILoadedApp } from 'services/platform-apps';
import ListInput from 'components/shared/inputs/ListInput.vue';
import { AppService } from 'services/app';
import Tabs, { ITab } from 'components/Tabs.vue';
import { ChatService } from 'services/chat';
import { WindowsService } from 'services/windows';
import { FacebookService, RestreamService, YoutubeService } from 'app-services';
import { getPlatformService } from 'services/platforms';

@Component({
  components: {
    Chat,
    ListInput,
    PlatformAppPageView,
    Tabs,
  },
})
export default class LiveDock extends Vue {
  @Inject() streamingService: StreamingService;
  @Inject() youtubeService: YoutubeService;
  @Inject() facebookService: FacebookService;
  @Inject() userService: UserService;
  @Inject() customizationService: CustomizationService;
  @Inject() platformAppsService: PlatformAppsService;
  @Inject() appService: AppService;
  @Inject() chatService: ChatService;
  @Inject() windowsService: WindowsService;
  @Inject() restreamService: RestreamService;

  @Prop({ default: false })
  onLeft: boolean;

  elapsedStreamTime = '';
  elapsedInterval: number;
  canAnimate = false;

  slot = EAppPageSlot.Chat;

  // Safe getter/setter prevents getting stuck on the chat
  // for an app that was unloaded.
  underlyingSelectedChat = 'default';

  get selectedChat() {
    if (this.underlyingSelectedChat === 'default') return 'default';
    if (this.underlyingSelectedChat === 'restream') {
      if (this.restreamService.shouldGoLiveWithRestream) return 'restream';
      return 'default';
    }

    return this.chatApps.find(app => app.id === this.underlyingSelectedChat)
      ? this.underlyingSelectedChat
      : 'default';
  }

  set selectedChat(val: string) {
    this.underlyingSelectedChat = val;
  }

  viewStreamTooltip = $t('View your live stream in a web browser');
  editStreamInfoTooltip = $t('Edit your stream title and description');
  controlRoomTooltip = $t('Go to YouTube Live Dashboard');
  liveProducerTooltip = $t('Go to the Facebook Live Producer Dashboard');

  mounted() {
    this.elapsedInterval = window.setInterval(() => {
      if (this.streamingStatus === EStreamingState.Live) {
        this.elapsedStreamTime = this.getElapsedStreamTime();
      } else {
        this.elapsedStreamTime = '';
      }
    }, 100);
  }

  get applicationLoading() {
    return this.appService.state.loading;
  }

  beforeDestroy() {
    clearInterval(this.elapsedInterval);
  }

  get streamingStatus() {
    return this.streamingService.state.streamingStatus;
  }

  @Watch('streamingStatus')
  onStreamingStatusChange() {
    if (this.streamingStatus === EStreamingState.Starting) {
      this.setCollapsed(false);
    }
  }

  getElapsedStreamTime() {
    return this.streamingService.formattedDurationInCurrentStreamingState;
  }

  get collapsed() {
    return this.customizationService.state.livedockCollapsed;
  }

  setCollapsed(livedockCollapsed: boolean) {
    this.canAnimate = true;
    this.windowsService.actions.updateStyleBlockers('main', true);
    this.customizationService.actions.setSettings({ livedockCollapsed });
    setTimeout(() => {
      this.canAnimate = false;
      this.windowsService.actions.updateStyleBlockers('main', false);
    }, 300);
  }

  get isStreaming() {
    return this.streamingService.isStreaming;
  }

  get liveText() {
    if (this.streamingStatus === EStreamingState.Live) return 'Live';
    if (this.streamingStatus === EStreamingState.Starting) return 'Starting';
    if (this.streamingStatus === EStreamingState.Ending) return 'Ending';
    if (this.streamingStatus === EStreamingState.Reconnecting) return 'Reconnecting';
    return 'Offline';
  }

  get viewerCount() {
    if (this.hideViewerCount) {
      return 'viewers hidden';
    }

    return this.streamingService.views.viewerCount.toString();
  }

  get offlineImageSrc() {
    const mode = this.customizationService.isDarkTheme ? 'night' : 'day';
    return require(`../../media/images/sleeping-kevin-${mode}.png`);
  }

  showEditStreamInfo() {
    this.streamingService.actions.showEditStream();
  }

  openYoutubeStreamUrl() {
    electron.remote.shell.openExternal(this.youtubeService.streamPageUrl);
  }

  openYoutubeControlRoom() {
    electron.remote.shell.openExternal(this.youtubeService.dashboardUrl);
  }

  openFBStreamUrl() {
    electron.remote.shell.openExternal(this.facebookService.streamPageUrl);
  }

  openFBStreamDashboardUrl() {
    electron.remote.shell.openExternal(this.facebookService.streamDashboardUrl);
  }

  get isTwitch() {
    return this.userService.platform.type === 'twitch';
  }

  get isYoutube() {
    return this.userService.platform.type === 'youtube';
  }

  get isFacebook() {
    return this.userService.platform.type === 'facebook';
  }

  get hideViewerCount() {
    return this.customizationService.state.hideViewerCount;
  }

  get liveDockSize() {
    return this.customizationService.state.livedockSize;
  }

  toggleViewerCount() {
    this.customizationService.setHiddenViewerCount(
      !this.customizationService.state.hideViewerCount,
    );
  }

  refreshChat() {
    if (this.selectedChat === 'default') {
      this.chatService.refreshChat();
      return;
    }

    if (this.selectedChat === 'restream') {
      this.restreamService.refreshChat();
      return;
    }

    this.platformAppsService.refreshApp(this.selectedChat);
  }

  get hideStyleBlockers() {
    return this.windowsService.state.main.hideStyleBlockers;
  }

  get hasChatTabs() {
    return this.chatTabs.length > 1;
  }

  get showDefaultPlatformChat() {
    return this.selectedChat === 'default';
  }

  get restreamChatUrl() {
    return this.restreamService.chatUrl;
  }

  get chatApps(): ILoadedApp[] {
    return this.platformAppsService.enabledApps.filter(app => {
      return !!app.manifest.pages.find(page => {
        return page.slot === EAppPageSlot.Chat;
      });
    });
  }

  get chatTabs(): ITab[] {
    const tabs: ITab[] = [
      {
        name: getPlatformService(this.userService.state.auth.primaryPlatform).displayName,
        value: 'default',
      },
    ].concat(
      this.chatApps
        .filter(app => !app.poppedOutSlots.includes(this.slot))
        .map(app => {
          return {
            name: app.manifest.name,
            value: app.id,
          };
        }),
    );

    if (this.restreamService.shouldGoLiveWithRestream) {
      tabs.push({
        name: $t('Multistream'),
        value: 'restream',
      });
    }

    return tabs;
  }

  get isPopOutAllowed() {
    if (this.showDefaultPlatformChat) return false;
    if (this.selectedChat === 'restream') return false;

    const chatPage = this.platformAppsService.views
      .getApp(this.selectedChat)
      .manifest.pages.find(page => page.slot === EAppPageSlot.Chat);
    if (!chatPage) return false;

    // Default result is true
    return chatPage.allowPopout == null ? true : chatPage.allowPopout;
  }

  popOut() {
    this.platformAppsService.popOutAppPage(this.selectedChat, this.slot);
    this.selectedChat = 'default';
  }

  get canEditChannelInfo(): boolean {
    return (
      this.streamingService.views.isMidStreamMode ||
      this.userService.state.auth?.primaryPlatform === 'twitch'
    );
  }
}
