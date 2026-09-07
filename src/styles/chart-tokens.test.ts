import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Regression lock for dashboard-dataviz-hardening (2026-09-07).
 *
 * The v0 port left `--chart-1..5` defined three times in tokens.css:
 * a greyscale set on `:root`, a colour set on `[data-theme='dark'], .app-shell`,
 * and a greyscale set on `[data-theme='dark']` that came LAST and silently
 * reverted every chart to five near-identical greys in dark mode. This test
 * fails if a neutral/greyscale chart palette ever comes back, or if the light
 * and dark palettes stop being genuinely different colours.
 */
const tokensCss = readFileSync(join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf8');

function chartAssignments(): string[] {
  return [...tokensCss.matchAll(/--chart-[1-5]\s*:\s*([^;]+);/g)].map((match) =>
    match[1].trim().toLowerCase(),
  );
}

describe('chart series tokens', () => {
  it('defines each of --chart-1..5 exactly twice (one light step, one dark step)', () => {
    for (let i = 1; i <= 5; i += 1) {
      const count = [...tokensCss.matchAll(new RegExp(`--chart-${i}\\s*:`, 'g'))].length;
      expect(count, `--chart-${i} assignment count`).toBe(2);
    }
    expect(tokensCss).toMatch(/\[data-theme='dark'\]\s*\{/);
  });

  it('never assigns a greyscale / zero-chroma chart colour (the dark-mode bug)', () => {
    for (const value of chartAssignments()) {
      // oklch(L 0 0) / oklch(L 0 <h>) with a zero chroma reads as grey.
      expect(value, value).not.toMatch(/oklch\([^)]*\s0\s+\d/);
      // pure hex greys (#rrggbb where r === g === b)
      const hex = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
      if (hex) {
        expect(new Set([hex[1], hex[2], hex[3]]).size, `${value} is grey`).toBeGreaterThan(1);
      }
    }
  });

  it('gives light and dark their own distinct chart steps (not one shared set)', () => {
    const all = chartAssignments();
    // 5 light + 5 dark assignments; each pair should differ.
    expect(all.length).toBe(10);
    for (let i = 0; i < 5; i += 1) {
      expect(all[i], `--chart-${i + 1}`).not.toBe(all[i + 5]);
    }
  });

  it('exposes semantic P&L series tokens tied to the financial palette', () => {
    expect(tokensCss).toMatch(/--series-positive\s*:\s*rgb\(var\(--color-positive\)\)/);
    expect(tokensCss).toMatch(/--series-negative\s*:\s*rgb\(var\(--color-negative\)\)/);
  });
});
