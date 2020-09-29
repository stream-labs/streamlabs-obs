import { Service, Inject } from 'services/core';
import electron from 'electron';
import { EditorCommandsService } from './editor-commands';
import { ClipboardService } from './clipboard';
import { OS } from 'util/operating-systems';
import { SelectionService } from './selection';
import { AppService } from './app';
import { WindowsService } from './windows';
import { NavigationService } from './navigation';

/**
 * Manages the application menu and shortcuts on Mac OS
 */
export class ApplicationMenuService extends Service {
  @Inject() editorCommandsService: EditorCommandsService;
  @Inject() clipboardService: ClipboardService;
  @Inject() selectionService: SelectionService;
  @Inject() appService: AppService;
  @Inject() windowsService: WindowsService;
  @Inject() navigationService: NavigationService;

  init() {
    if (process.platform !== OS.Mac) return;

    const menu = this.buildMenu();
    electron.remote.Menu.setApplicationMenu(menu);

    this.bindDynamicMenuItems();
  }

  private buildMenu(): electron.Menu {
    // TODO: i18n
    return electron.remote.Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'fileMenu' },
      {
        id: 'edit',
        label: 'Edit',
        submenu: [
          {
            id: 'undo',
            label: 'Undo',
            accelerator: 'Command+Z',
            click: () => {
              if (this.isEditorFocused()) {
                if (this.appService.state.loading) return;
                this.editorCommandsService.undo();
              } else {
                electron.remote.Menu.sendActionToFirstResponder('undo:');
              }
            },
          },
          {
            id: 'redo',
            label: 'Redo',
            accelerator: 'Command+Shift+Z',
            click: () => {
              if (this.isEditorFocused()) {
                if (this.appService.state.loading) return;
                this.editorCommandsService.redo();
              } else {
                electron.remote.Menu.sendActionToFirstResponder('redo:');
              }
            },
          },
          { type: 'separator' },
          {
            id: 'copy',
            label: 'Copy',
            accelerator: 'Command+C',
            click: () => {
              if (this.isEditorFocused()) {
                if (this.appService.state.loading) return;
                this.clipboardService.copy();
              } else {
                electron.remote.Menu.sendActionToFirstResponder('copy:');
              }
            },
          },
          {
            id: 'paste',
            label: 'Paste',
            accelerator: 'Command+V',
            click: () => {
              if (this.isEditorFocused()) {
                if (this.appService.state.loading) return;
                this.clipboardService.paste();
              } else {
                electron.remote.Menu.sendActionToFirstResponder('paste:');
              }
            },
          },
          {
            id: 'delete',
            label: 'Delete',
            click: () => {
              if (this.isEditorFocused()) {
                if (this.appService.state.loading) return;
                this.selectionService.views.globalSelection.remove();
              }
            },
          },
          {
            label: 'Select All',
            accelerator: 'Command+A',
            click: () => {
              if (this.isEditorFocused()) {
                if (this.appService.state.loading) return;
                this.selectionService.views.globalSelection.selectAll();
              } else {
                electron.remote.Menu.sendActionToFirstResponder('selectAll:');
              }
            },
          },
          { type: 'separator' },
          {
            id: 'nudgeUp',
            label: 'Nudge Selection Up',
            accelerator: 'Up',
            click: () => {
              if (this.isEditorFocused()) {
                if (this.appService.state.loading) return;
                this.editorCommandsService.nudgeActiveItemsUp();
              }
            },
          },
          {
            id: 'nudgeDown',
            label: 'Nudge Selection Down',
            accelerator: 'Down',
            click: () => {
              if (this.isEditorFocused()) {
                if (this.appService.state.loading) return;
                this.editorCommandsService.nudgeActiveItemsDown();
              }
            },
          },
          {
            id: 'nudgeLeft',
            label: 'Nudge Selection Left',
            accelerator: 'Left',
            click: () => {
              if (this.isEditorFocused()) {
                if (this.appService.state.loading) return;
                this.editorCommandsService.nudgeActiveItemsLeft();
              }
            },
          },
          {
            id: 'nudgeRight',
            label: 'Nudge Selection Right',
            accelerator: 'Right',
            click: () => {
              if (this.isEditorFocused()) {
                if (this.appService.state.loading) return;
                this.editorCommandsService.nudgeActiveItemsRight();
              }
            },
          },
          { type: 'separator' },
          {
            label: 'Speech',
            submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }],
          },
        ],
      },
      {
        label: 'View',
        submenu: [{ role: 'togglefullscreen' }],
      },
      { role: 'windowMenu' },
      {
        label: 'Help',
        role: 'help',
        submenu: [
          {
            label: 'Streamlabs OBS Support',
            click: () => {
              electron.remote.shell.openExternal('https://support.streamlabs.com');
            },
          },
        ],
      },
    ]);
  }

  private isEditorFocused() {
    return (
      this.windowsService.windows.main.webContents.isFocused() &&
      this.navigationService.state.currentPage === 'Studio'
    );
  }

  private bindDynamicMenuItems() {
    const appMenu = electron.remote.Menu.getApplicationMenu();

    this.selectionService.updated.subscribe(state => {
      appMenu.getMenuItemById('nudgeUp').enabled = !!state.selectedIds.length;
      appMenu.getMenuItemById('nudgeDown').enabled = !!state.selectedIds.length;
      appMenu.getMenuItemById('nudgeLeft').enabled = !!state.selectedIds.length;
      appMenu.getMenuItemById('nudgeRight').enabled = !!state.selectedIds.length;
    });
  }
}
