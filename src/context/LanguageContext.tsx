import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import i18n from '../i18n';

export type AppLanguage = 'en' | 'pt';

const LANGUAGE_STORAGE_KEY = '@ernit_language';

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>('en');

  // Load persisted language on mount
  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_STORAGE_KEY).then(stored => {
      if (stored === 'en' || stored === 'pt') {
        setLanguageState(stored);
        i18n.changeLanguage(stored);
      } else {
        // No stored preference — detect device locale
        try {
          const locales = Localization.getLocales();
          const deviceLang = locales[0]?.languageTag || '';
          if (deviceLang.startsWith('pt')) {
            setLanguageState('pt');
            i18n.changeLanguage('pt');
          }
        } catch {
          // Fallback to English
        }
      }
    }).catch(() => {});
  }, []);

  const setLanguage = useCallback((lang: AppLanguage) => {
    setLanguageState(lang);
    i18n.changeLanguage(lang);
    AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang).catch(() => {});
  }, []);

  const value = useMemo(() => ({
    language, setLanguage,
  }), [language, setLanguage]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

/**
 * Sync hook: call inside any component that has access to the authenticated user's
 * profile (e.g. AppNavigator). Automatically switches the app language whenever the
 * user's stored preferredLanguage changes, without requiring LanguageProvider to
 * depend on AppContext (which would create a circular dependency since LanguageProvider
 * wraps AppProvider in App.tsx).
 */
export const useLanguageSync = (preferredLanguage?: 'en' | 'pt'): void => {
  const { language, setLanguage } = useLanguage();
  useEffect(() => {
    if (preferredLanguage && preferredLanguage !== language) {
      setLanguage(preferredLanguage);
    }
  }, [preferredLanguage]); // eslint-disable-line react-hooks/exhaustive-deps
};
