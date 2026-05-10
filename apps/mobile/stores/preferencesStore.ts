import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'dark' | 'system';

interface PreferencesState {
  theme: ThemePreference;
  onboardingCompleted: boolean;
  setTheme: (theme: ThemePreference) => void;
  completeOnboarding: () => void;
  loadPreferences: () => Promise<void>;
}

const STORAGE_KEY = '@unlockhub_preferences';

export const usePreferencesStore = create<PreferencesState>((set) => ({
  theme: 'dark',
  onboardingCompleted: false,

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
      }
    } catch {
      // Si falla la lectura, se mantiene el valor por defecto
    }
  },
}));
