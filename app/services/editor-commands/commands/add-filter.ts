import { Command } from './command';
import { SourceFiltersService, TSourceFilterType } from 'services/source-filters';
import { Inject } from 'services/core/injector';

export class AddFilterCommand extends Command {
  @Inject() private sourceFiltersService: SourceFiltersService;

  constructor(
    private sourceId: string,
    private type: TSourceFilterType,
    private name: string,
    private settings?: Dictionary<any>,
  ) {
    super();
  }

  get description() {
    return `Add ${this.name}`;
  }

  execute() {
    this.sourceFiltersService.add(this.sourceId, this.type, this.name, this.settings);
  }

  rollback() {
    this.sourceFiltersService.remove(this.sourceId, this.name);
  }
}
