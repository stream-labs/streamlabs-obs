import {
  IWidgetData,
  IWidgetSettings,
  WidgetDefinitions,
  WidgetSettingsService,
  WidgetType,
} from 'services/widgets';
import { WIDGET_INITIAL_STATE } from './widget-settings';
import { InheritMutations } from 'services/core/stateful-service';
import { formMetadata, metadata } from 'components/shared/inputs';
import { $t } from 'services/i18n';

export interface IPollSettings extends IWidgetSettings {
  background_color_primary: string;
  background_color_secondary: string;
  bar_background_color: string;
  bar_color: string;
  custom_css: string;
  custom_enabled: boolean;
  custom_html: string;
  custom_js: string;
  fade_time: number;
  font: string;
  font_color_primary: string;
  font_color_secondary: string;
  option_font_size: number;
  option_font_weight: number;
  show_on_closed: boolean;
  thin_bar: boolean;
  title_font_size: number;
  title_font_weight: number;
  poll_type: 'cloudbot' | 'twitch';
}

export interface IPollData extends IWidgetData {
  settings: IPollSettings;
}

@InheritMutations()
export class PollService extends WidgetSettingsService<IPollData> {
  static initialState = WIDGET_INITIAL_STATE;

  getApiSettings() {
    return {
      type: WidgetType.Poll,
      url: WidgetDefinitions[WidgetType.Poll].url(this.getHost(), this.getWidgetToken()),
      previewUrl: `https://${this.getHost()}/widgets/poll/${this.getWidgetToken()}?simulate=1`,
      dataFetchUrl: `https://${this.getHost()}/api/v5/slobs/widget/polls`,
      settingsSaveUrl: `https://${this.getHost()}/api/v5/slobs/widget/polls`,
      settingsUpdateEvent: 'pollSettingsUpdate',
      customCodeAllowed: true,
      customFieldsAllowed: true,
      hasTestButtons: true,
    };
  }

  getMetadata() {
    return formMetadata({
      pollType: metadata.list({
        title: $t('Poll Type'),
        options: [
          { title: 'Cloudbot', value: 'cloudbot' },
          { title: 'Twitch', value: 'twitch' },
        ],
      }),
      showOnClosed: metadata.bool({
        title: $t('Show Closed Poll'),
        tooltip: $t('Show/hide poll widget on closed poll'),
      }),
      backgroundPrimary: metadata.color({ title: $t('Primary Background Color') }),
      backgroundSecondary: metadata.color({ title: $t('Secondary Background Color') }),
      fadeTime: metadata.slider({
        title: $t('Fade Time'),
        min: 0,
        max: 60,
        tooltip: $t('Hide wigdet after X seconds of event'),
      }),
      font: metadata.fontFamily({ title: $t('Font') }),
      fontPrimary: metadata.color({ title: $t('Header Text Color') }),
      fontSecondary: metadata.color({ title: $t('Option Text Color') }),
      titleSize: metadata.slider({ title: $t('Title Font Size'), min: 12, max: 48, interval: 2 }),
      optionSize: metadata.slider({ title: $t('Option Font Size'), min: 12, max: 48, interval: 2 }),
      titleWeight: metadata.slider({
        title: $t('Title Font Weight'),
        min: 300,
        max: 900,
        interval: 100,
      }),
      optionWeight: metadata.slider({
        title: $t('Option Font Weight'),
        min: 300,
        max: 900,
        interval: 100,
      }),
      thinBar: metadata.bool({ title: $t('Thin Bar'), tooltip: $t('Display thin/thick Bar') }),
      barBackground: metadata.color({ title: $t('Bar Background Color') }),
      barColor: metadata.color({ title: $t('Bar Color') }),
    });
  }
}
