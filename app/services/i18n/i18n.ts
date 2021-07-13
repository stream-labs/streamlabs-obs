import electron from 'electron';
import VueI18n from 'vue-i18n';
import { PersistentStatefulService } from '../core/persistent-stateful-service';
import { mutation } from 'services/core/stateful-service';
import { Inject } from '../core/injector';
import { FileManagerService } from 'services/file-manager';
import { IObsListInput, TObsFormData } from 'components/obs/inputs/ObsInput';
import { I18nServiceApi } from './i18n-api';
import * as obs from '../../../obs-api';
import * as fs from 'fs';
import path from 'path';
import Utils from '../utils';
import fallback from '../../i18n/fallback';

interface II18nState {
  locale: string;
}

/**
 * get localized string from dictionary
 * throw an error if string is not in the dictionary
 */
export function $t(...args: any[]): string {
  const vueI18nInstance = I18nService.vueI18nInstance;
  return vueI18nInstance.t.call(I18nService.vueI18nInstance, ...args);
}

/**
 * get localized string from dictionary if exists
 * returns a keypath if localized version of string doesn't exist
 */
export function $translateIfExist(str: string): string {
  // TODO: Call into worker window instead
  // const vueI18nInstance = I18nService.vueI18nInstance;
  // if (vueI18nInstance.te(str)) return $t(str);
  return str;
}

/**
 * Crowding and Electron use different standards for locale name
 * Do some mapping in LANG_CODE_MAP based on docs:
 * @see https://electronjs.org/docs/api/locales
 */
const LANG_CODE_MAP: Dictionary<{ lang: string; locale: string }> = {
  cs: { lang: 'Czech', locale: 'cs-CZ' },
  de: { lang: 'German', locale: 'de-DE' },
  'en-US': { lang: 'English', locale: 'en-US' },
  es: { lang: 'Spanish', locale: 'es-ES' },
  fr: { lang: 'French', locale: 'fr-FR' },
  it: { lang: 'Italian', locale: 'it-IT' },
  ja: { lang: 'Japanese', locale: 'ja-JP' },
  ko: { lang: 'Korean', locale: 'ko-KR' },
  pl: { lang: 'Polish', locale: 'pl-PL' },
  pt: { lang: 'Portuguese', locale: 'pt-PT' },
  'pt-BR': { lang: 'Portuguese (Brazil)', locale: 'pt-BR' },
  ru: { lang: 'Russian', locale: 'ru-RU' },
  sk: { lang: 'Slovak', locale: 'sk-SK' },
  th: { lang: 'Thai', locale: 'th-TH' },
  tr: { lang: 'Turkish', locale: 'tr-TR' },
  'zh-CN': { lang: 'Chinese (Simplified)', locale: 'zh-CN' },
};

export const WHITE_LIST = [
  'en-US',
  'ru-RU',
  'zh-TW',
  'da-DK',
  'de-DE',
  'hu-HU',
  'it-IT',
  'ja-JP',
  'ko-KR',
  'pl-PL',
  'pt-PT',
  'pt-BR',
  'es-ES',
  'fr-FR',
  'tr-TR',
];

export class I18nService extends PersistentStatefulService<II18nState> implements I18nServiceApi {
  static defaultState: II18nState = {
    locale: '',
  };

  static vueI18nInstance: VueI18n;

  static setVuei18nInstance(instance: VueI18n) {
    I18nService.vueI18nInstance = instance;
  }

  static setBrowserViewLocale(view: Electron.BrowserView) {
    if (!view) return;

    // use a static method here because it allows to accept unserializable arguments like browserview from other windows
    const i18nService = I18nService.instance as I18nService; // TODO: replace with getResource('I18nService')
    const locale = i18nService.state.locale;
    view.webContents.on('dom-ready', () => {
      view.webContents.executeJavaScript(`
        var langCode = $.cookie('langCode');
        if (langCode !== '${locale}') {
           $.cookie('langCode', '${locale}');
           window.location.reload();
        }
      `);
    });
  }

