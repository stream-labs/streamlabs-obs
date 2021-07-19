import { Component } from 'vue-property-decorator';
import { IPollData, PollService } from 'services/widgets/settings/poll';

import WidgetEditor from 'components/windows/WidgetEditor.vue';
import WidgetSettings from './WidgetSettings.vue';

import VFormGroup from 'components/shared/inputs/VFormGroup.vue';
import ValidatedForm from 'components/shared/inputs/ValidatedForm';
import { Services } from 'components-react/service-provider';

import { $t } from 'services/i18n';

@Component({})
export default class Poll extends WidgetSettings<IPollData, PollService> {
  UserService = Services.UserService;

  get metadata() {
    return this.service.getMetadata();
  }

  get isTwitchAuthed() {
    return this.UserService.views.isTwitchAuthed;
  }

  get navItems() {
    return [
      { value: 'poll', label: $t('Manage Poll') },
      { value: 'font', label: $t('Font Settings') },
      { value: 'bar', label: $t('Bar Settings') },
      { value: 'source', label: $t('Source') },
    ];
  }

  render() {
    console.log(this.metadata);
    return (
      this.wData && (
        <WidgetEditor navItems={this.navItems}>
          <ValidatedForm slot="poll-properties" onInput={() => this.save()}>
            {this.isTwitchAuthed && (
              <VFormGroup
                vModel={this.wData.settings.poll_type}
                metadata={this.metadata.pollType}
              />
            )}
            <VFormGroup
              vModel={this.wData.settings.show_on_closed}
              metadata={this.metadata.showOnClosed}
            />
            <VFormGroup
              vModel={this.wData.settings.background_color_primary}
              metadata={this.metadata.backgroundPrimary}
            />
            <VFormGroup
              vModel={this.wData.settings.background_color_secondary}
              metadata={this.metadata.backgroundSecondary}
            />
            <VFormGroup vModel={this.wData.settings.fade_time} metadata={this.metadata.fadeTime} />
          </ValidatedForm>
          <ValidatedForm slot="font-properties" onInput={() => this.save()}>
            <VFormGroup vModel={this.wData.settings.font} metadata={this.metadata.font} />
            <VFormGroup
              vModel={this.wData.settings.font_color_primary}
              metadata={this.metadata.fontPrimary}
            />
            <VFormGroup
              vModel={this.wData.settings.font_color_secondary}
              metadata={this.metadata.fontSecondary}
            />
            <VFormGroup
              vModel={this.wData.settings.title_font_size}
              metadata={this.metadata.titleSize}
            />
            <VFormGroup
              vModel={this.wData.settings.option_font_size}
              metadata={this.metadata.optionSize}
            />
            <VFormGroup
              vModel={this.wData.settings.title_font_weight}
              metadata={this.metadata.titleWeight}
            />
            <VFormGroup
              vModel={this.wData.settings.option_font_weight}
              metadata={this.metadata.optionWeight}
            />
          </ValidatedForm>
          <ValidatedForm slot="bar-properties" onInput={() => this.save()}>
            <VFormGroup metadata={this.metadata.thinBar} vModel={this.wData.settings.thin_bar} />
            <VFormGroup
              vModel={this.wData.settings.bar_background_color}
              metadata={this.metadata.barBackground}
            />
            <VFormGroup vModel={this.wData.settings.bar_color} metadata={this.metadata.barColor} />
          </ValidatedForm>
        </WidgetEditor>
      )
    );
  }
}
