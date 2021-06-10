import React, { useContext, useEffect, useRef } from 'react';
import { StatefulService } from '../../services';
import cloneDeep from 'lodash/cloneDeep';
import flatten from 'lodash/flatten';
import isPlainObject from 'lodash/isPlainObject';
import mapKeys from 'lodash/mapKeys';
import { keys } from '../../services/utils';
import { useForceUpdate, useOnCreate, useOnDestroy } from '../hooks';
import { createBinding, TBindings } from '../shared/inputs';
import { assertIsDefined } from '../../util/properties-type-guards';
const GenericStateManagerContext = React.createContext(null);

// React devtools are broken for Electron 9 and 10
// as an alternative set DEBUG=true
// to track components re-renders and timings in the console
const DEBUG = false;

/**
 * Flux-like state manager for React.Context
 * Helps to track local and global (vuex) state and re-render components in optimized way
 * Use it when you have a complex state with computed fields that depends on Vuex
 *
 * We may want to replace this state manager with some library like Redux in the future
 *
 * @example
 * // in the hook file
 * function useAuth() {
 *    return useStateManager({ name: '', email: '' }, (getState, setState) => {
 *
 *      function setName(name: string) {
 *        setState({ ...getState(), name });
 *      }
 *
 *      function setEmail(email: string) {
 *        setState({ ...getState(), email });
 *      }
 *
 *      return { setName, setEmail };
 *    }).dependencyWatcher;
 * }
 *
 * // in the component file
 * // select fields we need to this components
 * const { name, setName } = useAuth(); // component will be updated only if selected fields have been changed
 */
export function useStateManager<
  TState extends object, // state type
  TInitializerReturnType extends object, // getters, mutations, actions and views related to the state
  TContextView extends object = TMerge<TState, TInitializerReturnType>, // state + everything from the initializer
  TComputedPropsCb = ((contextView: TContextView) => any) | null, // function for calculating the computed props
  TComputedProps = TComputedPropsCb extends (...args: any[]) => infer R ? R : {}, // computed props type
  TComputedView extends object = TMerge<TContextView, TComputedProps>, // state + initializer + computed props
  TComponentView extends object = TMerge<
    TComputedView,
    {
      Context: React.Context<TStateManagerContext<TContextView>>;
      contextValue: TStateManagerContext<TContextView>;
      useBinding<TBindingState extends object, TExtraProps extends object = {}>(
        stateGetter: () => TBindingState,
        stateSetter: (patch: TBindingState) => unknown,
        extraPropsGenerator?: (prop: keyof TBindingState) => TExtraProps,
      ): TBindings<TBindingState, keyof TBindingState, TExtraProps>;
    }
  >
