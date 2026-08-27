import { describe, expect, it } from 'vitest';
import { daysBetween, descriptionOverlap, referencesMatch, tokenize } from './textMatching';

describe('daysBetween', () => {
  it('returns the absolute number of whole days between two dates', () => {
    expect(daysBetween('2026-08-14', '2026-08-15')).toBe(1);
    expect(daysBetween('2026-08-15', '2026-08-14')).toBe(1);
    expect(daysBetween('2026-08-14', '2026-08-14')).toBe(0);
  });
});

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumeric characters', () => {
    expect(tokenize('INV-2041 Payment')).toEqual(new Set(['inv', '2041', 'payment']));
  });
});

describe('descriptionOverlap', () => {
  it('returns 1 for identical text', () => {
    expect(descriptionOverlap('Bank Charges', 'Bank Charges')).toBe(1);
  });

  it('returns 0 for completely unrelated text', () => {
    expect(descriptionOverlap('ABC Traders', 'ZZZ Supplies')).toBe(0);
  });
});

describe('referencesMatch', () => {
  it('matches exactly', () => {
    expect(referencesMatch('INV-1', 'INV-1')).toBe(true);
  });

  it('matches when one reference contains the other', () => {
    expect(referencesMatch('EFT-INV-1-2026', 'INV-1')).toBe(true);
  });

  it('does not match unrelated references', () => {
    expect(referencesMatch('INV-1', 'INV-2')).toBe(false);
  });

  it('does not match when either reference is missing', () => {
    expect(referencesMatch(undefined, 'INV-1')).toBe(false);
  });
});
