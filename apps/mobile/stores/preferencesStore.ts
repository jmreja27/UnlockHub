import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'dark' | 'system';

interface PreferencesState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  loadPreferences: () => Promise<void>;
}

const STORAGE_KEY = '@unlockhub_preferences';

export const usePreferencesStore = create<PreferencesState>((set) => ({
  theme: 'dark',

  setTheme: (theme) => {
    set({ theme });
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ theme }));
  },

  loadPreferences: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PreferencesState>;
        if (parsed.theme === 'dark' || parsed.theme === 'system') {
          set({ theme: parsed.theme });
        }
      }
    } catch {
      // Si falla la lectura, se mantiene el valor por defecto
    }
  },
}));