>(
  initState: TState | (() => TState),
  initializer: (
    getState: () => TState,
    setState: (newState: TState) => void,
  ) => TInitializerReturnType,
  computedPropsCb: TComputedPropsCb,
) {
  // get component id and itinialize loger for the debug mode
  const componentId = useComponentId();
  useLogLifecycle(componentId);

  // initialize React.Context or create a new one if not exist
  const context = useContext(GenericStateManagerContext) as React.Context<
    TStateManagerContext<TContextView>
  > | null;

  const { contextValue, isRoot } = useOnCreate(() => {
    // the context already exists, use it
    if (context) {
      return {
        contextValue: (context as unknown) as TStateManagerContext<TContextView>,
        isRoot: false,
      };
    }

    // context is not found, create a new one
    return { contextValue: createContext(initState, initializer), isRoot: true };
  });

  // now working on a component instance

  // keep revision numbers for local and global (vuex) states
  // we need this numbers to check if component is synced with the last state
  const localStateRevisionRef = useRef(1);
  const globalStateRevisionRef = useRef(1);

  // keep computed props in ref
  const computedPropsRef = useRef<TComputedProps | null>(null);

  // save the previous component state in ref
  const prevComponentState = useRef<Partial<TComponentView> | null>(null);

  // true if component is destroyed
  const isDestroyedRef = useRef<boolean>(false);

  // we keep state is refs so we need to manually update components when it's changed
  const forceUpdate = useForceUpdate();

  // handle component creation
  const {
    dependencyWatcher,
    onChange,
    vuexSelector,
    componentView,
    calculateComputedProps,
  } = useOnCreate(() => {
    const { contextView } = contextValue;

    // computed props are unique for each component
    // calculate them and merge with ContextView
    const viewWithComputedProps = merge(contextView, () => computedPropsRef.current);

    // prepare Context and contextValue for the component
    const componentView = merge(viewWithComputedProps, {
      contextValue,
      Context: contextValue.Context,
    }) as TComponentView;

    // create a dependency watcher for the component
    // to track which state properties or getters does the component use
    // and update the component only if it's dependencies have been changed
    const dependencyWatcher = createDependencyWatcher(componentView);

    // define an onChange handler
    // when StateWatcher detects changes in store or local state this function will be called
    function onChange(change: TStateChange) {
      const { globalStateRevision, localStateRevision } = change;

      // handle vuex state change
      if (globalStateRevision) {
        const { prevState, newState } = change;
        if (isSimilar(prevState, newState)) {
          // the state is not changed
          return;
        } else {
          // the state has been changed, update the component
          if (DEBUG) logChange(prevState, newState, componentId, true, globalStateRevision);
          forceUpdate();
        }

        // handle local state changes inside React.Context
      } else if (localStateRevision) {
        calculateComputedProps();
        const prevState = prevComponentState.current;
        const newState = dependencyWatcher.getDependentValues();
        if (isSimilar(prevState, newState)) {
          // prevState and newState are equal, no action needed
          return;
        } else {
          // prevState and newState are not equal, update the component
          if (DEBUG) logChange(prevState, newState, componentId, false, localStateRevision);
          forceUpdate();
        }
      }
    }

    // calculate computed props and save them in the ref object
    function calculateComputedProps(): TComputedProps {
      computedPropsRef.current =
        typeof computedPropsCb === 'function' ? computedPropsCb(contextView) : {};
      return computedPropsRef.current as TComputedProps;
    }

    // create a state selector for watching state from vuex
    function vuexSelector() {
      // we should watch only component's dependencies
      return dependencyWatcher.getDependentValues();
    }

    return {
      componentView,
      onChange,
      dependencyWatcher,
      calculateComputedProps,
      vuexSelector,
    };
  });

  // sync revisions for the each component update cycle
  const prevLocalRev = localStateRevisionRef.current;
  localStateRevisionRef.current = contextValue.dispatcher.getRevision();
  globalStateRevisionRef.current = contextValue.stateWatcher.getRevision();
  if (prevLocalRev !== localStateRevisionRef.current) {
    calculateComputedProps();
  }

  // register the component in the stateWatcher
  const { stateWatcher } = contextValue;
  stateWatcher.registerComponent(
    componentId,
    vuexSelector,
    onChange,
    () => globalStateRevisionRef.current,
    () => localStateRevisionRef.current,
    () => isDestroyedRef.current,
  );
  // component mounted/updated
  useEffect(() => {
    // save the prev state
    prevComponentState.current = dependencyWatcher.getDependentValues();

    // start watching for changes
    stateWatcher.markAsReadyToWatch(componentId);
  });

  useOnDestroy(() => {
    isDestroyedRef.current = true;
    stateWatcher.unregisterComponent(componentId);
  });

  return {
    dependencyWatcher: dependencyWatcher.watcherProxy as TComponentView,
    contextView: contextValue.contextView as TContextView,
    componentView: componentView as TComponentView,
    isRoot,
  };
}

type TStateManagerContext<TContextView extends object> = {
  contextView: TContextView;
  Context: typeof GenericStateManagerContext;
  dispatcher: TDispatcher<unknown, unknown>;
  stateWatcher: ReturnType<typeof createStateWatcher>;
};

/**
 * Create context variables
 */
function createContext<
  TState,
  TActions extends Object,
  TContextView extends TMerge<TState, TActions>
>(
  initState: TState | (() => TState),
  actionsCreator: (getState: () => TState, setState: (newState: TState) => unknown) => TActions,
) {
  // create initial state
  const state: TState =
    typeof initState === 'function' ? (initState as Function)() : cloneDeep(initState);

  // create a local state and dispatcher
  const dispatcher = createDispatcher(state, actionsCreator);

  // create StateWatcher to observe changes from the local state and vuex
  // and update dependent components
  const stateWatcher = createStateWatcher(dispatcher);

  // merge it with state
  const contextView = merge(dispatcher.getState, dispatcher.actions) as TContextView;

  // new React.Context is ready
  return {
    contextView,
    Context: GenericStateManagerContext as React.Context<TStateManagerContext<TContextView> | null>,
    dispatcher,
    stateWatcher,
  } as TStateManagerContext<TContextView>;
}