  /**
   * Upload translations from the state to the vueI18nInstance
   */
  static async uploadTranslationsToVueI18n(async = false) {
    const vueI18nInstance = I18nService.vueI18nInstance;
    const i18nService: I18nService = I18nService.instance;
    const dictionaries = async
      ? await i18nService.actions.return.getLoadedDictionaries()
      : i18nService.getLoadedDictionaries();

    Object.keys(dictionaries).forEach(locale => {
      I18nService.vueI18nInstance.setLocaleMessage(locale, dictionaries[locale]);
    });

    vueI18nInstance.locale = i18nService.state.locale;
    vueI18nInstance.fallbackLocale = async
      ? await i18nService.actions.return.getFallbackLocale()
      : i18nService.getFallbackLocale();
  }

  private availableLocales: Dictionary<string> = {};
  private loadedDictionaries: Dictionary<Dictionary<string>> = {};
  private isLoaded = false;

  @Inject() fileManagerService: FileManagerService;

  load() {
    if (this.isLoaded) return;
    const i18nPath = this.getI18nPath();

    // load available locales
    const localeFiles = fs.readdirSync(i18nPath);

    for (const locale of localeFiles) {
      if (!this.localeIsSupported(locale)) continue;
      this.availableLocales[locale] = this.fileManagerService.read(
        `${i18nPath}/${locale}/langname.txt`,
      );
    }

    // if locale is not set than use electron's one
    let locale = this.state.locale;
    if (!locale) {
      const electronLocale = electron.remote.app.getLocale();
      const langDescription = LANG_CODE_MAP[electronLocale];
      locale = langDescription ? langDescription.locale : 'en-US';
    }

    // if electron has unsupported locale, don't allow to use it
    const fallbackLocale = this.getFallbackLocale();
    if (!this.localeIsSupported(locale)) locale = fallbackLocale;

    // load dictionary if not loaded
    if (!this.loadedDictionaries[locale]) {
      this.loadDictionary(locale);
    }

    // load fallback dictionary
    if (!this.loadedDictionaries[fallbackLocale]) {
      this.loadDictionary(fallbackLocale);
    }

    // setup locale in libobs
    obs.Global.locale = locale;

    this.SET_LOCALE(locale);

    I18nService.uploadTranslationsToVueI18n();
    this.isLoaded = true;
  }

  getFallbackLocale() {
    return 'en-US';
  }

  getLoadedDictionaries() {
    return this.loadedDictionaries;
  }

  setLocale(locale: string) {
    this.SET_LOCALE(locale);
    electron.remote.app.relaunch({ args: [] });
    electron.remote.app.quit();
  }

  getLocaleFormData(): TObsFormData {
    const options = Object.keys(this.availableLocales).map(locale => {
      return {
        value: locale,
        description: this.availableLocales[locale],
      };
    });

    return [
      <IObsListInput<string>>{
        options,
        type: 'OBS_PROPERTY_LIST',
        name: 'locale',
        description: $t('Language'),
        value: this.state.locale,
        enabled: true,
        visible: true,
      },
    ];
  }

  private getI18nPath() {
    return path.join(electron.remote.app.getAppPath(), 'app/i18n');
  }

  private loadDictionary(locale: string): Dictionary<string> {
    if (this.loadedDictionaries[locale]) return this.loadedDictionaries[locale];

    if (locale === 'en-US') {
      // en-US is included in the webpack bundle, so we don't
      // load it from disk on demand.
      this.loadedDictionaries['en-US'] = fallback;
      return fallback;
    }

    const i18nPath = this.getI18nPath();
    const dictionaryFiles = fs
      .readdirSync(`${i18nPath}/${locale}`)
      .filter(fileName => fileName.split('.')[1] === 'json');

    const dictionary: Dictionary<string> = {};

    for (const fileName of dictionaryFiles) {
      const filePath = `${i18nPath}/${locale}/${fileName}`;
      let json: Dictionary<string>;
      try {
        json = JSON.parse(this.fileManagerService.read(filePath));
      } catch (e: unknown) {
        throw new Error(`Invalid JSON in ${filePath}`);
      }
      Object.assign(dictionary, json);
    }

    this.loadedDictionaries[locale] = dictionary;
    return dictionary;
  }

  private localeIsSupported(locale: string) {
    return WHITE_LIST.includes(locale) && fs.existsSync(`${this.getI18nPath()}/${locale}`);
  }

  @mutation()
  private SET_LOCALE(locale: string) {
    this.state.locale = locale;
  }
}
