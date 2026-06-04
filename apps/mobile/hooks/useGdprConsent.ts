import { useEffect } from 'react';

// Carga dinámica para evitar crashes si el módulo nativo no está disponible
let AdsConsentModule: {
  requestInfoUpdate: () => Promise<{ isConsentFormAvailable: boolean; status: string }>;
  showForm: () => Promise<void>;
} | null = null;

let ConsentStatus: { REQUIRED: string } | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const admob = require('react-native-google-mobile-ads') as {
    AdsConsent: typeof AdsConsentModule;
    AdsConsentStatus: { REQUIRED: string };
  };
  AdsConsentModule = admob.AdsConsent;
  ConsentStatus = admob.AdsConsentStatus;
} catch {
  // Módulo no disponible — el hook no hace nada
}

export function useGdprConsent(): void {
  useEffect(() => {
    if (!AdsConsentModule || !ConsentStatus) return;

    async function requestConsent() {
      try {
        const info = await AdsConsentModule!.requestInfoUpdate();
        if (info.isConsentFormAvailable && info.status === ConsentStatus!.REQUIRED) {
          await AdsConsentModule!.showForm();
        }
      } catch {
        // No interrumpir la app si el formulario de consentimiento falla
      }
    }

    void requestConsent();
  }, []);
}
