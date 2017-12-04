import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from '../util/injector';
import { CustomizationService } from '../services/customization';
import { NavigationService } from '../services/navigation';
import { UserService } from '../services/user';
import electron from 'electron';
import Login from './Login.vue';
import { SettingsService } from '../services/settings';
import Utils from '../services/utils';


@Component({
  components: { Login }
})
export default class TopNav extends Vue {

  @Inject() settingsService: SettingsService;
  @Inject() customizationService: CustomizationService;
  @Inject() navigationService: NavigationService;
  @Inject() userService: UserService;

  slideOpen = false;

  navigateStudio() {
    this.navigationService.navigate('Studio');
  }

  navigateDashboard() {
    this.navigationService.navigate('Dashboard');
  }

  navigateOverlays() {
    this.navigationService.navigate('BrowseOverlays');
  }

  navigateLive() {
    this.navigationService.navigate('Live');
  }

  navigateOnboarding() {
    this.navigationService.navigate('Onboarding');
  }

  openSettingsWindow() {
    this.settingsService.showSettings();
  }

  toggleNightTheme() {
    this.customizationService.nightMode = !this.customizationService.nightMode;
  }

  bugReport() {
    electron.remote.shell.openExternal('https://tracker.streamlabs.com');
  }

  get isDevMode() {
    return Utils.isDevMode();
  }

  openDevTools() {
    electron.ipcRenderer.send('openDevTools');
  }

  get page() {
    return this.navigationService.state.currentPage;
  }

  get isUserLoggedIn() {
    return this.userService.isLoggedIn();
  }

}
