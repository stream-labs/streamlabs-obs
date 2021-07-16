/// <reference path="../vendor/toasted.d.ts" />
/// <reference path="../vendor/urijs.d.ts" />

// all global interfaces here

declare const SLOBS_BUNDLE_ID: string;
declare const SLOBS_SENTRY_URL_BE_SERVER: string;
declare const SLOBS_SENTRY_URL_BE_CLIENT: string;
declare const SLOBS_SENTRY_URL_FE_DSN: string;

interface Dictionary<TItemType> {
  [key: string]: TItemType;
}

interface IRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface IScalableRectangle extends IRectangle {
  scaleX?: number;
  scaleY?: number;
  crop?: ICrop;
  rotation?: number;
}

declare type TPatch<TEntity> = { id: string } & Partial<TEntity>;

interface IVec2 {
  x: number;
  y: number;
}

interface ICrop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface IRGBColor {
  r: number;
  g: number;
  b: number;
}

type DeepPartial<T> = Partial<{ [P in keyof T]: DeepPartial<T[P]> }>;

/**
 * This is a much more typesafe type for json to return,
 * as it requires declaring its type before use.
 */
interface Response {
  json(): Promise<unknown>;
}

// list of modules without type definitions
declare module 'raven-js/*';
declare module 'v-tooltip';
declare module 'traverse';
declare module 'vue-multiselect';
declare module 'unzip-stream';
declare module 'node-fontinfo';
declare module 'uuid/*';
declare module 'rimraf';
declare module '@xkeshi/vue-qrcode';
declare module 'vue-color';
declare module 'vue-popperjs';
declare module 'vue-slider-component';
declare module 'vuedraggable';
declare module 'font-manager';
declare module 'vue-codemirror';
declare module 'recursive-readdir';
declare module 'vue-toasted';
declare module 'hyperform';
declare module 'emojione';
declare module 'vue-resize';
declare module 'serve-handler';
declare module 'v-selectpage';
declare module '*.m.less';
declare module '*.lazy.less';
declare module 'streamlabs-beaker';
declare module '*.vert';
declare module '*.frag';
declare module 'mark.js';
declare module 'vuejs-datepicker';
declare module 'vuejs-datepicker/dist/locale';
declare module 'color-picker';
declare module 'overlayscrollbars-vue';
declare module 'gl-transitions';

// React modules
declare module 'rc-animate';
declare module 'react-dom';

// uncomment to allow TS to import components without type definitions
// webpack still checks the module existence

// declare module '*';
