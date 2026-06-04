// Configuración de i18next con detección automática del idioma del dispositivo
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import es from './locales/es.json';
import en from './locales/en.json';

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v3', // Hermes no implementa Intl.PluralRules — evita el warning en Android
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: Localization.getLocales()[0]?.languageCode ?? 'en',
  fallbackLng: 'en',
  interpolation: {
    // React Native ya escapa los valores, no es necesario hacerlo en i18next
    escapeValue: false,
  },
});

export default i18n;
