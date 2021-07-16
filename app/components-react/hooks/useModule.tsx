import { useRef } from 'react';
import { useOnCreate, useOnDestroy } from '../hooks';
import { IReduxModule, getModuleManager, useSelector, createDependencyWatcher } from '../store';
import { useComponentId } from './useComponentId';
import { merge } from '../../util/merge';
import { lockThis } from '../../util/lockThis';

/**
 * A hook for using ReduxModules in components
 *
 * @example 1
 * // get module instance in the component
 * const myModule = useModule(MyModule)
 *
 * // use Redux to select reactive props from the module
 * const { foo } = useSelector(() => ({ foo: myModule.foo }))
 *
 * @example 2
 * // same as example 1 but with one-liner syntax
 * const { foo } = useModule(MyModule).select()
 *
 * @example 3
 * // same as example 2 but with a computed prop
 * const { foo, fooBar } = useModule(MyModule)
 *  .selectExtra(module => { fooBar: module.foo + module.bar  }))
 */
export function useModule<
  TInitParams,
  TState,
  TModuleClass extends new (...args: any[]) => IReduxModule<TInitParams, TState>,
  TReturnType extends InstanceType<TModuleClass> & {
    select: () => InstanceType<TModuleClass> &
      InstanceType<TModuleClass>['state'] & { module: InstanceType<TModuleClass> };

    selectExtra: <TComputedProps>(
      fn: (module: InstanceType<TModuleClass>) => TComputedProps,
    ) => InstanceType<TModuleClass> & TComputedProps & { module: InstanceType<TModuleClass> };
  }
>(ModuleClass: TModuleClass, initParams?: TInitParams): TReturnType {
  const computedPropsFnRef = useRef<null | Function>(null);
  const computedPropsRef = useRef<any>({});
  const dependencyWatcherRef = useRef<any>(null);
  const moduleName = ModuleClass.name;
  const componentId = useComponentId();

  // register the component in the ModuleManager upon component creation
  const { module, select, selector } = useOnCreate(() => {
    // get existing module's instance or create a new one
    const moduleManager = getModuleManager();
    let module = moduleManager.getModule(moduleName);
    if (!module) {
      module = moduleManager.registerModule(new ModuleClass(), initParams);
    }
    // register the component in the module
    moduleManager.registerComponent(moduleName, componentId);

    // lockedModule is a copy of the module where all methods have a persistent `this`
    // as if we called `module.methodName = module.methodName.bind(this)` for each method
    const lockedModule = lockThis(module);

    // calculate computed props that were passed via `.selectExtra()` call
    // and save them in `computedPropsRef`
    function calculateComputedProps() {
      const compute = computedPropsFnRef.current;
      if (!compute) return;
      const computedProps = compute(module);
      Object.assign(computedPropsRef.current, computedProps);
      return computedPropsRef.current;
    }

    // Create a public `.select()` method that allows to select reactive state for the component
    function select<TComputedProps>(
      fn?: (module: InstanceType<TModuleClass>) => TComputedProps,
    ): InstanceType<TModuleClass> & TComputedProps {
      // create DependencyWatcher as a source of state to select from
      if (!dependencyWatcherRef.current) {
        if (fn) computedPropsFnRef.current = fn;
        // we have several sources of data to select from
        // use `merge` function to join them into a single object
        const mergedModule = merge(
          // allow to select variables from the module's state
          () => module.state,
          // allow to select getters and actions from the module
          () => lockedModule,
          // allow to select computed props
          () => computedPropsRef.current,
          // allow to select the whole module itself
          () => ({ module }),
        );
        dependencyWatcherRef.current = createDependencyWatcher(mergedModule);
      }
      return dependencyWatcherRef.current.watcherProxy;
    }

    // Create a Redux selector.
    // Redux calls this method every time when component's dependencies have been changed
    function selector() {
      // recalculate computed props
      calculateComputedProps();
      // select component's dependencies
      return dependencyWatcherRef.current?.getDependentValues();
    }

    return {
      module,
      selector,
      select,
    };
  });

  // unregister the component from the module onDestroy
  useOnDestroy(() => {
    getModuleManager().unRegisterComponent(moduleName, componentId);
  });

  // call Redux selector to make selected props reactive
  useSelector(selector);

  // return Module with extra `select` method
  // TODO: `.selectExtra()` is the same method as `.select()`
  //  and it was added here only because of typing issues related to multiple tsconfings in the project.
  //  We should use only the `.select` after resolving typing issues
  const mergeResult = merge(
    () => module,
    () => ({ select, selectExtra: select }),
  );
  return (mergeResult as unknown) as TReturnType;
}
