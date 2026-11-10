import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { Alert, I18nManager, Platform } from 'react-native';
import {
  resolveLocalePreference,
  translate,
  type DeviceLocale,
  type LanguagePreference,
  type SupportedLocale,
} from './index';
import { useQuranLibrary } from '@/features/quran/state/QuranLibraryProvider';

type LocalizationContextValue = {
  locale: SupportedLocale;
  languagePreference: LanguagePreference;
  isRTL: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
  setLanguage: (preference: LanguagePreference) => Promise<void>;
};

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

export function LocalizationProvider({
  locales,
  children,
}: React.PropsWithChildren<{ locales: readonly DeviceLocale[] }>) {
  const { settings, updateSettings } = useQuranLibrary();
  const preference: LanguagePreference = settings.language === 'system'
    ? 'system'
    : (['en', 'de', 'es', 'gl', 'it', 'nl', 'ru', 'tr', 'vi', 'zh_Hans', 'om', 'am', 'ar'].includes(settings.language)
      ? settings.language as LanguagePreference
      : 'system');
  const locale = resolveLocalePreference(preference, locales);
  const isRTL = locale === 'ar';

  const t = useCallback((key: string, values?: Record<string, string | number>) => (
    translate(locale, key, values)
  ), [locale]);

  const setLanguage = useCallback(async (nextPreference: LanguagePreference) => {
    const nextLocale = resolveLocalePreference(nextPreference, locales);
    const nextRTL = nextLocale === 'ar';
    const directionNeedsRestart = Platform.OS !== 'web' && I18nManager.isRTL !== nextRTL;

    if (Platform.OS !== 'web') {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(nextRTL);
    }

    await updateSettings({ language: nextPreference });

    if (directionNeedsRestart) {
      Alert.alert(
        translate(nextLocale, 'language_direction_restart_title'),
        translate(nextLocale, 'language_direction_restart_message'),
      );
    }
  }, [locales, updateSettings]);

  const value = useMemo<LocalizationContextValue>(() => ({
    locale,
    languagePreference: preference,
    isRTL,
    t,
    setLanguage,
  }), [locale, preference, isRTL, t, setLanguage]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization(): LocalizationContextValue {
  const context = useContext(LocalizationContext);
  if (!context) throw new Error('useLocalization must be used inside LocalizationProvider');
  return context;
}
