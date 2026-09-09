import { describe, expect, it } from 'vitest';
import type { InventoryReconciliationFinding } from './reconcileInventory';
import { selectProductFindings, summarizeProductIntegrity } from './productIntegrity';

const f = (over: Partial<InventoryReconciliationFinding>): InventoryReconciliationFinding => ({
  code: 'balance_cache_drift',
  severity: 'error',
  expected: 0,
  actual: 0,
  difference: 0,
  detail: '',
  ...over,
});

describe('selectProductFindings', () => {
  const result = {
    findings: [
      f({ code: 'balance_cache_drift', productId: 'p1' }),
      f({ code: 'negative_stock', severity: 'warning', productId: 'p2' }),
      f({ code: 'movement_missing_source', severity: 'warning', productId: 'p1' }),
      f({ code: 'orphan_in_transit', transferRef: 'TRF-9' }),
      f({ code: 'subledger_vs_gl' }), // company-wide, no productId
    ],
  };

  it('keeps only findings that name the product', () => {
    const picked = selectProductFindings(result, 'p1');
    expect(picked.map((x) => x.code)).toEqual(['balance_cache_drift', 'movement_missing_source']);
  });

  it('folds in a transfer finding when the transfer carries a line for the product', () => {
    const picked = selectProductFindings(result, 'p1', new Set(['TRF-9']));
    expect(picked.some((x) => x.code === 'orphan_in_transit')).toBe(true);
  });

  it('excludes transfer findings for transfers unrelated to the product', () => {
    const picked = selectProductFindings(result, 'p2', new Set(['TRF-OTHER']));
    expect(picked.some((x) => x.code === 'orphan_in_transit')).toBe(false);
  });
});

describe('summarizeProductIntegrity', () => {
  it('is not_tracked for a non-tracked item regardless of findings', () => {
    expect(summarizeProductIntegrity([f({})], false).status).toBe('not_tracked');
  });

  it('is reconciled with no findings', () => {
    expect(summarizeProductIntegrity([], true)).toMatchObject({ status: 'reconciled', errorCount: 0, warningCount: 0 });
  });

  it('is attention with only warnings', () => {
    expect(summarizeProductIntegrity([f({ severity: 'warning' })], true).status).toBe('attention');
  });

  it('is investigate with any error', () => {
    const s = summarizeProductIntegrity([f({ severity: 'warning' }), f({ severity: 'error' })], true);
    expect(s.status).toBe('investigate');
    expect(s.errorCount).toBe(1);
    expect(s.warningCount).toBe(1);
  });
});
