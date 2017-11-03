import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from '../../util/injector';
import { WindowsService } from '../../services/windows';
import windowMixin from '../mixins/window';
import { IScenesServiceApi } from '../../services/scenes';
import { ISourcesServiceApi, TSourceType} from '../../services/sources';

import ModalLayout from '../ModalLayout.vue';
import Selector from '../Selector.vue';
import SourcePreview from '../shared/SourcePreview.vue';

@Component({
  components: { ModalLayout, Selector, SourcePreview },
  mixins: [windowMixin]
})
export default class AddSource extends Vue {

  @Inject() sourcesService: ISourcesServiceApi;
  @Inject() scenesService: IScenesServiceApi;
  @Inject() windowsService: WindowsService;

  name = '';
  error = '';
  sourceType = this.windowsService.getChildWindowQueryParams().sourceType as TSourceType;
  sources = this.sourcesService.getSources().filter(source => {
    return (
      source.type === this.sourceType &&
      source.sourceId !== this.scenesService.activeSceneId &&
      !source.channel
    );
  });

  existingSources = this.sources.map(source => {
    return { name: source.displayName, value: source.sourceId };
  });

  selectedSourceId = this.sources[0].sourceId;

  mounted() {
    const sourceType =
      this.sourceType &&
      this.sourcesService.getAvailableSourcesTypesList()
        .find(sourceTypeDef => sourceTypeDef.value === this.sourceType);
    this.name = this.sourcesService.suggestName((this.sourceType && sourceType.description));
  }

  addExisting() {
    const scene = this.scenesService.activeScene;
    if (!scene.canAddSource(this.selectedSourceId)) {
      // for now only a scene-source can be a problem
      alert('Unable to add a source: the scene you are trying to add already contains your current scene');
      return;
    }
    this.scenesService.activeScene.addSource(this.selectedSourceId);
    this.close();
  }

  close() {
    this.windowsService.closeChildWindow();
  }


  addNew() {
    if (this.isTaken(this.name)) {
      this.error = 'That name is already taken';
    } else {
      const sceneItem = this.scenesService.activeScene.createAndAddSource(
        this.name,
        this.sourceType
      );
      const source = sceneItem.getSource();
      this.close();
      if (source.hasProps()) this.sourcesService.showSourceProperties(source.sourceId);
    }
  }

  isTaken(name: string) {
    return this.sourcesService.getSourceByName(name);
  }

  get selectedSource() {
    return this.sourcesService.getSource(this.selectedSourceId);
  }

}
