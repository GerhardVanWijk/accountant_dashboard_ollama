import { describe, expect, it } from 'vitest';
import { findSubsetsSumming } from './subsetSum';

describe('findSubsetsSumming', () => {
  it('finds a single-item exact match first', () => {
    const items = [{ amountCents: 100 }, { amountCents: 200 }];
    const result = findSubsetsSumming(items, 200);
    expect(result).toEqual([{ indexes: [1], sumCents: 200 }]);
  });

  it('finds a pair summing to the target when no single item matches', () => {
    const items = [{ amountCents: 100 }, { amountCents: 150 }, { amountCents: 900 }];
    const result = findSubsetsSumming(items, 250);
    expect(result.some((r) => r.indexes.length === 2)).toBe(true);
  });

  it('finds a triple summing to the target', () => {
    const items = [{ amountCents: 100 }, { amountCents: 200 }, { amountCents: 300 }, { amountCents: 900 }];
    const result = findSubsetsSumming(items, 600);
    const triple = result.find((r) => r.indexes.length === 3);
    expect(triple).toBeDefined();
  });

  it('returns an empty array for a zero target', () => {
    expect(findSubsetsSumming([{ amountCents: 100 }], 0)).toEqual([]);
  });
});
