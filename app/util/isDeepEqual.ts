import isPlainObject from 'lodash/isPlainObject';

/**
 * Compare 2 object with limited depth
 */
export function isDeepEqual(obj1: any, obj2: any, currentDepth: number, maxDepth: number): boolean {
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
 * consider isSimilar as isDeepEqual with depth 2
 */
export function isSimilar(obj1: any, obj2: any) {
  return isDeepEqual(obj1, obj2, 0, 2);
}

/**
 * Shallow comparison of 2 arrays
 */
function isArrayEqual(a: any[], b: any[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
