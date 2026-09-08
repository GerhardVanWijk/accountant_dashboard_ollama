import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard for the 2026-09-08 light-mode softening (docs/LIGHT_MODE.md).
 *
 * The authenticated app renders inside `.app-shell`, which remaps
 * --color-background/-border onto the v0 --background/--border tokens, so
 * the LIGHT values of the v0 `:root` block are what calm the whole product.
 * These assertions lock in the intent:
 *   - the light canvas is no longer pure white
 *   - light card stays white (elevation comes from the canvas contrast)
 *   - light foreground is charcoal-navy, not near-black
 *   - the [data-theme="dark"] block is UNCHANGED (dark mode must stay stable)
 */

const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

/** The v0 `:root { … }` block that holds --background/--card/--foreground/etc. */
function v0RootBlock(): string {
  // the second `:root {` in the file (the first is the legacy --color-* block)
  const first = css.indexOf(':root {');
  const second = css.indexOf(':root {', first + 1);
  return css.slice(second, css.indexOf('}', second));
}

/** The `[data-theme='dark'] { … }` block that sets --background: oklch(0.145 0 0) etc. */
function darkBlock(): string {
  const marker = "[data-theme='dark'] {\n  --background: oklch(0.145 0 0)";
  const start = css.indexOf(marker);
  return css.slice(start, css.indexOf('}', start));
}

describe('light-mode tokens', () => {
  const root = v0RootBlock();

  it('the light canvas is a soft off-white, not pure white', () => {
    const bg = root.match(/--background:\s*([^;]+);/)?.[1].trim();
    expect(bg).toBeDefined();
    expect(bg).not.toBe('oklch(1 0 0)');
    // still very light — lightness in the high 0.9s
    const l = Number(bg!.match(/oklch\(([\d.]+)/)?.[1]);
    expect(l).toBeGreaterThan(0.95);
    expect(l).toBeLessThan(0.99);
  });

  it('the light card stays white so it reads as elevated against the canvas', () => {
    expect(root).toMatch(/--card:\s*oklch\(1 0 0\);/);
    expect(root).toMatch(/--popover:\s*oklch\(1 0 0\);/);
  });

  it('light foreground is charcoal-navy, not near-black', () => {
    const fg = root.match(/--foreground:\s*([^;]+);/)?.[1].trim();
    expect(fg).not.toBe('oklch(0.145 0 0)');
    const l = Number(fg!.match(/oklch\(([\d.]+)/)?.[1]);
    expect(l).toBeGreaterThan(0.18);
    expect(l).toBeLessThan(0.32);
  });

  it('light muted / border sit between the canvas and the card, and carry a faint cool tint', () => {
    for (const name of ['--muted', '--secondary', '--accent', '--border', '--input']) {
      const v = root.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim() ?? '';
      // oklch(L C H) with a non-zero chroma — a cool neutral, not flat gray
      const parts = v.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/);
      expect(parts, `${name} = ${v}`).toBeTruthy();
      expect(Number(parts![2]), `${name} chroma`).toBeGreaterThan(0);
    }
  });
});

describe('dark-mode tokens are untouched by the light-mode softening', () => {
  const dark = darkBlock();

  it('keeps the original v0 dark values', () => {
    expect(dark).toMatch(/--background:\s*oklch\(0\.145 0 0\);/);
    expect(dark).toMatch(/--foreground:\s*oklch\(0\.985 0 0\);/);
    expect(dark).toMatch(/--card:\s*oklch\(0\.205 0 0\);/);
    expect(dark).toMatch(/--muted:\s*oklch\(0\.269 0 0\);/);
    expect(dark).toMatch(/--border:\s*oklch\(1 0 0 \/ 10%\);/);
    expect(dark).toMatch(/--input:\s*oklch\(1 0 0 \/ 15%\);/);
  });
});
