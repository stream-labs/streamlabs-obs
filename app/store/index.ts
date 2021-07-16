import Vue from 'vue';
import Vuex, { Store } from 'vuex';
import each from 'lodash/each';
import electron from 'electron';
import { getModule, StatefulService } from '../services/core/stateful-service';
import { ServicesManager } from '../services-manager';
import { IMutation } from 'services/api/jsonrpc';
import Util from 'services/utils';
import { InternalApiService } from 'services/api/internal-api';
import cloneDeep from 'lodash/cloneDeep';

Vue.use(Vuex);

const { ipcRenderer, remote } = electron;

const debug = process.env.NODE_ENV !== 'production';

const mutations = {
  // tslint:disable-next-line:function-name
  BULK_LOAD_STATE(state: any, data: any) {
    each(data.state, (value, key) => {
      if (key === 'i18nReady') return;
      state[key] = value;
    });
  },

  I18N_READY(state: any) {
    state.i18nReady = true;
  },
};

const actions = {};

const plugins: any[] = [];

let mutationId = 1;
const isWorkerWindow = Util.isWorkerWindow();
let storeCanReceiveMutations = isWorkerWindow;

const appliedForeignMutations = new Set<number>();

// This plugin will keep all vuex stores in sync via IPC
plugins.push((store: Store<any>) => {
  store.subscribe((mutation: Dictionary<any>) => {
    const internalApiService: InternalApiService = InternalApiService.instance;
    if (mutation.payload && !mutation.payload.__vuexSyncIgnore) {
      const mutationToSend: IMutation = {
        id: mutationId++,
        type: mutation.type,
        payload: mutation.payload,
      };
      internalApiService.handleMutation(mutationToSend);
      sendMutationToRendererWindows(mutationToSend);
    }
  });

  // Only the worker window should ever receive this
  ipcRenderer.on('vuex-sendState', (event: Electron.Event, windowId: number) => {
    const win = remote.BrowserWindow.fromId(windowId);
    flushMutations();
    win.webContents.send('vuex-loadState', JSON.stringify(store.state));
  });

  // Only renderer windows should ever receive this
  ipcRenderer.on('vuex-loadState', (event: Electron.Event, state: any) => {
    store.commit('BULK_LOAD_STATE', {
      state: JSON.parse(state),
      __vuexSyncIgnore: true,
    });

    // renderer windows can't receive mutations until after the BULK_LOAD_STATE event
    storeCanReceiveMutations = true;
  });

  // All windows can receive this
  ipcRenderer.on('vuex-mutation', (event: Electron.Event, mutationString: string) => {
    if (!storeCanReceiveMutations) return;

    const mutations = JSON.parse(mutationString);
    for (const mutation of mutations) {
      commitMutation(mutation);
    }
  });

  ipcRenderer.send('vuex-register');
});

let store: Store<any> = null;

export function createStore(): Store<any> {
  const statefulServiceModules = {};
  const servicesManager: ServicesManager = ServicesManager.instance;

  // TODO: This is bad and I should feel bad
  window['servicesManager'] = servicesManager;

  const statefulServices = servicesManager.getStatefulServicesAndMutators();
  Object.keys(statefulServices).forEach(serviceName => {
    statefulServiceModules[serviceName] = getModule(statefulServices[serviceName]);
  });

  store = new Vuex.Store({
    plugins,
    mutations,
    actions,
    modules: {
      ...statefulServiceModules,
    },
    strict: false,
    state: {
      bulkLoadFinished: !!Util.isWorkerWindow(),
      i18nReady: false,
    },
  });

  StatefulService.setupVuexStore(store);

  return store;
}

export function commitMutation(mutation: IMutation) {
  if (appliedForeignMutations.has(mutation.id)) return;
  appliedForeignMutations.add(mutation.id);
  store.commit(
    mutation.type,
    Object.assign({}, mutation.payload, {
      __vuexSyncIgnore: true,
    }),
  );
}

const mutationsQueue: IMutation[] = [];

/**
 * Add mutation to the queue so we can send it to the renderer windows along with other
 * pending mutations.
 * This prevents multiple re-renders of Vue components for each single mutation.
 */
function sendMutationToRendererWindows(mutation: IMutation) {
  // we need to `cloneDeep` to avoid sending modified data from the state
  mutationsQueue.push(cloneDeep(mutation));
  setTimeout(() => flushMutations());
}

function flushMutations() {
  ipcRenderer.send('vuex-mutation', JSON.stringify(mutationsQueue));
  mutationsQueue.length = 0;
}
