import URI from 'urijs';
import isEqual from 'lodash/isEqual';
import electron from 'electron';
import cloneDeep from 'lodash/cloneDeep';

export const enum EBit {
  ZERO,
  ONE,
}

export interface IEnv {
  NODE_ENV: 'production' | 'development' | 'test';
  SLOBS_PREVIEW: boolean;
  SLOBS_IPC: boolean;
  SLOBS_USE_LOCAL_HOST: boolean;
  SLOBS_VERSION: string;
  SLOBS_TRACE_SYNC_IPC: boolean;
  CI: boolean;
}

export default class Utils {
  /**
   * cache env variables
   * since electron.remote.process takes to much time to fetch
   */
  static _env: IEnv;
  static get env() {
    if (!Utils._env) Utils._env = electron.remote.process.env as any;
    return Utils._env;
  }

  static applyProxy(target: Object, source: Object | Function) {
    // TODO: Figure out why this is happening
    if (!source) return;

    const sourceObj = typeof source === 'function' ? source() : source;

    Object.keys(sourceObj).forEach(propName => {
      Object.defineProperty(target, propName, {
        configurable: true,
        get() {
          return sourceObj[propName];
        },
      });
    });
  }

  static getCurrentUrlParams(): Dictionary<string> {
    return this.getUrlParams(window.location.href);
  }

  static getWindowId(): string {
    return this.getCurrentUrlParams().windowId;
  }

  static getUrlParams(url: string) {
    return URI.parseQuery(URI.parse(url).query) as Dictionary<string>;
  }

  static isWorkerWindow(): boolean {
    return this.getWindowId() === 'worker';
  }

  static isMainWindow(): boolean {
    return this.getWindowId() === 'main';
  }

  static isChildWindow(): boolean {
    return this.getWindowId() === 'child';
  }

  static isOneOffWindow(): boolean {
    return !['worker', 'main', 'child'].includes(this.getWindowId());
  }

  static getMainWindow(): Electron.BrowserWindow {
    return electron.remote.BrowserWindow.getAllWindows().find(
      win => Utils.getUrlParams(win.webContents.getURL()).windowId === 'main',
    );
  }

  static getChildWindow(): Electron.BrowserWindow {
    return electron.remote.BrowserWindow.getAllWindows().find(
      win => Utils.getUrlParams(win.webContents.getURL()).windowId === 'child',
    );
  }

  static isDevMode() {
    return Utils.env.NODE_ENV !== 'production';
  }

  static isTestMode() {
    return Utils.env.NODE_ENV === 'test';
  }

  static isPreview(): boolean {
    return Utils.env.SLOBS_PREVIEW as boolean;
  }

  static isIpc(): boolean {
    return Utils.env.SLOBS_IPC as boolean;
  }

  static shouldUseLocalHost(): boolean {
    return Utils.env.SLOBS_USE_LOCAL_HOST as boolean;
  }

  /**
   * create an acceptable color value for obs
   */
  static rgbaToInt(r: number, g: number, b: number, a: number): number {
    let value = r;
    value |= g << 8;
    value |= b << 16;
    value |= a << 24;

    return value;
  }

  /**
   * parse obs color tor RGBA
   */
  static intToRgba(value: number) {
    return {
      r: value & 0x000000ff,
      g: (value & 0x0000ff00) >>> 8,
      b: (value & 0x00ff0000) >>> 16,
      a: (value & 0xff000000) >>> 24,
    };
  }

  static numberToBinnaryArray(num: number, size: number): EBit[] {
    const result: EBit[] = [];
    // tslint:disable-next-line:no-parameter-reassignment TODO
    num = Math.round(num);

    // tslint:disable-next-line:no-parameter-reassignment TODO
    size = Math.round(size);

    // tslint:disable-next-line:no-parameter-reassignment TODO
    while (size--) {
      result.unshift(num & 1);
      // tslint:disable-next-line:no-parameter-reassignment TODO
      num = num >> 1;
    }
    return result;
  }

