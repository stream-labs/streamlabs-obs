import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from '../../util/injector';
import { WindowsService } from '../../services/windows';
import windowMixin from '../mixins/window';
import { SourceFiltersService } from '../../services/source-filters';

import * as inputComponents from '../shared/forms';
import ModalLayout from '../ModalLayout.vue';


@Component({
  components: { ModalLayout, ...inputComponents },
  mixins: [windowMixin]
})
export default class AddSourceFilter extends Vue {

  @Inject()
  windowsService: WindowsService;

  @Inject('SourceFiltersService')
  filtersService: SourceFiltersService;

  sourceId: string = this.windowsService.getChildWindowQueryParams().sourceId;
  form = this.filtersService.getAddNewFormData(this.sourceId);
  availableTypes = this.filtersService.getTypesForSource(this.sourceId);
  error = '';

  mounted() {
    this.setTypeAsName();
  }

  done() {
    const name = this.form.name.value;
    this.error = this.validateName(name);
    if (this.error) return;

    this.filtersService.add(
      this.sourceId,
      this.form.type.value,
      name
    );

    this.filtersService.showSourceFilters(this.sourceId, name);
  }

  cancel() {
    this.filtersService.showSourceFilters(this.sourceId);
  }

  validateName(name: string) {
    if (!name) return 'Name is required';
    if (this.filtersService.getFilters(this.sourceId).find(filter => filter.name === name)) {
      return 'That name is already taken';
    }
    return '';
  }

  setTypeAsName() {
    const name = this.availableTypes.find(({ type }) => {
      return type === this.form.type.value;
    }).description;
    this.form.name.value = this.filtersService.suggestName(this.sourceId, name);
  }

}
