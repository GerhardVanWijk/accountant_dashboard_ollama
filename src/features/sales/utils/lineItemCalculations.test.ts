import { describe, it, expect } from 'vitest';
import type { TaxRate } from '@/types';
import { computeLine } from './lineItemCalculations';

function makeTaxRate(overrides: Partial<TaxRate> = {}): TaxRate {
  return {
    id: 'tax_vat15',
    code: 'STD',
    name: 'VAT 15%',
    treatment: 'standard_rated',
    rate: 15,
    appliesTo: 'both',
    effectiveFrom: '2023-01-01T00:00:00.000Z',
    jurisdiction: 'ZA',
    sourceReference: 'SARS VAT Act',
    isActive: true,
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeLine', () => {
  it('computes lineTotal as quantity times unit price', () => {
    const { lineTotal } = computeLine(3, 100, undefined, []);
    expect(lineTotal).toBe(300);
  });

  it('computes taxAmount from the matching tax rate', () => {
    const rates = [makeTaxRate()];
    const { lineTotal, taxAmount } = computeLine(2, 50, 'tax_vat15', rates);
    expect(lineTotal).toBe(100);
    expect(taxAmount).toBeCloseTo(15, 5);
  });

  it('returns zero tax when no taxRateId is given', () => {
    const { taxAmount } = computeLine(2, 50, undefined, [makeTaxRate()]);
    expect(taxAmount).toBe(0);
  });

  it('returns zero tax when the taxRateId does not match any rate passed in', () => {
    const { taxAmount } = computeLine(2, 50, 'tax_unknown', [makeTaxRate()]);
    expect(taxAmount).toBe(0);
  });
});
