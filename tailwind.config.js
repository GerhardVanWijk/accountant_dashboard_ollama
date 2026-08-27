/**
 * Tailwind config wired to the CSS custom properties defined in
 * src/styles/tokens.css. Light values live on :root (default theme,
 * per docs/DESIGN_SYSTEM.md § Theme); dark values are overridden under
 * [data-theme="dark"].
 *
 * See docs/DESIGN_SYSTEM.md for the source values.
 */
import tailwindcssAnimate from 'tailwindcss-animate';

export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: {
      xs: '320px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        background: 'var(--color-background)',
        panel: 'var(--color-panel)',
        border: 'var(--color-border)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        info: 'var(--color-info)',
        'on-accent': 'var(--color-text-on-accent)',
        /* Financial UI Patterns - Semantic tokens for prices, P&L, signals */
        positive: 'rgb(var(--color-positive) / <alpha-value>)',
        negative: 'rgb(var(--color-negative) / <alpha-value>)',
        'warning-financial': 'rgb(var(--color-warning-financial) / <alpha-value>)',
        'info-financial': 'rgb(var(--color-info-financial) / <alpha-value>)',

        /* v0 design-system tokens (Phase M0). background/border/primary/
           secondary are NOT redefined here on purpose — those four already
           exist above and are scoped to .app-shell via tokens.css instead,
           so 200+ existing files keep their current colors untouched. See
           tokens.css's "v0 design-system tokens" comment for the full
           reasoning. Everything below is new/non-colliding and used
           unprefixed, matching v0 and shadcn's own naming exactly. */
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        'card-foreground': 'var(--card-foreground)',
        popover: 'var(--popover)',
        'popover-foreground': 'var(--popover-foreground)',
        'primary-foreground': 'var(--primary-foreground)',
        'secondary-foreground': 'var(--secondary-foreground)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        accent: 'var(--accent)',
        'accent-foreground': 'var(--accent-foreground)',
        destructive: 'var(--destructive)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        sidebar: 'var(--sidebar)',
        'sidebar-foreground': 'var(--sidebar-foreground)',
        'sidebar-primary': 'var(--sidebar-primary)',
        'sidebar-primary-foreground': 'var(--sidebar-primary-foreground)',
        'sidebar-accent': 'var(--sidebar-accent)',
        'sidebar-accent-foreground': 'var(--sidebar-accent-foreground)',
        'sidebar-border': 'var(--sidebar-border)',
        'sidebar-ring': 'var(--sidebar-ring)',
        'chart-1': 'var(--chart-1)',
        'chart-2': 'var(--chart-2)',
        'chart-3': 'var(--chart-3)',
        'chart-4': 'var(--chart-4)',
        'chart-5': 'var(--chart-5)',
        brand: 'var(--brand)',
        'brand-foreground': 'var(--brand-foreground)',
        'brand-muted': 'var(--brand-muted)',

        /* v0's general-status colors (badges/notifications) — namespaced
           status-* because bare positive/negative/warning/info above are
           already this app's financial P&L number-coloring system (a
           different value format: RGB triplets, not oklch). Renamed at the
           handful of call sites that used them during the port, not
           overloaded onto the existing keys. */
        'status-positive': 'var(--positive)',
        'status-negative': 'var(--negative)',
        'status-warning': 'var(--warning)',
        'status-info': 'var(--info)',

        /* Pre-baked status alpha tokens — see tokens.css for why bare
           status-{name}/NN opacity modifiers never compiled under Tailwind v3.
           No <alpha-value> here on purpose: the alpha is already baked into
           the CSS custom property, so `/NN` must never be appended to these
           utilities (it would be silently ignored). */
        'status-positive-muted': 'var(--positive-muted)',
        'status-negative-muted': 'var(--negative-muted)',
        'status-warning-muted': 'var(--warning-muted)',
        'status-info-muted': 'var(--info-muted)',
        'status-positive-surface': 'var(--positive-surface)',
        'status-negative-surface': 'var(--negative-surface)',
        'status-warning-surface': 'var(--warning-surface)',
        'status-info-surface': 'var(--info-surface)',
        'status-positive-outline': 'var(--positive-outline)',
        'status-negative-outline': 'var(--negative-outline)',
        'status-warning-outline': 'var(--warning-outline)',
        'status-info-outline': 'var(--info-outline)',
      },
      /* v0 design-system tokens (Phase M0, typography fix — see
         V0_VISUAL_FIDELITY.md). v0 sets `--font-sans: var(--font-geist-sans),
         ui-sans-serif, system-ui, sans-serif` via next/font/google; this app
         has no next/font equivalent, so Geist + Geist Mono are loaded from
         Google Fonts instead (index.html) and referenced by family name here.
         Old system-font stack kept as the fallback chain, matching v0's own
         fallback order. */
      fontFamily: {
        sans: [
          'Geist',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          '"Geist Mono"',
          'ui-monospace',
          'monospace',
        ],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      fontWeight: {
        light: '300',
        regular: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      spacing: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        '2xl': '3rem',
        '3xl': '4rem',
      },
      /* v0 design-system tokens (Phase M0, radius fix — see
         V0_VISUAL_FIDELITY.md). v0's Tailwind v4 `@theme inline` block
         generates rounded-sm/md/lg/xl/2xl/3xl/4xl straight off the
         --radius-* custom properties already defined in tokens.css. Tailwind
         v3 needs that link spelled out explicitly — it was missing here
         entirely for 2xl/3xl/4xl (so v0's `rounded-4xl` — the shadcn Badge's
         pill shape — compiled to no radius at all, since v3's core scale has
         no 4xl key) and hardcoded to different fixed values for sm/md/lg/xl
         (off by up to 2px from the token). DEFAULT (bare `rounded`) is left
         at Tailwind's own default, matching v0: its @theme block never
         overrides that key either. */
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: '0.25rem',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        '3xl': 'var(--radius-3xl)',
        '4xl': 'var(--radius-4xl)',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
        DEFAULT: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
        md: '0 4px 6px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.04)',
        lg: '0 10px 15px rgba(0, 0, 0, 0.06), 0 4px 6px rgba(0, 0, 0, 0.03)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
