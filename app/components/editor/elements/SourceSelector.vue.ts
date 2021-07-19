import { Component, Watch } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import { SourcesService } from 'services/sources';
import { ScenesService, TSceneNode, ISceneItemFolder, ISceneItem } from 'services/scenes';
import { SelectionService } from 'services/selection';
import { EditMenu } from 'util/menus/EditMenu';
import SlVueTree, { ISlTreeNode, ISlTreeNodeModel, ICursorPosition } from 'sl-vue-tree';
import { WidgetType } from 'services/widgets';
import { $t } from 'services/i18n';
import { EditorCommandsService } from 'services/editor-commands';
import { EPlaceType } from 'services/editor-commands/commands/reorder-nodes';
import { CustomizationService } from 'services/customization';
import { StreamingService } from 'services/streaming';
import TsxComponent from 'components/tsx-component';
import Scrollable from 'components/shared/Scrollable';

const widgetIconMap = {
  [WidgetType.AlertBox]: 'fas fa-bell',
  [WidgetType.StreamBoss]: 'fas fa-gavel',
  [WidgetType.EventList]: 'fas fa-th-list',
  [WidgetType.TipJar]: 'fas fa-beer',
  [WidgetType.DonationTicker]: 'fas fa-ellipsis-h',
  [WidgetType.ChatBox]: 'fas fa-comments',
  [WidgetType.ViewerCount]: 'fas fa-eye',
  [WidgetType.SpinWheel]: 'fas fa-chart-pie',
  [WidgetType.Credits]: 'fas fa-align-center',
  [WidgetType.SponsorBanner]: 'fas fa-heart',
  [WidgetType.DonationGoal]: 'fas fa-calendar',
  [WidgetType.CharityGoal]: 'fas fa-calendar',
  [WidgetType.BitGoal]: 'fas fa-calendar',
  [WidgetType.FollowerGoal]: 'fas fa-calendar',
  [WidgetType.SubGoal]: 'fas fa-calendar',
  [WidgetType.StarsGoal]: 'fas fa-calendar',
  [WidgetType.SupporterGoal]: 'fas fa-calendar',
  [WidgetType.SubscriberGoal]: 'fas fa-calendar',
  [WidgetType.MediaShare]: 'icon-share',
  [WidgetType.Poll]: 'icon-text-align-left',
};

const sourceIconMap = {
  ffmpeg_source: 'far fa-file-video',
  text_gdiplus: 'fas fa-font',
  text_ft2_source: 'fas fa-font',
  image_source: 'icon-image',
  slideshow: 'icon-image',
  dshow_input: 'icon-webcam',
  wasapi_input_capture: 'icon-mic',
  wasapi_output_capture: 'icon-audio',
  monitor_capture: 'fas fa-desktop',
  browser_source: 'fas fa-globe',
  game_capture: 'fas fa-gamepad',
  scene: 'far fa-object-group',
  color_source: 'fas fa-fill',
  openvr_capture: 'fab fa-simplybuilt fa-rotate-180',
  liv_capture: 'fab fa-simplybuilt fa-rotate-180',
};

interface ISceneNodeData {
  id: string;
  sourceId: string;
}

@Component({
  components: { SlVueTree, Scrollable },
})
export default class SourceSelector extends TsxComponent {
  @Inject() private scenesService: ScenesService;
  @Inject() private sourcesService: SourcesService;
  @Inject() private selectionService: SelectionService;
  @Inject() private editorCommandsService: EditorCommandsService;
  @Inject() private streamingService: StreamingService;

  sourcesTooltip = $t('The building blocks of your scene. Also contains widgets.');
  addSourceTooltip = $t('Add a new Source to your Scene. Includes widgets.');
  removeSourcesTooltip = $t('Remove Sources from your Scene.');
  openSourcePropertiesTooltip = $t('Open the Source Properties.');
  addGroupTooltip = $t('Add a Group so you can move multiple Sources at the same time.');

  private expandedFoldersIds: string[] = [];

  $refs: {
    treeContainer: HTMLDivElement;
    slVueTree: SlVueTree<ISceneNodeData>;
  };

  callCameFromInsideTheHouse = false;

  get nodes(): ISlTreeNodeModel<ISceneNodeData>[] {
    // recursive function for transform SceneNode[] to ISlTreeNodeModel[]
    const getSlVueTreeNodes = (
      sceneNodes: (ISceneItem | ISceneItemFolder)[],
    ): ISlTreeNodeModel<ISceneNodeData>[] => {
      return sceneNodes.map(sceneNode => {
        return {
          title: this.getNameForNode(sceneNode),
          isSelected: this.isSelected(sceneNode),
          isLeaf: sceneNode.sceneNodeType === 'item',
          isExpanded: this.expandedFoldersIds.indexOf(sceneNode.id) !== -1,
          data: {
            id: sceneNode.id,
            sourceId: sceneNode.sceneNodeType === 'item' ? sceneNode.sourceId : null,
          },
          children:
            sceneNode.sceneNodeType === 'folder'
              ? getSlVueTreeNodes(this.getChildren(sceneNode))
              : null,
        };
      });
    };

    const nodes = this.scene.state.nodes.filter(n => !n.parentId);
    return getSlVueTreeNodes(nodes);
  }

