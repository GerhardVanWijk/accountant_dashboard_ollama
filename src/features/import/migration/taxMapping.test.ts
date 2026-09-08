import { describe, it, expect } from 'vitest';
import { suggestTaxMappings, restoreTaxMappingSelections } from './taxMapping';

const RATES = [
  { id: 'rate_std', code: 'STD', treatment: 'standard_rated', rate: 15 },
  { id: 'rate_zero', code: 'ZERO', treatment: 'zero_rated', rate: 0 },
  { id: 'rate_exempt', code: 'EXM', treatment: 'exempt', rate: 0 },
];

describe('suggestTaxMappings', () => {
  it('suggests an exact code match', () => {
    const result = suggestTaxMappings([{ code: 'STD' }], RATES);
    expect(result[0].suggestedTaxRateId).toBe('rate_std');
  });

  it('suggests by exact rate number when the code itself does not match', () => {
    const result = suggestTaxMappings([{ code: 'VAT15', rate: 15 }], RATES);
    expect(result[0].suggestedTaxRateId).toBe('rate_std');
  });

  it('suggests via the explicit alias catalog (STANDARD/ZERO/EXEMPT/NO VAT)', () => {
    expect(suggestTaxMappings([{ code: 'STANDARD' }], RATES)[0].suggestedTaxRateId).toBe('rate_std');
    expect(suggestTaxMappings([{ code: 'ZERO RATED' }], RATES)[0].suggestedTaxRateId).toBe('rate_zero');
    expect(suggestTaxMappings([{ code: 'EXEMPT' }], RATES)[0].suggestedTaxRateId).toBe('rate_exempt');
  });

  it('leaves an unrecognized code unresolved — no fuzzy matching', () => {
    const result = suggestTaxMappings([{ code: 'MYSTERY-CODE' }], RATES);
    expect(result[0].suggestedTaxRateId).toBeUndefined();
  });

  it('never matches on description similarity alone', () => {
    const result = suggestTaxMappings([{ code: 'XYZ', description: 'Standard Rated VAT' }], RATES);
    expect(result[0].suggestedTaxRateId).toBeUndefined();
  });
});

describe('restoreTaxMappingSelections', () => {
  const refs = [{ code: 'STD' }, { code: 'ZERO' }, { code: 'FOREIGN' }];

  it('restores a saved "mapped" choice for a code present in this import', () => {
    const restored = restoreTaxMappingSelections({ STD: { action: 'mapped', taxRateId: 'rate_std' } }, refs, RATES);
    expect(restored.STD).toEqual({ action: 'mapped', taxRateId: 'rate_std' });
  });

  it('restores a saved "ignore" choice as-is', () => {
    const restored = restoreTaxMappingSelections({ ZERO: { action: 'ignore' } }, refs, RATES);
    expect(restored.ZERO).toEqual({ action: 'ignore' });
  });

  it('drops a "mapped" choice whose tax rate id is no longer configured/effective (invalid/deactivated destination)', () => {
    // getMappableTaxTreatments(ctx) only ever returns currently-effective rates (taxRateService.getCurrentlyEffectiveRates) — a rate expired/removed since the profile was saved is simply absent from RATES here.
    const restored = restoreTaxMappingSelections({ STD: { action: 'mapped', taxRateId: 'rate_expired' } }, refs, RATES);
    expect(restored.STD).toBeUndefined();
  });

  it('drops a "mapped" choice whose tax rate id belongs to a different company (company isolation)', () => {
    const restored = restoreTaxMappingSelections({ STD: { action: 'mapped', taxRateId: 'rate_other_company' } }, refs, RATES);
    expect(restored.STD).toBeUndefined();
  });

  it('never restores by code/description similarity — only an exact stored code (no fuzzy fallback)', () => {
    const restored = restoreTaxMappingSelections({ 'STANDARD RATED': { action: 'mapped', taxRateId: 'rate_std' } }, refs, RATES);
    expect(Object.keys(restored)).toHaveLength(0);
  });

  it('ignores a code from the profile not part of this import, and a malformed stored entry', () => {
    const restored = restoreTaxMappingSelections({ VAT99: { action: 'mapped', taxRateId: 'rate_std' }, FOREIGN: { action: 'weird' } }, refs, RATES);
    expect(restored).toEqual({});
  });
});
