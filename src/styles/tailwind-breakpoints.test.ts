import { describe, expect, it } from 'vitest';

// @ts-expect-error — plain JS config, no types; we only read theme.screens.
import tailwindConfig from '../../tailwind.config.js';

/**
 * Regression lock for P3A. `theme.screens` (not `theme.extend.screens`)
 * REPLACES Tailwind's default breakpoint set — and the Phase 0 scaffold's
 * scale left out `sm`, so all 188 `sm:*` utilities the v0 port brought in
 * compiled to nothing (summary grids / filter toolbars stayed 1-column at
 * every width). If `sm` disappears again, this fails before the CSS ships.
 */
describe('Tailwind breakpoint scale (P3A)', () => {
  const screens = (tailwindConfig as { theme: { screens: Record<string, string> } }).theme.screens;

  it('defines the sm breakpoint at 640px (Tailwind / v0 default)', () => {
    expect(screens.sm).toBe('640px');
  });

  it('keeps the full ascending scale', () => {
    expect(screens).toMatchObject({
      xs: '320px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    });
  });
});