  static binnaryArrayToNumber(arr: EBit[]): number {
    let result = 0;
    let ind = arr.length;
    let pow = 0;
    while (ind--) {
      result += arr[ind] * (1 << pow);
      pow++;
    }
    return result;
  }

  static getChangedParams<T>(obj: T, patch: T): Partial<T> {
    const result: Dictionary<any> = {};
    Object.keys(patch).forEach(key => {
      if (!isEqual(obj[key], patch[key])) result[key] = cloneDeep(patch[key]);
    });
    return result as Partial<T>;
  }

  static getDeepChangedParams<T>(obj: T, patch: T): Partial<T> {
    const result: Dictionary<any> = {};

    if (obj == null) return patch;

    Object.keys(patch).forEach(key => {
      if (!isEqual(obj[key], patch[key])) {
        if (patch[key] && typeof patch[key] === 'object' && !Array.isArray(patch[key])) {
          result[key] = this.getDeepChangedParams(obj[key], patch[key]);
        } else {
          result[key] = patch[key];
        }
      }
    });
    return result as Partial<T>;
  }

  /**
   * @see https://www.typescriptlang.org/docs/handbook/mixins.html
   */
  static applyMixins(derivedCtor: any, baseCtors: any[]) {
    baseCtors.forEach(baseCtor => {
      Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
        const baseDescriptor = Object.getOwnPropertyDescriptor(baseCtor.prototype, name);
        const derivedDescriptor = Object.getOwnPropertyDescriptor(derivedCtor.prototype, name);
        // ignore getters
        if (
          (baseDescriptor && baseDescriptor.get) ||
          (derivedDescriptor && derivedDescriptor.get)
        ) {
          return;
        }

        // ignore the property already exist
        if (derivedCtor.prototype[name]) return;
        derivedCtor.prototype[name] = baseCtor.prototype[name];
      });
    });
  }

  /**
   * Measure time in ms between events and print in to the main process stdout
   * It's helpful for measuring the time between events in different windows
   */
  static measure(msg: string, timestamp?: number) {
    electron.ipcRenderer.send('measure-time', msg, timestamp || Date.now());
  }

  static copyToClipboard(str: string) {
    const el = document.createElement('textarea');
    el.value = str;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }

  static sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  static getReadableFileSizeString(fileSizeInBytes: number): string {
    let i = -1;
    const byteUnits = [' kB', ' MB', ' GB', ' TB', 'PB', 'EB', 'ZB', 'YB'];
    do {
      fileSizeInBytes = fileSizeInBytes / 1024;
      i++;
    } while (fileSizeInBytes > 1024);
    return Math.max(fileSizeInBytes, 0.1).toFixed(1) + byteUnits[i];
  }

  /**
   * Returns a type predicate that makes prop from TObj a required property.
   * This function is primarily meant to be used with `filter`
   * @param prop The property to make required
   * @example
   * a.filter(propertyExists('foo')).forEach(v => v.foo + 5);
   */
  static propertyExists<TObj, TProp extends keyof TObj>(prop: TProp) {
    return (obj: TObj): obj is Required<Pick<TObj, TProp>> & TObj => obj[prop] != null;
  }
}

/**
 * A typed version of Object.keys()
 * Original Object.keys always returns a string[] type
 * @see discussion here https://github.com/microsoft/TypeScript/pull/12253
 */
export function keys<T>(target: T) {
  return Object.keys(target) as (keyof T)[];
}

/**
 * A fallback-safe method of fetching images
 * from either our local storage or the CDN
 * @param path The path structure to retrieve the image from the media folders
 */
export function $i(path: string) {
  try {
    const localMediaPath = require(`../../media/${path}`);
    return localMediaPath;
  } catch (e: unknown) {
    return `https://slobs-cdn.streamlabs.com/media/${path}`;
  }
}
