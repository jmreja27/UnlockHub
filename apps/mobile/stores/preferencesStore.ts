import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'dark' | 'system';
export type LibrarySortOrder = 'last_played' | 'alpha_asc' | 'alpha_desc' | 'pct_desc' | 'pct_asc';

interface PreferencesState {
  theme: ThemePreference;
  onboardingCompleted: boolean;
  librarySortOrder: LibrarySortOrder;
  setTheme: (theme: ThemePreference) => void;
  completeOnboarding: () => void;
  setLibrarySortOrder: (order: LibrarySortOrder) => void;
  loadPreferences: () => Promise<void>;
}

const STORAGE_KEY = '@unlockhub_preferences';

export const usePreferencesStore = create<PreferencesState>((set) => ({
  theme: 'dark',
  onboardingCompleted: false,
  librarySortOrder: 'last_played',

  setTheme: (theme) => {
    set({ theme });
    void AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      const current = raw ? (JSON.parse(raw) as object) : {};
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, theme }));
    });
  },

  completeOnboarding: () => {
    set({ onboardingCompleted: true });
    void AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      const current = raw ? (JSON.parse(raw) as object) : {};
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, onboardingCompleted: true }));
    });
  },

  setLibrarySortOrder: (librarySortOrder) => {
    set({ librarySortOrder });
    void AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      const current = raw ? (JSON.parse(raw) as object) : {};
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, librarySortOrder }));
    });
  },

  loadPreferences: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PreferencesState>;
        if (parsed.theme === 'dark' || parsed.theme === 'system') {
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