let nextComponentId = 1;

/**
 * Returns an unique component id
 * If DEBUG=true then the componentId includes a component name
 */
function useComponentId() {
  /**
   * Get component name from the callstack
   * Use for debugging only
   */
  function getComponentName(): string {
    try {
      throw new Error();
    } catch (e: unknown) {
      if (e instanceof Error && e.stack) {
        return e.stack.split('\n')[10].split('at ')[1].split('(')[0].trim();
      } else {
        return '';
      }
    }
  }

  return useOnCreate(() => {
    return DEBUG ? `${nextComponentId++}_${getComponentName()}` : `${nextComponentId++}`;
  });
}

/**
 * Tracks read operations on the object
 *
 * @example
 *
 * const myObject = { foo: 1, bar: 2, qux: 3};
 * const { watcherProxy, getDependentFields } = createDependencyWatcher(myObject);
 * const { foo, bar } = watcherProxy;
 * getDependentFields(); // returns ['foo', 'bar'];
 *
 */
function createDependencyWatcher<T extends object>(watchedObject: T) {
  const dependencies: Record<string, any> = {};
  const watcherProxy = new Proxy(
    {
      _proxyName: 'DependencyWatcher',
      useBinding,
    },
    {
      get: (target, propName: string) => {
        if (propName in target) return target[propName];
        const value = watchedObject[propName];

        // Input bindings that have been created via createBinding() are source of
        // component's dependencies. We should handle them differently
        if (value && value._proxyName === 'Binding') {
          // if we already have the binding in the deps, just return it
          if (propName in dependencies) {
            return dependencies[propName];
          } else {
            // if it's the first time we access binding then clone it to dependencies
            // the binding object keep its own dependencies and cloning will reset them
            // that ensures each component will have it's own dependency list for the each binding
            dependencies[propName] = value._binding.clone();
            return dependencies[propName];
          }
        } else {
          // for non-binding objects just save their value in the dependencies
          dependencies[propName] = value;
          return value;
        }
      },
    },
  ) as T;

  function getDependentFields() {
    return Object.keys(dependencies);
  }

  function getDependentValues(): Partial<T> {
    const values: Partial<T> = {};
    Object.keys(dependencies).forEach(propName => {
      const value = dependencies[propName];
      // if one of dependencies is a binding then expose its internal dependencies
      if (value && value._proxyName === 'Binding') {
        const bindingMetadata = value._binding;
        Object.keys(bindingMetadata.dependencies).forEach(bindingPropName => {
          values[`${bindingPropName}__binding-${bindingMetadata.id}`] =
            dependencies[propName][bindingPropName].value;
        });
        return;
      }
      // if it's not a binding then just take the value from the watchedObject
      values[propName] = watchedObject[propName];
    });
    return values;
  }

  /**
   * Hook for creating an reactive input binding
   */
  function useBinding<TState extends object>(
    stateGetter: () => TState,
    stateSetter: (patch: TState) => unknown,
  ): TBindings<TState, keyof TState> {
    const bindingRef = useRef<TBindings<TState, keyof TState>>();
    if (!bindingRef.current) {
      const binding = createBinding(stateGetter, stateSetter);
      dependencies[binding._binding.id] = binding;
      bindingRef.current = binding;
    }
    assertIsDefined(bindingRef.current);
    return bindingRef.current;
  }

  return { watcherProxy, getDependentFields, getDependentValues };
}

/**
 * State watcher detects changes from Vuex store and local context state
 * And trigger components to re-render
 * @param dispatcher local state dispatcher
 */
