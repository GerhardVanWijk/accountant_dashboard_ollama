import { useEffect, type ReactNode } from 'react';
import { useThemeStore } from '@/stores/themeStore';

function resolveTheme(preference: 'dark' | 'light' | 'system'): 'dark' | 'light' {
  if (preference !== 'system') return preference;
  // Light is the default surface (docs/DESIGN_SYSTEM.md § Theme); only
  // fall through to dark when the OS explicitly prefers it.
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Applies the resolved theme (dark/light/system) to <html data-theme="...">
 * so the CSS variables in src/styles/tokens.css swap over. Re-resolves
 * "system" whenever the OS preference changes while it's selected.
 */
function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      root.setAttribute('data-theme', resolveTheme(theme));
    };

    apply();

    if (theme !== 'system' || !window.matchMedia) return;

    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  return <>{children}</>;
}

/**
 * Root provider tree for the app. Cross-cutting providers (theme today;
 * future providers such as a query/cache client or toast host) are
 * composed here so App.tsx stays a thin shell.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
