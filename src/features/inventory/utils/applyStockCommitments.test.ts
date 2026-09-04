import { describe, expect, it } from 'vitest';
import type { StockBalance } from '@/types';
import { quantityAvailable } from '@/types';
import { commitmentKey } from '../services/stockCommitmentService';
import { applyStockCommitments } from './applyStockCommitments';

function balance(overrides: Partial<StockBalance> = {}): StockBalance {
  return {
    id: 'bal_1',
    productId: 'p1',
    warehouseId: 'wh_1',
    quantityOnHand: 50,
    quantityCommitted: 0,
    quantityOnOrder: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('applyStockCommitments', () => {
  it('replaces quantityCommitted on each row from the derived map, keying on product + warehouse', () => {
    const rows = applyStockCommitments(
      [balance({ id: 'a', productId: 'p1', warehouseId: 'wh_1', quantityCommitted: 999 }), balance({ id: 'b', productId: 'p1', warehouseId: 'wh_2' })],
      new Map([[commitmentKey('p1', 'wh_1'), 12]]),
    );
    expect(rows.find((r) => r.id === 'a')?.quantityCommitted).toBe(12);
    expect(rows.find((r) => r.id === 'b')?.quantityCommitted).toBe(0);
  });

  it('synthesizes a zero-on-hand row for a commitment key with no matching balance row', () => {
    const rows = applyStockCommitments([balance({ productId: 'p1', warehouseId: 'wh_1' })], new Map([[commitmentKey('p9', 'wh_7'), 5]]));
    const synthetic = rows.find((r) => r.productId === 'p9');
    expect(synthetic).toBeDefined();
    expect(synthetic).toMatchObject({ id: 'synthetic_p9__wh_7', warehouseId: 'wh_7', quantityOnHand: 0, quantityCommitted: 5, quantityOnOrder: 0 });
  });

  it('a synthetic row reports negative Available', () => {
    const [synthetic] = applyStockCommitments([], new Map([[commitmentKey('p1', 'wh_1'), 4]]));
    expect(quantityAvailable(synthetic)).toBe(-4);
  });

  it('does not synthesize for a zero-quantity commitment key', () => {
    const rows = applyStockCommitments([], new Map([[commitmentKey('p1', 'wh_1'), 0]]));
    expect(rows).toHaveLength(0);
  });

  it('leaves the input array untouched (returns new rows)', () => {
    const input = [balance()];
    const rows = applyStockCommitments(input, new Map([[commitmentKey('p1', 'wh_1'), 3]]));
    expect(input[0].quantityCommitted).toBe(0);
    expect(rows[0]).not.toBe(input[0]);
  });
});
