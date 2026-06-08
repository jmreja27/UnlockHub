import { usePreferencesStore } from '../stores/preferencesStore';
import { darkColors, lightColors, type ThemeColors } from '../lib/colors';

export function useTheme(): ThemeColors {
  const theme = usePreferencesStore((s) => s.theme);
  return theme === 'light' ? lightColors : darkColors;
}
