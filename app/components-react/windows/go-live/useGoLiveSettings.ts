import { IGoLiveSettings, StreamInfoView } from '../../../services/streaming';
import { TPlatform } from '../../../services/platforms';
import { Services } from '../../service-provider';
import cloneDeep from 'lodash/cloneDeep';
import { FormInstance } from 'antd/lib/form';
import { message } from 'antd';
import { $t } from '../../../services/i18n';
import { mutation } from '../../store';
import { useModule } from '../../hooks/useModule';
import { useForm } from '../../shared/inputs/Form';
import { getDefined } from '../../../util/properties-type-guards';

type TCommonFieldName = 'title' | 'description';

export type TModificators = { isUpdateMode?: boolean; isScheduleMode?: boolean };
export type IGoLiveSettingsState = IGoLiveSettings & TModificators & { needPrepopulate: boolean };

/**
 * Extend GoLiveSettingsModule from StreamInfoView
 * So all getters from StreamInfoView will be available in GoLiveSettingsModule
 */
export class GoLiveSettingsModule extends StreamInfoView<IGoLiveSettingsState> {
  // antd form instance
  public form: FormInstance;

  // define initial state
  state: IGoLiveSettingsState = {
    isUpdateMode: false,
    platforms: {},
    customDestinations: [],
    tweetText: '',
    optimizedProfile: undefined,
    advancedMode: false,
    needPrepopulate: true,
  };

  // initial setup
  init(params: { isUpdateMode: boolean; form: FormInstance }) {
    this.form = params.form;
    this.state.isUpdateMode = params.isUpdateMode;
    this.prepopulate();
  }

  /**
   * Fetch settings for each platform
   */
  async prepopulate() {
    await Services.StreamingService.actions.return.prepopulateInfo();
    const view = new StreamInfoView({});
    const settings = {
      ...view.savedSettings, // copy saved stream settings
      tweetText: view.getTweetText(view.commonFields.title), // generate a default tweet text
      needPrepopulate: false,
    };
    // if stream has not been started than we allow to change settings only for a primary platform
    // so delete other platforms from the settings object
    if (this.isUpdateMode && !view.isMidStreamMode) {
      Object.keys(settings.platforms).forEach((platform: TPlatform) => {
        if (!this.checkPrimaryPlatform(platform)) delete settings.platforms[platform];
      });
    }
    this.updateSettings(settings);
  }

  getView(state: IGoLiveSettingsState) {
    return new StreamInfoView(state);
  }
  get settings() {
    return this.state;
  }

  getSettings() {
    return this.state;
  }

  get isLoading() {
    const state = this.state;
    return state.needPrepopulate || this.getView(this.state).isLoading;
  }

  get customDestinations() {
    return this.state.customDestinations;
  }

  get optimizedProfile() {
    return this.state.optimizedProfile;
  }

  get tweetText() {
    return this.state.tweetText;
  }

  get isUpdateMode() {
    return this.state.isUpdateMode;
  }

  /**
   * Update top level settings
   */
  @mutation()
  updateSettings(patch: Partial<IGoLiveSettingsState>) {
    const newSettings = { ...this.state, ...patch };
    // we should re-calculate common fields before applying new settings
    const platforms = this.getView(newSettings).applyCommonFields(newSettings.platforms);
    Object.assign(this.state, { ...newSettings, platforms });
  }
  /**
   * Update settings for a specific platforms
   */
  @mutation()
  updatePlatform(platform: TPlatform, patch: Partial<IGoLiveSettings['platforms'][TPlatform]>) {
    const updated = {
      platforms: {
        ...this.state.platforms,
        [platform]: { ...this.state.platforms[platform], ...patch },
      },
    };
    this.updateSettings(updated);
  }
  /**
   * Enable/disable a custom ingest destinations
   */
  @mutation()
  switchCustomDestination(destInd: number, enabled: boolean) {
    const customDestinations = cloneDeep(this.getView(this.state).customDestinations);
    customDestinations[destInd].enabled = enabled;
    this.updateSettings({ customDestinations });
  }
  /**
   * Switch Advanced or Simple mode
   */

  @mutation()
  switchAdvancedMode(enabled: boolean) {
    this.updateSettings({ advancedMode: enabled });
  }
  /**
   * Set a common field like title or description for all eligible platforms
   **/

  @mutation()
  updateCommonFields(fields: { title: string; description: string }) {
    Object.keys(fields).forEach((fieldName: TCommonFieldName) => {
      const value = fields[fieldName];
      this.platformsWithoutCustomFields.forEach(platform => {
        if (!this.supports(fieldName, [platform])) return;
        const platformSettings = getDefined(this.state.platforms[platform]);
        platformSettings[fieldName] = value;
      });
    });
  }

  /**
   * Save current settings so we can use it next time we open the GoLiveWindow
   */
  save(settings: IGoLiveSettingsState) {
    Services.StreamSettingsService.actions.return.setGoLiveSettings(settings);
  }

  /**
   * Switch platforms on/off and save settings
   * If platform is enabled then prepopulate its settings
   */
  switchPlatforms(enabledPlatforms: TPlatform[]) {
    this.linkedPlatforms.forEach(platform => {
      this.updatePlatform(platform, { enabled: enabledPlatforms.includes(platform) });
    });
    this.save(this.settings);
    this.prepopulate();
  }

  /**
   * Validate the form and show an error message
   */
  async validate() {
    try {
      await this.form.validateFields();
      return true;
    } catch (e: unknown) {
      message.error($t('Invalid settings. Please check the form'));
      return false;
    }
  }

  /**
   * Validate the form and start streaming
   */
  async goLive() {
    if (await this.validate()) {
      Services.StreamingService.actions.goLive(this.state);
    }
  }
  /**
   * Validate the form and send new settings for each eligible platform
   */
  async updateStream() {
    if (
      (await this.validate()) &&
      (await Services.StreamingService.actions.return.updateStreamSettings(this.state))
    ) {
      message.success($t('Successfully updated'));
    }
  }
}

export function useGoLiveSettings(params?: { isUpdateMode: boolean }) {
  const form = useForm();

  return useModule(GoLiveSettingsModule, {
    form,
    isUpdateMode: params?.isUpdateMode,
  });
}
