import { StatefulService, mutation } from './core/stateful-service';
import { Subject } from 'rxjs';

export type TAppPage =
  | 'Studio'
  | 'Onboarding'
  | 'BrowseOverlays'
  | 'PatchNotes'
  | 'PlatformAppMainPage'
  | 'PlatformAppStore'
  | 'PlatformMerge'
  | 'LayoutEditor'
  | 'PrimeExpiration'
  | 'AlertboxLibrary'
  | 'StreamScheduler'
  | 'Highlighter'
  | 'Grow';

interface INavigationState {
  currentPage: TAppPage;
  params: Dictionary<string | boolean>;
}

export class NavigationService extends StatefulService<INavigationState> {
  static initialState: INavigationState = {
    currentPage: 'Studio',
    params: {},
  };

  navigated = new Subject<INavigationState>();

  navigate(page: TAppPage, params: Dictionary<string | boolean> = {}) {
    this.NAVIGATE(page, params);
    this.navigated.next(this.state);
  }

  @mutation()
  private NAVIGATE(page: TAppPage, params: Dictionary<string | boolean>) {
    this.state.currentPage = page;
    this.state.params = params;
  }
}
