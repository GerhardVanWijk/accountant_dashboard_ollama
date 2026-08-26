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
 * and stamps the result onto <html data-theme="...">, and by the
 * pre-hydration bootstrap script in index.html (which reads this same
 * localStorage key to avoid a flash of the wrong theme before React
 * mounts — keep that script's fallback logic in sync with this default).
 *
 * Dark is the default preference (product decision, see the "default to
 * dark mode" change). Anyone who explicitly picks a theme via Settings
 * keeps that choice, persisted under this store's key regardless of the
 * app's current default.
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
