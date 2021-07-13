import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import GenericForm from 'components/obs/inputs/GenericForm';
import { TObsFormData, TObsValue } from 'components/obs/inputs/ObsInput';
import { CustomizationService } from 'services/customization';
import { ScenesService } from 'services/scenes';
import electron from 'electron';
import { WindowsService } from '../../../services/windows';

@Component({
  components: { GenericForm },
})
export default class ExperimentalSettings extends Vue {
  @Inject() private customizationService: CustomizationService;
  @Inject() private scenesService: ScenesService;
  @Inject() private windowsService: WindowsService;

  settingsFormData: TObsFormData = null;

  created() {
    this.settingsFormData = this.customizationService.views.experimentalSettingsFormData;
  }

  saveSettings(formData: TObsFormData) {
    const settings: Dictionary<TObsValue> = {};
    formData.forEach(formInput => {
      settings[formInput.name] = formInput.value;
    });
    this.customizationService.setSettings({ experimental: settings });
    this.settingsFormData = this.customizationService.views.experimentalSettingsFormData;
  }

  repairSceneCollection() {
    this.scenesService.repair();
    electron.remote.dialog.showMessageBox(electron.remote.getCurrentWindow(), {
      message: 'Repair finished. See details in the log file',
    });
  }

  showDemoComponents() {
    this.windowsService.showWindow({
      title: 'Shared React Components',
      componentName: 'SharedComponentsLibrary',
      size: { width: 1000, height: 1000 },
    });
  }
}
