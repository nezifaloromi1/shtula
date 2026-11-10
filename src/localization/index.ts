import en from './catalogs/en.json';
import de from './catalogs/de.json';
import es from './catalogs/es.json';
import gl from './catalogs/gl.json';
import it from './catalogs/it.json';
import nl from './catalogs/nl.json';
import ru from './catalogs/ru.json';
import tr from './catalogs/tr.json';
import vi from './catalogs/vi.json';
import zhHans from './catalogs/zh_Hans.json';
import om from './catalogs/om.json';
import am from './catalogs/am.json';
import ar from './catalogs/ar.json';

type Catalog = Record<string, string>;
export const supportedLocales = [
  'en', 'de', 'es', 'gl', 'it', 'nl', 'ru', 'tr', 'vi', 'zh_Hans', 'om', 'am', 'ar',
] as const;
export type SupportedLocale = (typeof supportedLocales)[number];
export type LanguagePreference = 'system' | SupportedLocale;

export const languageOptions: ReadonlyArray<{ value: LanguagePreference; nativeName: string }> = [
  { value: 'system', nativeName: 'System default' },
  { value: 'en', nativeName: 'English' },
  { value: 'om', nativeName: 'Afaan Oromoo' },
  { value: 'am', nativeName: 'አማርኛ' },
  { value: 'ar', nativeName: 'العربية' },
  { value: 'de', nativeName: 'Deutsch' },
  { value: 'es', nativeName: 'Español' },
  { value: 'gl', nativeName: 'Galego' },
  { value: 'it', nativeName: 'Italiano' },
  { value: 'nl', nativeName: 'Nederlands' },
  { value: 'ru', nativeName: 'Русский' },
  { value: 'tr', nativeName: 'Türkçe' },
  { value: 'vi', nativeName: 'Tiếng Việt' },
  { value: 'zh_Hans', nativeName: '简体中文' },
];

const catalogs: Record<SupportedLocale, Catalog> = {
  en, de, es, gl, it, nl, ru, tr, vi, zh_Hans, om, am, ar,
};

export type DeviceLocale = {
  languageCode?: string | null;
  languageScriptCode?: string | null;
  textDirection?: 'ltr' | 'rtl' | null;
};

export function isSupportedLocale(value: string): value is SupportedLocale {
  return supportedLocales.includes(value as SupportedLocale);
}

export function resolveSupportedLocale(locales: readonly DeviceLocale[]): SupportedLocale {
  for (const locale of locales) {
    const language = locale.languageCode?.toLowerCase();
    if (!language) continue;
    if (language === 'zh') return 'zh_Hans';
    if (isSupportedLocale(language)) return language;
  }
  return 'en';
}

export function resolveLocalePreference(
  preference: string,
  locales: readonly DeviceLocale[],
): SupportedLocale {
  return preference !== 'system' && isSupportedLocale(preference)
    ? preference
    : resolveSupportedLocale(locales);
}

export function translate(
  locale: SupportedLocale,
  key: string,
  values: Record<string, string | number> = {},
): string {
  const template = catalogs[locale][key] ?? en[key] ?? key;
  return template.replace(/\{([a-zA-Z][\w]*)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

export function getAvailableTranslationCount(locale: SupportedLocale): number {
  return Object.keys(catalogs[locale]).length;
}