  // TODO: Clean this up.  These only access state, no helpers
  getNameForNode(node: ISceneItem | ISceneItemFolder) {
    if (node.sceneNodeType === 'item') {
      return this.sourcesService.state.sources[node.sourceId].name;
    }

    return node.name;
  }

  isSelected(node: ISceneItem | ISceneItemFolder) {
    return this.selectionService.state.selectedIds.includes(node.id);
  }

  getChildren(node: ISceneItemFolder) {
    return this.scene.state.nodes.filter(n => n.parentId === node.id);
  }

  determineIcon(isLeaf: boolean, sourceId: string) {
    if (!isLeaf) {
      return 'fa fa-folder';
    }

    const source = this.sourcesService.state.sources[sourceId];

    if (source.propertiesManagerType === 'streamlabels') {
      return 'fas fa-file-alt';
    }

    if (source.propertiesManagerType === 'widget') {
      const widgetType = this.sourcesService.views
        .getSource(sourceId)
        .getPropertiesManagerSettings().widgetType;

      return widgetIconMap[widgetType] || 'icon-error';
    }

    return sourceIconMap[source.type] || 'fas fa-file';
  }

  addSource() {
    if (this.scenesService.views.activeScene) {
      this.sourcesService.showShowcase();
    }
  }

  addFolder() {
    if (this.scenesService.views.activeScene) {
      let itemsToGroup: string[] = [];
      let parentId: string;
      if (this.selectionService.views.globalSelection.canGroupIntoFolder()) {
        itemsToGroup = this.selectionService.views.globalSelection.getIds();
        const parent = this.selectionService.views.globalSelection.getClosestParent();
        if (parent) parentId = parent.id;
      }
      this.scenesService.showNameFolder({
        itemsToGroup,
        parentId,
        sceneId: this.scenesService.views.activeScene.id,
      });
    }
  }

  showContextMenu(sceneNodeId?: string, event?: MouseEvent) {
    const sceneNode = this.scene.getNode(sceneNodeId);
    if (sceneNode && !sceneNode.isSelected()) sceneNode.select();
    const menuOptions = sceneNode
      ? { selectedSceneId: this.scene.id, showSceneItemMenu: true }
      : { selectedSceneId: this.scene.id };

    const menu = new EditMenu(menuOptions);
    menu.popup();
    event && event.stopPropagation();
  }

  removeItems() {
    this.selectionService.views.globalSelection.remove();
  }

  sourceProperties(nodeId: string) {
    const node =
      this.scenesService.views.getSceneNode(nodeId) ||
      this.selectionService.views.globalSelection.getNodes()[0];

    if (!node) return;

    const item = node.isItem() ? node : node.getNestedItems()[0];

    if (!item) return;

    if (item.type === 'scene') {
      this.scenesService.actions.makeSceneActive(item.sourceId);
      return;
    }

    this.sourcesService.actions.showSourceProperties(item.sourceId);
  }

  canShowProperties(): boolean {
    if (this.activeItemIds.length === 0) return false;
    const sceneNode = this.scene.state.nodes.find(
      n => n.id === this.selectionService.state.lastSelectedId,
    );
    return sceneNode && sceneNode.sceneNodeType === 'item'
      ? this.sourcesService.views.getSource(sceneNode.sourceId).hasProps()
      : false;
  }

  handleSort(
    treeNodesToMove: ISlTreeNode<ISceneNodeData>[],
    position: ICursorPosition<TSceneNode>,
  ) {
    const nodesToMove = this.scene.getSelection(treeNodesToMove.map(node => node.data.id));

    const destNode = this.scene.getNode(position.node.data.id);

    if (position.placement === 'before') {
      this.editorCommandsService.executeCommand(
        'ReorderNodesCommand',
        nodesToMove,
        destNode.id,
        EPlaceType.Before,
      );
    } else if (position.placement === 'after') {
      this.editorCommandsService.executeCommand(
        'ReorderNodesCommand',
        nodesToMove,
        destNode.id,
        EPlaceType.After,
      );
    } else if (position.placement === 'inside') {
      this.editorCommandsService.executeCommand(
        'ReorderNodesCommand',
        nodesToMove,
        destNode.id,
        EPlaceType.Inside,
      );
    }
    this.selectionService.views.globalSelection.select(nodesToMove.getIds());
  }

  makeActive(treeNodes: ISlTreeNode<ISceneNodeData>[], ev: MouseEvent) {
    const ids = treeNodes.map(treeNode => treeNode.data.id);
    this.callCameFromInsideTheHouse = true;
    this.selectionService.views.globalSelection.select(ids);
  }

