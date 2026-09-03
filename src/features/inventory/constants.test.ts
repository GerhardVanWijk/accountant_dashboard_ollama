import { describe, it, expect } from 'vitest';
import type { TaxRate } from '@/types';
import { getTaxRateLabel } from './constants';

const rate = (o: Partial<TaxRate>): TaxRate => ({ id: 'r', code: 'STD', name: 'Standard Rate 15%', rate: 15, ...o }) as TaxRate;

describe('getTaxRateLabel', () => {
  const rates = [rate({ id: 'std', name: 'Standard Rate 15%', rate: 15 }), rate({ id: 'zero', name: 'Zero-Rated', rate: 0 })];

  it('resolves a known id to "<name> — <rate>%"', () => {
    expect(getTaxRateLabel('std', rates)).toBe('Standard Rate 15% — 15%');
    expect(getTaxRateLabel('zero', rates)).toBe('Zero-Rated — 0%');
  });

  it('returns "No tax rate" when there is no id at all', () => {
    expect(getTaxRateLabel(undefined, rates)).toBe('No tax rate');
    expect(getTaxRateLabel('', rates)).toBe('No tax rate');
  });

  it('returns a pending placeholder (never "Unknown tax rate") when the list is empty', () => {
    expect(getTaxRateLabel('std', [])).toBe('…');
  });

  it('returns a pending placeholder for an as-yet-unresolved id while the list is still loading', () => {
    expect(getTaxRateLabel('not-loaded-yet', rates, { pending: true })).toBe('…');
  });

  it('still resolves an id that IS in the list even if a refresh is pending', () => {
    expect(getTaxRateLabel('std', rates, { pending: true })).toBe('Standard Rate 15% — 15%');
  });

  it('returns "Unknown tax rate" only when a loaded, non-empty list genuinely has no match', () => {
    expect(getTaxRateLabel('does-not-exist', rates)).toBe('Unknown tax rate');
  });

  it('never returns the raw id', () => {
    expect(getTaxRateLabel('does-not-exist', rates)).not.toContain('does-not-exist');
  });
});
