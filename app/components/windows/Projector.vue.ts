import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import ModalLayout from 'components/ModalLayout.vue';
import { Display } from 'components/shared/ReactComponent';
import { Inject } from 'services/core/injector';
import { WindowsService } from 'services/windows';
import { SourcesService } from 'services/sources';
import electron from 'electron';
import Util from 'services/utils';
import { Subscription } from 'rxjs';
import Scrollable from 'components/shared/Scrollable';

@Component({
  components: {
    ModalLayout,
    Display,
    Scrollable,
  },
})
export default class Projector extends Vue {
  @Inject() windowsService: WindowsService;
  @Inject() sourcesService: SourcesService;

  oldBounds: electron.Rectangle;

  sourcesSubscription: Subscription;

  get hideStyleBlockers() {
    return this.windowsService.state[this.windowId].hideStyleBlockers;
  }

  get windowId() {
    return Util.getCurrentUrlParams().windowId;
  }

  get fullscreen() {
    return this.windowsService.state[this.windowId].isFullScreen;
  }

  mounted() {
    this.sourcesSubscription = this.sourcesService.sourceRemoved.subscribe(source => {
      if (source.sourceId === this.sourceId) {
        electron.remote.getCurrentWindow().close();
      }
    });
  }

  destroyed() {
    this.sourcesSubscription.unsubscribe();
  }

  get sourceId() {
    return this.windowsService.getWindowOptions(this.windowId).sourceId;
  }

  get renderingMode() {
    return this.windowsService.getWindowOptions(this.windowId).renderingMode;
  }

  get allDisplays() {
    return electron.remote.screen.getAllDisplays();
  }

  enterFullscreen(display: electron.Display) {
    const currentWindow = electron.remote.getCurrentWindow();
    this.windowsService.setOneOffFullscreen(this.windowId, true);
    this.oldBounds = currentWindow.getBounds();
    currentWindow.setPosition(display.bounds.x, display.bounds.y);
    currentWindow.fullScreenable = true;
    currentWindow.setFullScreen(true);
    document.addEventListener('keydown', this.exitFullscreen);
  }

  exitFullscreen(e: KeyboardEvent) {
    if (e.code !== 'Escape') return;
    document.removeEventListener('keydown', this.exitFullscreen);
    this.windowsService.setOneOffFullscreen(this.windowId, false);
    const currentWindow = electron.remote.getCurrentWindow();
    currentWindow.setFullScreen(false);
    currentWindow.setBounds(this.oldBounds);
  }
}