function createStateWatcher(dispatcher: TDispatcher<unknown, unknown>) {
  type TComponentId = string;
  type TSubscription = {
    componentId: TComponentId;
    sequence: number;
    checkIsDestroyed(): boolean;
    getGlobalStateRevision(): number;
    getLocalStateRevision(): number;
    isReady: boolean;
    selector: Function;
    onChange: (change: TStateChange) => unknown;
  };

  // keep registered components here
  const components: Record<TComponentId, TSubscription> = {};

  // take vuex store
  const vuexStore = StatefulService.store;

  // list of components that currently watching the global and local state
  let watchedComponentsIds: string[] = [];

  // the revision number for current vuex state
  // each mutation increase this number
  // each component sync with this number after each update
  let stateRevision = 0;

  // true if we currently watch vuex
  let isWatching = false;
  let unsubscribeVuex: Function | null = null;

  // subscribe on changes from the local state
  dispatcher.subscribe((newState, revision) => {
    if (DEBUG) logMutation(revision, null, newState, false);
    getComponents().forEach(component => {
      if (component.checkIsDestroyed()) return;
      if (component.getLocalStateRevision() >= revision) return;
      component.onChange({ localStateRevision: revision });
    });
  });

  function checkIsRegistered(componentId: string): boolean {
    return componentId in components;
  }

  function registerComponent(
    componentId: string,
    selector: Function,
    onChange: (change: TStateChange) => unknown,
    getGlobalStateRevision: () => number,
    getLocalStateRevision: () => number,
    checkIsDestroyed: () => boolean,
  ) {
    if (!checkIsRegistered(componentId)) {
      // register a new component in the state watcher
      const sequence = Number(componentId.split('_')[0]);
      components[componentId] = {
        componentId,
        sequence,
        selector,
        onChange,
        getGlobalStateRevision,
        getLocalStateRevision,
        checkIsDestroyed,
        isReady: false,
      };
    } else {
      // if component is already registered then stop listen changes until its mount
      components[componentId].isReady = false;
    }
  }

  /**
   * Switch component into a state-watching mode
   * We should do it after component has been mounted
   * However we actually start watching state changes only when all components are mounted
   */
  function markAsReadyToWatch(componentId: string) {
    // mark component as ready to receiving state updates
    components[componentId].isReady = true;

    // if some component is not in the ready state, then just exit
    const hasPendingComponents = Object.keys(components).find(id => !components[id].isReady);
    if (hasPendingComponents) return;

    // it's the last component that was in unready state
    // check if we should restart vuex watcher now
    const registeredComponentIds = getComponents().map(c => c.componentId);
    if (!isArrayEqual(watchedComponentsIds, registeredComponentIds)) {
      stopWatching();
      startWatching();
    }
  }

  function unregisterComponent(componentId: string) {
    delete components[componentId];
  }

  /**
   * Create a single Vuex watcher for all components in the context
   * It gives us better control on rendering and better performance
   * since we subscribe vuex only once for all component in the context
   */
  function createVuexGetter() {
    return () => {
      // create one cb for all subscribed components
      const mixedState: Record<string, any> = {};
      const prefixedStates = getComponents().map(comp => {
        const componentState = comp.selector();
        return mapKeys(componentState, (value, key) => getPrefixedField(comp.componentId, key));
      });
      prefixedStates.forEach(state => Object.assign(mixedState, state));
      return mixedState;
    };
  }
  /**
   * Start watching Vuex and local state
   */
  function startWatching() {
    watchedComponentsIds = getComponents().map(comp => comp.componentId);
    unsubscribeVuex = vuexStore.watch(createVuexGetter(), (newState, prevState) => {
      stateRevision++;
      if (DEBUG) logMutation(stateRevision, prevState, newState, true);
      // walk through newState and generate a `changes` object with newState and prevState
      // for each component
      const changes: Record<TComponentId, { newState: object; prevState: object }> = {};
      Object.keys(newState).forEach(prefixedField => {
        const newVal = newState[prefixedField];
        const prevVal = prevState[prefixedField];
        const [componentId, fieldName] = getUnprefixed(prefixedField);
        const componentPrevState = changes[componentId]?.prevState || {};
        const componentNewState = changes[componentId]?.newState || {};
        componentPrevState[fieldName] = prevVal;
        componentNewState[fieldName] = newVal;
        changes[componentId] = { newState: componentNewState, prevState: componentPrevState };
      });

      const currentRevision = stateRevision;

      // walk through registered components and trigger onChange
      getComponents().forEach(component => {
        if (component.checkIsDestroyed()) return;
        if (component.getGlobalStateRevision() >= currentRevision) return;
        const { newState, prevState } = changes[component.componentId];
        component.onChange({ newState, prevState, globalStateRevision: currentRevision });
      });
    });
    isWatching = true;
    log('subscribed to vuex');
  }

  function stopWatching() {
    unsubscribeVuex && unsubscribeVuex();
    unsubscribeVuex = null;
    watchedComponentsIds = [];
    isWatching = false;
  }

  function getPrefixedField(componentId: string, fieldName: string) {
    return `${componentId}__${fieldName}`;
  }

  function getUnprefixed(prefixedField: string) {
    return prefixedField.split('__') as [string, string];
  }

  /**
   * return registered components
   * returned components are sorted by sequence
   * that ensures we update them in the most optimized order
   */
  function getComponents() {
    return Object.keys(components)
      .sort((id1, id2) => components[id1].sequence - components[id2].sequence)
      .map(id => {
        return components[id] as Required<TSubscription>;
      });
  }

  function getRevision(): number {
    return stateRevision;
  }

  return {
    registerComponent,
    unregisterComponent,
    markAsReadyToWatch,
    getRevision,
  };
}
type TStateChange = {
  newState?: unknown;
  prevState?: unknown;
  globalStateRevision?: number;
  localStateRevision?: number;
};

