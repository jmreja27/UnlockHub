// Hook para consultar y cambiar el idioma de la aplicación en tiempo de ejecución
import i18n from '../i18n';

type SupportedLanguage = 'es' | 'en';

export function useLanguage() {
  // Cambia el idioma de la app y persiste la selección vía i18next
  const changeLanguage = (lang: SupportedLanguage): void => {
    void i18n.changeLanguage(lang);
  };

  const currentLanguage = i18n.language as SupportedLanguage;

  return { currentLanguage, changeLanguage };
}
