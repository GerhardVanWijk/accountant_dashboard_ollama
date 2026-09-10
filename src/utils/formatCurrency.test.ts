import { describe, it, expect } from 'vitest';
import { formatCurrency } from './formatCurrency';

/** Normalise every kind of Unicode space (en-ZA uses NBSP / narrow NBSP) to a plain space. */
const norm = (s: string) => s.replace(/\s/g, ' ');

describe('formatCurrency', () => {
  it('renders a rand amount with the "R" symbol and SA grouping — not the "ZAR" ISO prefix', () => {
    const out = formatCurrency(21107.1, 'ZAR');
    expect(out).toContain('R');
    expect(out).not.toContain('ZAR');
    expect(norm(out)).toBe('R 21 107,10');
  });

  it('formats zero and negative rand amounts', () => {
    expect(norm(formatCurrency(0, 'ZAR'))).toBe('R 0,00');
    expect(norm(formatCurrency(-1234.5, 'ZAR'))).toContain('1 234,50');
    expect(formatCurrency(-1234.5, 'ZAR')).toContain('-');
  });

  it('large amounts keep two decimals and never wrap the ISO code back in', () => {
    expect(norm(formatCurrency(1574853.75, 'ZAR'))).toBe('R 1 574 853,75');
    expect(formatCurrency(1574853.75, 'ZAR')).not.toContain('ZAR');
  });

  it('a genuinely foreign amount still shows its own currency symbol so the currency stays identified', () => {
    expect(formatCurrency(1234.5, 'USD')).toMatch(/\$/);
    expect(formatCurrency(1234.5, 'EUR')).toContain('€');
  });

  it('honours an explicit locale override', () => {
    expect(norm(formatCurrency(1000, 'ZAR', 'en-US'))).toBe('ZAR 1,000.00');
  });
});