  toggleFolder(treeNode: ISlTreeNode<ISceneNodeData>) {
    const nodeId = treeNode.data.id;
    if (treeNode.isExpanded) {
      this.expandedFoldersIds.splice(this.expandedFoldersIds.indexOf(nodeId), 1);
    } else {
      this.expandedFoldersIds.push(nodeId);
    }
  }

  canShowActions(sceneNodeId: string) {
    return this.getItemsForNode(sceneNodeId).length > 0;
  }

  get lastSelectedId() {
    return this.selectionService.state.lastSelectedId;
  }

  @Watch('lastSelectedId')
  async expandSelectedFolders() {
    if (this.callCameFromInsideTheHouse) {
      this.callCameFromInsideTheHouse = false;
      return;
    }
    const node = this.scenesService.views.activeScene.getNode(this.lastSelectedId);
    if (!node || this.selectionService.state.selectedIds.length > 1) return;
    this.expandedFoldersIds = this.expandedFoldersIds.concat(node.getPath().slice(0, -1));

    await this.$nextTick();

    this.$refs[this.lastSelectedId].scrollIntoView({ behavior: 'smooth' });
  }

  get activeItemIds() {
    return this.selectionService.state.selectedIds;
  }

  get activeItems() {
    return this.selectionService.views.globalSelection.getItems();
  }

  toggleVisibility(sceneNodeId: string) {
    const selection = this.scene.getSelection(sceneNodeId);
    const visible = !selection.isVisible();
    this.editorCommandsService.executeCommand('HideItemsCommand', selection, !visible);
  }

  // TODO: Refactor into elsewhere
  getItemsForNode(sceneNodeId: string): ISceneItem[] {
    const node = this.scene.state.nodes.find(n => n.id === sceneNodeId);

    if (node.sceneNodeType === 'item') {
      return [node];
    }

    const children = this.scene.state.nodes.filter(n => n.parentId === sceneNodeId);
    let childrenItems: ISceneItem[] = [];

    children.forEach(c => (childrenItems = childrenItems.concat(this.getItemsForNode(c.id))));

    return childrenItems;
  }

  get selectiveRecordingEnabled() {
    return this.streamingService.state.selectiveRecording;
  }

  get streamingServiceIdle() {
    return this.streamingService.isIdle;
  }

  get replayBufferActive() {
    return this.streamingService.isReplayBufferActive;
  }

  get selectiveRecordingLocked() {
    return this.replayBufferActive || !this.streamingServiceIdle;
  }

  toggleSelectiveRecording() {
    if (this.selectiveRecordingLocked) return;
    this.streamingService.setSelectiveRecording(!this.streamingService.state.selectiveRecording);
  }

  cycleSelectiveRecording(sceneNodeId: string) {
    const selection = this.scene.getSelection(sceneNodeId);
    if (selection.isLocked()) return;
    if (selection.isStreamVisible() && selection.isRecordingVisible()) {
      selection.setRecordingVisible(false);
    } else if (selection.isStreamVisible()) {
      selection.setStreamVisible(false);
      selection.setRecordingVisible(true);
    } else {
      selection.setStreamVisible(true);
      selection.setRecordingVisible(true);
    }
  }

  selectiveRecordingClassesForSource(sceneNodeId: string) {
    const selection = this.scene.getSelection(sceneNodeId);
    if (selection.isStreamVisible() && selection.isRecordingVisible()) {
      return 'icon-smart-record';
    }
    return selection.isStreamVisible() ? 'icon-broadcast' : 'icon-studio';
  }

  selectiveRecordingTooltip(sceneNodeId: string) {
    const selection = this.scene.getSelection(sceneNodeId);
    if (selection.isStreamVisible() && selection.isRecordingVisible()) {
      return $t('Visible on both Stream and Recording');
    }
    return selection.isStreamVisible()
      ? $t('Only visible on Stream')
      : $t('Only visible on Recording');
  }

  visibilityClassesForSource(sceneNodeId: string) {
    // TODO: Clean up - need views or similar
    const items = this.getItemsForNode(sceneNodeId);
    // Visible if at least 1 item is visible
    const visible = !!items.find(i => i.visible);

    return {
      'icon-view': visible,
      'icon-hide': !visible,
    };
  }

  lockClassesForSource(sceneNodeId: string) {
    // TODO: Clean up - need views or similar
    const items = this.getItemsForNode(sceneNodeId);
    // Locked if all items are locked
    const locked = !items.find(i => !i.locked);

    return {
      'icon-lock': locked,
      'icon-unlock': !locked,
    };
  }

  toggleLock(sceneNodeId: string) {
    const selection = this.scene.getSelection(sceneNodeId);
    const locked = !selection.isLocked();
    selection.setSettings({ locked });
  }

  isLocked(sceneNodeId: string) {
    const selection = this.scene.getSelection(sceneNodeId);
    return selection.isLocked();
  }

  get scene() {
    return this.scenesService.views.activeScene;
  }
}
