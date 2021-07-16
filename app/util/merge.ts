/**
 * Merges multiple sources of data into a single Proxy object
 * The result object is read-only
 *
 * @example
 *
 * const mergedObject = merge(
 *   () => ({ foo: 1 }),
 *   () => ({ bar: 2 }),
 *   () => ({ bar: 3 }),
 * )
 *
 * mergedObject.bar // 3
 * mergedObject.foo // 1
 */
export function merge<
  T1 extends Object,
  T2 extends Object,
  T3 extends Object,
  T4 extends Object,
  FN3 extends () => T3,
  FN4 extends () => T4,
  TReturnType = FN4 extends undefined
    ? FN3 extends undefined
      ? TMerge<T1, T2>
      : TMerge3<T1, T2, T3>
    : TMerge4<T1, T2, T3, T4>
>(...functions: [() => T1, () => T2, FN3?, FN4?]): TReturnType {
  const result = functions.reduce((a, val) => mergeTwo(a as unknown, val as unknown));
  return (result as unknown) as TReturnType;
}

/**
 * This function is used by the `.merge()` function to merge 2 sources of data
 */
function mergeTwo<T1 extends Object, T2 extends Object, TReturnType = TMerge<T1, T2>>(
  target1: (() => T1) | T1,
  target2: (() => T2) | T2,
): TReturnType {
  const proxyMetadata = {
    _proxyName: 'MergeResult',
    get _mergedObjects() {
      return [target1, target2];
    },
  };

  function hasOwnProperty(propName: string) {
    const obj = getObject(propName);
    return obj && propName in obj;
  }

  function getObject(propName: string) {
    if (target2['_proxyName'] === 'MergeResult' && propName in target2) {
      return target2;
    } else if (typeof target2 === 'function') {
      const obj2 = (target2 as Function)();
      if (propName in obj2) return obj2;
    }

    if (target1['_proxyName'] === 'MergeResult' && propName in target1) {
      return target1;
    } else if (typeof target1 === 'function') {
      const obj1 = (target1 as Function)();
      if (propName in obj1) return obj1;
    }
  }

  return (new Proxy(proxyMetadata, {
    get(t, propName: string) {
      if (propName === 'hasOwnProperty') return hasOwnProperty;
      if (propName in proxyMetadata) return proxyMetadata[propName];
      const obj = getObject(propName);
      if (obj) return obj[propName];
    },

    has(oTarget, propName: string) {
      return hasOwnProperty(propName);
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
export type TMerge4<T1, T2, T3, T4> = TMerge<TMerge3<T1, T2, T3>, T4>;
