import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'dark' | 'light' | 'system';

interface ThemeState {
  /** The user's chosen preference — may be "system". */
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

/**
 * Single source of truth for theme preference. Persisted to localStorage
 * so the choice survives reloads. Consumed by src/app/providers.tsx
 * (ThemeProvider), which resolves "system" against the OS media query
 * and stamps the result onto <html data-theme="...">.
 *
 * Per docs/DO_NOT_BREAK.md, Zustand is the only state library — no
 * second store, no React Context holding this state.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'accounting-suite-theme' },
  ),
);