/**
 * Create a local state with actions
 * and allow to subscribe on changes
 */
function createDispatcher<TState, TActions extends Object>(
  initialState: TState,
  actionCreators: (getState: () => TState, setState: (newState: TState) => unknown) => TActions,
): TDispatcher<TState, TActions> {
  // the local state revision number, this number will be increased after each state mutation
  let localStateRevision = 0;
  function getRevision() {
    return localStateRevision;
  }

  // create state, state getter and state setter
  let state = initialState;

  function getState() {
    return state;
  }

  function setState(newState: TState) {
    localStateRevision++;
    state = newState;
    queueOnChange();
  }

  // define queueOnChange() method to emit the change event after state has been changed
  let timeoutId = 0;
  function queueOnChange() {
    if (timeoutId) return;
    timeoutId = setTimeout(() => {
      onChangeHandler && onChangeHandler(getState(), getRevision());
      timeoutId = 0;
    });
  }

  // allow to subscribe on state changes
  let onChangeHandler: (newState: TState, revision: number) => unknown | null;
  function subscribe(cb: (newState: TState, revision: number) => unknown) {
    onChangeHandler = cb;
  }

  const actions = actionCreators(getState, setState);
  return { getState, subscribe, actions, getRevision };
}
type TDispatcher<TState, TActions> = {
  getState: () => TState;
  actions: TActions;
  subscribe: (cb: (newState: TState, revision: number) => unknown) => unknown;
  getRevision: () => number;
};

/**
 * Merge multiple objects in one without reading their props
 * Ensures the result object is read-only
 *
 * @example merge 2 objects and a function
 *
 * const obj1 = { propOne: 1 };
 * const obj2 = { propTwo: 2 };
 * let propThree = 3;
 * const fn = () => ({ propThree })
 *
 * const result = merge(obj1, obj2, fn);
 * result.propOne; // returns 1
 * result.propTwo; // returns 2
 * result.propThree; // returns 3
 *
 * propThree = 99
 *
 * result.propThree; // returns 99
 *
 *
 * @example merge an object and a class instance
 * const date = new Date();
 * const { message: 'Today is'}
 * const result = merge(message, date);
 * console.log(result.message, result.toDateString()); // prints Today is %date%
 *
 */
export function merge<
  T1 extends object,
  T2 extends object,
  T3 extends object,
  TReturnType = T3 extends undefined ? TMerge<T1, T2> : TMerge3<T1, T2, T3>
