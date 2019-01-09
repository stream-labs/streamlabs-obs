import { Component, Prop } from 'vue-property-decorator';
import { IObsInput, TObsType, ObsInput } from './ObsInput';
import { TextInput, TextAreaInput } from 'components/shared/inputs/inputs';
import VFormGroup from 'components/shared/inputs/VFormGroup.vue';

@Component({
  components: { TextInput, TextAreaInput, VFormGroup },
})
class ObsTextInput extends ObsInput<IObsInput<string>> {
  static obsType: TObsType[];

  @Prop()
  value: IObsInput<string>;

  get metadata() {
    return {
      masked: this.value.masked,
      disabled: this.value.enabled === false,
      rows: 4,
    };
  }

  onInputHandler(value: string) {
    this.emitInput({ ...this.value, value });
  }
}

ObsTextInput.obsType = ['OBS_PROPERTY_EDIT_TEXT', 'OBS_PROPERTY_TEXT'];

export default ObsTextInput;
