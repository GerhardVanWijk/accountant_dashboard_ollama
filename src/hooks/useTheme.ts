import { useThemeStore } from '@/stores/themeStore';

/**
 * Convenience accessor for components (e.g. the theme toggle) so they
 * don't need to know about the Zustand store shape directly.
 */
export function useTheme() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  return { theme, setTheme };
}