>(...objects: [T1, T2, T3?]): TReturnType {
  const mergedObjects = flatten(objects.map(getMergedObjects));

  const metadata = {
    _proxyName: 'MergeResult',
    _cache: {},
    _mergedObjects: mergedObjects,
  };

  function getMergedObjects(obj: any) {
    // if the object already merged then take its sub-objects
    if (obj._proxyName === 'MergeResult') return obj._mergedObjects;

    // if the object is class instance like ServiceView then rebind `this` for its methods
    if (typeof obj !== 'function' && !isPlainObject(obj)) {
      return [rebindThis(obj)];
    }
    return [obj];
  }

  /**
   * find eligible object from the list of merged objects
   * and save it in the cache for the future usage
   */
  function findTarget(propName: string) {
    if (propName in metadata._cache) {
      const target = metadata._cache[propName];
      return target;
    }

    const target = mergedObjects
      .slice()
      .reverse()
      .find(target => {
        const obj = typeof target === 'function' ? target() : target;
        if (obj.hasOwnProperty(propName) || obj.constructor?.prototype?.hasOwnProperty(propName)) {
          return true;
        }
      });
    metadata._cache[propName] = target;
    return target;
  }

  function findTargetObject(propName: string) {
    const target = findTarget(propName);
    return typeof target === 'function' ? target() : target;
  }

  function getTargetValue(target: object | Function, propName: string) {
    if (typeof target === 'function') {
      // if target is a function then call the function and take the value
      return target()[propName];
    } else {
      return target[propName];
    }
  }

  /**
   * Re-bind this for all object's methods to ensure `this` is always defined
   * if we extract methods from an objet this way:
   *
   * const { action1, action2 } = actions;
   */
  function rebindThis(instance: object) {
    function copyMethods(fromObject: object, toObject: object) {
      Object.getOwnPropertyNames(fromObject).forEach(propName => {
        const descriptor = Object.getOwnPropertyDescriptor(fromObject, propName);
        if (!descriptor) return;
        if (descriptor.get) {
          Object.defineProperty(toObject, propName, {
            enumerable: true,
            get() {
              return instance[propName];
            },
          });
        } else if (typeof descriptor.value === 'function') {
          toObject[propName] = instance[propName].bind(instance);
        } else {
          toObject[propName] = instance[propName];
        }
      });
    }
    const props = {};
    copyMethods(instance.constructor.prototype, props);
    copyMethods(instance, props);
    return props;
  }

  function getKeys() {
    const value = Object.assign(
      {},
      ...mergedObjects.map(obj => (typeof obj === 'function' ? obj() : obj)),
    );
    return Object.keys(value);
  }

  return (new Proxy(metadata, {
    get(t, propName: string) {
      if (propName === 'hasOwnProperty') return (propName: string) => !!findTarget(propName);
      if (propName in metadata) return metadata[propName];
      const target = findTarget(propName);
      if (!target) return;
      return getTargetValue(target, propName);
    },
    set: (target, propName: string, val) => {
      if (propName.startsWith('_')) {
        metadata[propName] = val;
        return true;
      }
      const targetObj = findTargetObject(propName);

      if (Object.getOwnPropertyDescriptor(targetObj, propName)?.set) {
        targetObj[propName] = val;
        return true;
      }

      throw new Error('Can not change property on readonly object');
    },
    ownKeys() {
      return getKeys();
    },
    getOwnPropertyDescriptor(target, key) {
      const t = findTargetObject(key as string);
      return Object.getOwnPropertyDescriptor(t, key);
    },
  }) as unknown) as TReturnType;
}

export type TMerge<
  T1,
  T2,
  TObj1 = T1 extends (...args: any[]) => infer R1 ? R1 : T1,
  TObj2 = T2 extends (...args: any[]) => infer R2 ? R2 : T2,
  R extends object = Omit<TObj1, keyof TObj2> & TObj2
> = R;

export type TMerge3<T1, T2, T3> = TMerge<TMerge<T1, T2>, T3>;

/**
 * Create mutations from reducers
 */
export function createMutations<
  TState,
  TReducersSet extends Record<string, TReducer<TState>>,
  TMutationName extends keyof TReducersSet
>(
  reducers: TReducersSet,
  getState: () => TState,
  setState: (newState: TState) => any,
): { [K in TMutationName]: TConvertMutationToAction<TState, TReducersSet[K]> } {
  const mutations = {} as any;
  keys(reducers).forEach(key => {
    mutations[key] = (...args: any[]) => setState(reducers[key](getState(), ...args));
  });
  return mutations;
}

type TConvertMutationToAction<TState, TMutation> = TMutation extends (
  state: TState,
  ...args: infer TArgs
) => TState
  ? (...args: TArgs) => TState
  : never;

export type TReducer<TState> = (state: TState, ...args: any[]) => TState;

/**
 * consider isSimilar as isDeepEqual with depth 2
 */
