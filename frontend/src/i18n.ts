import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { I18n } from 'i18n-js';

import en from './locales/en';
import es from './locales/es';
import ptBR from './locales/pt-BR';

export type LanguageCode = 'en' | 'es' | 'pt-BR';

export const LANGUAGES: { code: LanguageCode; label: string; emoji: string }[] = [
  { code: 'en', label: 'English', emoji: '🇺🇸' },
  { code: 'es', label: 'Español', emoji: '🇪🇸' },
  { code: 'pt-BR', label: 'Português (BR)', emoji: '🇧🇷' },
];

const STORAGE_KEY = 'finflow_language';

// Single I18n instance shared across the app
export const i18n = new I18n({ en, es, 'pt-BR': ptBR });
i18n.enableFallback = true;
i18n.defaultLocale = 'en';
i18n.locale = 'en';

interface I18nContextValue {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => Promise<void>;
  t: (key: string, options?: Record<string, any>) => string;
  ready: boolean;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  setLanguage: async () => {},
  t: (k: string) => k,
  ready: false,
});

function detectDeviceLanguage(): LanguageCode {
  try {
    const locales = Localization.getLocales();
    const primary = locales?.[0];
    const tag = (primary?.languageTag || primary?.languageCode || 'en').toLowerCase();
    if (tag.startsWith('pt')) return 'pt-BR';
    if (tag.startsWith('es')) return 'es';
    return 'en';
  } catch {
    return 'en';
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = (await AsyncStorage.getItem(STORAGE_KEY)) as LanguageCode | null;
        const lang: LanguageCode = saved || detectDeviceLanguage();
        i18n.locale = lang;
        setLanguageState(lang);
      } catch {}
      setReady(true);
    })();
  }, []);

  const setLanguage = async (lang: LanguageCode) => {
    i18n.locale = lang;
    setLanguageState(lang);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, lang);
    } catch {}
  };

  const t = (key: string, options?: Record<string, any>) => i18n.t(key, options);

  return React.createElement(
    I18nContext.Provider,
    { value: { language, setLanguage, t, ready } },
    children
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export function useT() {
  return useI18n().t;
}
