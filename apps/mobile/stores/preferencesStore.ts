import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'dark' | 'light';
export type LibrarySortOrder = 'last_played' | 'alpha_asc' | 'alpha_desc' | 'pct_desc' | 'pct_asc';

interface PreferencesState {
  theme: ThemePreference;
  onboardingCompleted: boolean;
  librarySortOrder: LibrarySortOrder;
  consentResolved: boolean;
  setTheme: (theme: ThemePreference) => void;
  completeOnboarding: () => void;
  setLibrarySortOrder: (order: LibrarySortOrder) => void;
  setConsentResolved: (value: boolean) => void;
  loadPreferences: () => Promise<void>;
}

const STORAGE_KEY = '@unlockhub_preferences';

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** Persiste el snapshot actual del store en AsyncStorage con debounce de 100ms para evitar escrituras redundantes en cambios rápidos. */
function persistCurrent(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const s = usePreferencesStore.getState();
    void AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        theme: s.theme,
        onboardingCompleted: s.onboardingCompleted,
        librarySortOrder: s.librarySortOrder,
      }),
    );
  }, 100);
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  theme: 'dark',
  onboardingCompleted: false,
  librarySortOrder: 'last_played',
  consentResolved: false,

  setConsentResolved: (value) => {
    set({ consentResolved: value });
  },

  setTheme: (theme) => {
    set({ theme });
    persistCurrent();
  },

  completeOnboarding: () => {
    set({ onboardingCompleted: true });
    persistCurrent();
  },

  setLibrarySortOrder: (librarySortOrder) => {
    set({ librarySortOrder });
    persistCurrent();
  },

  loadPreferences: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PreferencesState>;
        if (parsed.theme === 'dark' || parsed.theme === 'light') {
          set({ theme: parsed.theme });
        }
        if (parsed.onboardingCompleted === true) {
          set({ onboardingCompleted: true });
        }
        if (parsed.librarySortOrder) {
          set({ librarySortOrder: parsed.librarySortOrder });
        }
      }
    } catch {
      // Si falla la lectura, se mantiene el valor por defecto
    }
  },
}));