function isSimilar(obj1: any, obj2: any) {
  return isDeepEqual(obj1, obj2, 0, 2);
}

/**
 * Compare 2 object with limited depth
 */
function isDeepEqual(obj1: any, obj2: any, currentDepth: number, maxDepth: number) {
  if (obj1 === obj2) return true;
  if (currentDepth === maxDepth) return false;
  if (Array.isArray(obj1) && Array.isArray(obj2)) return isArrayEqual(obj1, obj2);
  if (isPlainObject(obj1) && isPlainObject(obj2)) {
    const [keys1, keys2] = [Object.keys(obj1), Object.keys(obj2)];
    if (keys1.length !== keys2.length) return false;
    for (const key of keys1) {
      if (!isDeepEqual(obj1[key], obj2[key], currentDepth + 1, maxDepth)) return false;
    }
    return true;
  }
  return false;
}

/**
 * Shallow compare 2 arrays
 */
function isArrayEqual(a: any[], b: any[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * TODO: figure out why lodash.pick doesn't work with objects from the merge() function
 * Alternative to a lodash.pick()
 */
function pick<T extends Object>(obj: T, ...props: Array<string>): Partial<T> {
  const result: any = {};
  props.forEach(prop => {
    const propName = prop as string;
    if (obj.hasOwnProperty(propName)) result[propName] = obj[propName];
  });
  return result as Partial<T>;
}

// LOGGER UTILS

function useLogLifecycle(componentId: string) {
  const updateCounterRef = useRef<number>(1);

  // log lifecycle if in the debug mode
  if (DEBUG) {
    if (updateCounterRef.current === 1) {
      log('Create component', componentId);
    } else {
      log('Update component', componentId);
    }
    updateCounterRef.current++;
  }
  useEffect(() => {
    log('Effects applied to component', componentId);
  });
  useEffect(() => {
    return () => log('Destroy component', componentId);
  }, []);
}

/**
 * Log state change for a component
 */
function logChange(
  prevState: any,
  newState: any,
  componentId: string,
  isGlobalState: boolean,
  revision: number,
) {
  const mutationType = isGlobalState ? 'global' : 'local';
  const diff = getDiff(prevState, newState);
  const triggeredByMsg = `Triggered by ${mutationType} mutation #${revision}`;
  log('Should update component', componentId, triggeredByMsg, '. Diff:', diff);
}

/**
 * Log mutation
 */
function logMutation(revision: number, prevState: any, newState: any, isGlobal: boolean) {
  const mutationType = isGlobal ? 'GLOBAL' : 'LOCAL';
  const diff = prevState ? getDiff(prevState, newState) : 'unavailable';
  const diffMessage = Object.keys(diff).length
    ? diff
    : 'no changes detected with shallow comparison';
  log(`${mutationType} MUTATION #${revision}. Diff:`, diffMessage);
}

/**
 * Take difference between 2 objects
 */
function getDiff(prevState: any, newState: any) {
  const changedFields = Object.keys(newState).filter(
    key => !isSimilar(newState[key], prevState[key]),
  );
  const diff = {};
  changedFields.forEach(
    key => (diff[key] = { prevState: prevState[key], newState: newState[key] }),
  );
  return diff;
}

let logResetTimeout = 0;
let lastLogTime = 0;
let taskStartTime = 0;

/**
 * log message and track elapsed time between logs
 */
function log(msg: string, ...args: any[]) {
  if (!DEBUG) return;
  const now = Date.now();
  if (!lastLogTime) taskStartTime = now;
  const ms = lastLogTime ? now - lastLogTime : 0;

  // select console.log color based on elapsed time
  let msColor = 'green';
  if (ms >= 200) {
    msColor = 'red';
  } else if (ms >= 100) {
    msColor = 'orange';
  } else if (ms >= 50) {
    msColor = 'yellow';
  }

  lastLogTime = now;
  console.debug('%c%s', `color: ${msColor}`, `+${ms}ms`, `${msg}`, ...args);
  if (logResetTimeout) return;
  logResetTimeout = setTimeout(() => {
    const taskTime = Date.now() - taskStartTime;
    logResetTimeout = 0;
    lastLogTime = 0;
    taskStartTime = 0;
    console.debug('%c%s', 'color: teal', `end task for ${taskTime}ms`);
  });
}
