import { describe, expect, it } from 'vitest';
import type { Product, StockBalance, StockMovement } from '@/types';
import type { AccountMappingKey } from '@/features/accounting/services/accountMappingService';
import { reconcileInventory } from './reconcileInventory';

const ACCT: Record<string, string> = {
  INVENTORY: 'acc-1200',
  INVENTORY_IN_TRANSIT: 'acc-1210',
};
const accounts = {
  getAccountId: async (key: AccountMappingKey) => {
    const id = ACCT[key];
    if (!id) throw new Error(`no account for ${key}`);
    return id;
  },
};

function ledger(balances: Record<string, number>) {
  return {
    getAccountLedger: async (accountId: string) => {
      const runningBalance = balances[accountId] ?? 0;
      return runningBalance === 0 ? [] : [{ runningBalance }];
    },
  };
}

function product(id: string, qoh: number, cost: number, track = true): Product {
  return {
    id,
    sku: id.toUpperCase(),
    name: id,
    type: 'good',
    unitPrice: cost * 1.4,
    costPrice: cost,
    trackInventory: track,
    quantityOnHand: qoh,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Product;
}
function balance(productId: string, warehouseId: string, qty: number): StockBalance {
  return {
    id: `${productId}-${warehouseId}`,
    productId,
    warehouseId,
    quantityOnHand: qty,
    quantityCommitted: 0,
    quantityOnOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as StockBalance;
}
function movement(productId: string, warehouseId: string, type: string, qty: number, totalCost = 0): StockMovement {
  return {
    id: `mv-${productId}-${warehouseId}-${type}-${qty}`,
    productId,
    warehouseId,
    type: type as StockMovement['type'],
    quantityDelta: qty,
    totalCost,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as StockMovement;
}

describe('reconcileInventory — one valuation contract, exact evidence', () => {
  it('a clean dataset reconciles: every difference is R0.00, isReconciled true', async () => {
    const products = [product('p1', 100, 10), product('p2', 50, 4), product('svc', 0, 0, false)];
    const stockBalances = [balance('p1', 'w1', 100), balance('p2', 'w1', 50)];
    const stockMovements = [
      movement('p1', 'w1', 'opening', 100),
      movement('p2', 'w1', 'opening', 50),
    ];
    // subledger = round(100×10 + 50×4, 2) = 1200
    const result = await reconcileInventory(
      { products, stockBalances, stockMovements },
      accounts,
      ledger({ 'acc-1200': 1200 }),
    );
    expect(result.subledgerValuation).toBe(1200);
    expect(result.inventoryGlBalance).toBe(1200);
    expect(result.subledgerVsGl).toBe(0);
    expect(result.totalInventoryVsGl).toBe(0);
    expect(result.isReconciled).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('uses ROUND-AFTER-SUM, not sum-of-line-rounded', async () => {
    // two products whose per-line values round differently than the summed value
    const products = [product('p1', 1, 0.015), product('p2', 1, 0.015)];
    const stockBalances = [balance('p1', 'w1', 1), balance('p2', 'w1', 1)];
    const stockMovements = [movement('p1', 'w1', 'opening', 1), movement('p2', 'w1', 'opening', 1)];
    const result = await reconcileInventory(
      { products, stockBalances, stockMovements },
      accounts,
      ledger({ 'acc-1200': 0.03 }),
    );
    expect(result.subledgerValuation).toBe(0.03); // round(0.03) — NOT round(0.015)+round(0.015)=0.04
    expect(result.subledgerVsGl).toBe(0);
  });

  it('detects a balance-cache drift and names the exact product/warehouse with expected/actual/difference', async () => {
    const products = [product('p1', 98, 10)];
    const stockBalances = [balance('p1', 'w1', 98)]; // cache says 98
    const stockMovements = [movement('p1', 'w1', 'opening', 100), movement('p1', 'w1', 'sale', -3)]; // ledger = 97
    const result = await reconcileInventory(
      { products, stockBalances, stockMovements },
      accounts,
      ledger({ 'acc-1200': 980 }),
    );
    const f = result.findings.find((x) => x.code === 'balance_cache_drift')!;
    expect(f).toBeDefined();
    expect(f.productSku).toBe('P1');
    expect(f.warehouseId).toBe('w1');
    expect(f.expected).toBe(97); // ledger
    expect(f.actual).toBe(98); // cache
    expect(f.difference).toBe(1);
    expect(result.isReconciled).toBe(false);
  });

  it('detects products.quantity_on_hand drifting from Σ stock_balances', async () => {
    const products = [product('p1', 105, 10)]; // scalar says 105
    const stockBalances = [balance('p1', 'wA', 60), balance('p1', 'wB', 40)]; // Σ = 100
    const stockMovements = [movement('p1', 'wA', 'opening', 60), movement('p1', 'wB', 'opening', 40)];
    const result = await reconcileInventory(
      { products, stockBalances, stockMovements },
      accounts,
      ledger({ 'acc-1200': 1000 }),
    );
    const f = result.findings.find((x) => x.code === 'product_quantity_drift')!;
    expect(f.expected).toBe(100);
    expect(f.actual).toBe(105);
    expect(f.difference).toBe(5);
  });

  it('detects a subledger-vs-GL 1200 difference with the exact amount', async () => {
    const products = [product('p1', 100, 10)]; // subledger 1000
    const stockBalances = [balance('p1', 'w1', 100)];
    const stockMovements = [movement('p1', 'w1', 'opening', 100)];
    const result = await reconcileInventory(
      { products, stockBalances, stockMovements },
      accounts,
      ledger({ 'acc-1200': 1042.5 }), // GL says 1042.50
    );
    const f = result.findings.find((x) => x.code === 'subledger_vs_gl')!;
    expect(f.expected).toBe(1000);
    expect(f.actual).toBe(1042.5);
    expect(f.difference).toBe(-42.5);
  });

  it('detects an in-transit subledger vs GL 1210 mismatch', async () => {
    const products = [product('p1', 20, 5)];
    const stockBalances = [balance('p1', 'wA', 15), balance('p1', 'wB', 5)];
    const stockMovements = [
      movement('p1', 'wA', 'opening', 20),
      movement('p1', 'wA', 'transfer_out', -5, 25), // 5 units × 5 = 25 in transit, ref undefined -> keyed by id
    ];
    const result = await reconcileInventory(
      { products, stockBalances, stockMovements },
      accounts,
      ledger({ 'acc-1200': 100, 'acc-1210': 0 }), // 1210 should be 25 but is 0
    );
    const f = result.findings.find((x) => x.code === 'in_transit_vs_gl')!;
    expect(f.expected).toBe(25);
    expect(f.actual).toBe(0);
    expect(f.difference).toBe(25);
  });

  it('detects a movement with no resolvable source when a known-refs set is supplied', async () => {
    const products = [product('p1', 5, 2)];
    const stockBalances = [balance('p1', 'w1', 5)];
    const stockMovements = [
      { ...movement('p1', 'w1', 'sale', -1, 2), reference: 'INV-9999', sourceDocumentType: undefined },
    ] as StockMovement[];
    const result = await reconcileInventory(
      { products, stockBalances, stockMovements, knownDocumentRefs: new Set(['INV-1000']) },
      accounts,
      ledger({ 'acc-1200': 10 }),
    );
    const f = result.findings.find((x) => x.code === 'movement_missing_source')!;
    expect(f.movementId).toBeDefined();
    expect(f.documentRef).toBe('INV-9999');
    expect(f.severity).toBe('warning');
  });

  it('rounding residual within the bound is a WARNING exposing expected/actual/difference/bound', async () => {
    // two single-line inventory postings; GL 1200 off by 0.01 (one cent per posting max)
    const products = [product('p1', 100, 10)]; // subledger 1000.00
    const stockBalances = [balance('p1', 'w1', 100)];
    const mk = (id: string, type: string, qty: number, tc: number) => ({
      ...movement('p1', 'w1', type, qty, tc),
      id,
      sourceDocumentType: 'bill',
      sourceDocumentId: id,
    });
    const stockMovements = [mk('b1', 'goods_received', 60, 600), mk('b2', 'goods_received', 40, 400)] as StockMovement[];
    const result = await reconcileInventory(
      { products, stockBalances, stockMovements },
      accounts,
      ledger({ 'acc-1200': 1000.01 }),
    );
    const f = result.findings.find((x) => x.code === 'subledger_vs_gl')!;
    expect(f.severity).toBe('warning');
    expect(f.expected).toBe(1000);
    expect(f.actual).toBe(1000.01);
    expect(f.difference).toBe(-0.01);
    expect(f.toleranceBound).toBe(0.01); // 0.005 × 2 inventory-affecting postings
    expect(f.detail).toMatch(/allowed theoretical bound/i);
    expect(result.isReconciled).toBe(true);
  });

  it('a difference beyond the rounding bound is an ERROR', async () => {
    const products = [product('p1', 100, 10)];
    const stockBalances = [balance('p1', 'w1', 100)];
    const stockMovements = [
      { ...movement('p1', 'w1', 'goods_received', 100, 1000), id: 'b1', sourceDocumentType: 'bill', sourceDocumentId: 'b1' },
    ] as StockMovement[];
    const result = await reconcileInventory(
      { products, stockBalances, stockMovements },
      accounts,
      ledger({ 'acc-1200': 1000.5 }), // 50c off, bound is 0.005
    );
    const f = result.findings.find((x) => x.code === 'subledger_vs_gl')!;
    expect(f.severity).toBe('error');
    expect(result.isReconciled).toBe(false);
  });

  it('flags negative on-hand quantity as a warning (not an error — WAC allows it)', async () => {
    const products = [product('p1', -2, 5)];
    const stockBalances = [balance('p1', 'w1', -2)];
    const stockMovements = [movement('p1', 'w1', 'opening', 3), movement('p1', 'w1', 'sale', -5)];
    const result = await reconcileInventory(
      { products, stockBalances, stockMovements },
      accounts,
      ledger({ 'acc-1200': -10 }),
    );
    const f = result.findings.find((x) => x.code === 'negative_stock')!;
    expect(f.severity).toBe('warning');
    expect(f.actual).toBe(-2);
    expect(result.isReconciled).toBe(true); // warnings don't fail reconciliation
  });
});

// ── Phase 3C: evidence rules BY movement type (no blanket exemption) ──────────
describe('reconcileInventory — movement source-evidence rules by type', () => {
  const products = [product('p1', 5, 2)];
  const stockBalances = [balance('p1', 'w1', 5)];
  const known = new Set(['OK-REF']);
  const mv = (over: Partial<StockMovement>): StockMovement =>
    ({ ...movement('p1', 'w1', over.type as string, over.quantityDelta ?? 0, over.totalCost ?? 0), ...over } as StockMovement);

  async function run(stockMovements: StockMovement[]) {
    return reconcileInventory(
      { products, stockBalances, stockMovements, knownDocumentRefs: known },
      accounts,
      ledger({ 'acc-1200': 10 }),
    );
  }
  const missing = (r: Awaited<ReturnType<typeof run>>, id: string) =>
    r.findings.find((f) => f.code === 'movement_missing_source' && f.movementId === id);

  it('document movement with structured link + line id → OK', async () => {
    const r = await run([
      mv({ id: 'g1', type: 'goods_received', sourceDocumentType: 'bill', sourceDocumentId: 'b1', sourceDocumentLineId: 'bl1' }),
    ]);
    expect(missing(r, 'g1')).toBeUndefined();
  });

  it('document movement with structured link but NO line id → warning', async () => {
    const r = await run([mv({ id: 'g2', type: 'goods_received', sourceDocumentType: 'bill', sourceDocumentId: 'b1' })]);
    expect(missing(r, 'g2')?.detail).toMatch(/no source_document_line_id/i);
  });

  it('document movement with neither structured link nor resolvable ref → warning', async () => {
    const r = await run([mv({ id: 'g3', type: 'sale', reference: 'UNKNOWN' })]);
    expect(missing(r, 'g3')?.detail).toMatch(/document-generated/i);
  });

  it('adjustment is NOT blanket-exempt: no evidence → warning', async () => {
    const r = await run([mv({ id: 'a1', type: 'adjustment' })]);
    expect(missing(r, 'a1')).toBeDefined();
  });

  it('adjustment WITH a stock_adjustment link + line id → OK', async () => {
    const r = await run([
      mv({ id: 'a2', type: 'adjustment', sourceDocumentType: 'stock_adjustment', sourceDocumentId: 'sa1', sourceDocumentLineId: 'sal1' }),
    ]);
    expect(missing(r, 'a2')).toBeUndefined();
  });

  it('correction without reversal_of_movement_id → warning', async () => {
    const r = await run([mv({ id: 'c1', type: 'correction', sourceDocumentType: 'reversal', sourceDocumentId: 'x' })]);
    expect(missing(r, 'c1')?.detail).toMatch(/no reversal_of_movement_id/i);
  });

  it('correction WITH reversal_of_movement_id + structured link → OK', async () => {
    const r = await run([
      mv({ id: 'c2', type: 'correction', reversalOfMovementId: 'g1', sourceDocumentType: 'reversal', sourceDocumentId: 'x' }),
    ]);
    expect(missing(r, 'c2')).toBeUndefined();
  });

  it('opening with an OPENING-style reference → OK (the one documented exception)', async () => {
    const r = await run([mv({ id: 'o1', type: 'opening', reference: 'OPENING' })]);
    expect(missing(r, 'o1')).toBeUndefined();
  });

  it('opening with no link and no OPENING reference → warning', async () => {
    const r = await run([mv({ id: 'o2', type: 'opening', reference: 'random' })]);
    expect(missing(r, 'o2')).toBeDefined();
  });
});

// ── Phase 3C: in-transit understands reversal/correction chains ───────────────
describe('reconcileInventory — in-transit with movement chains', () => {
  const products = [product('p1', 20, 5)];
  const stockBalances = [balance('p1', 'wA', 20)];
  const T = 'transfer-1';
  const mv = (id: string, type: string, qty: number, tc: number, over: Partial<StockMovement> = {}): StockMovement =>
    ({ ...movement('p1', 'wA', type, qty, tc), id, sourceDocumentType: 'stock_transfer', sourceDocumentId: T, ...over } as StockMovement);

  async function transit(stockMovements: StockMovement[]) {
    const r = await reconcileInventory(
      { products, stockBalances, stockMovements },
      accounts,
      ledger({ 'acc-1200': 100, 'acc-1210': 0 }),
    );
    return r;
  }

  it('dispatch only → genuinely in transit', async () => {
    const r = await transit([mv('d', 'transfer_out', -5, 25)]);
    expect(r.inTransitValuation).toBe(25);
  });

  it('dispatch + receipt → zero transit', async () => {
    const r = await transit([mv('d', 'transfer_out', -5, 25), mv('rc', 'transfer_in', 5, 25, { warehouseId: 'wB' })]);
    expect(r.inTransitValuation).toBe(0);
    expect(r.findings.some((f) => f.code === 'in_transit_vs_gl' && f.severity === 'error')).toBe(false);
  });

  it('dispatch + reversal of the dispatch → zero transit', async () => {
    const r = await transit([
      mv('d', 'transfer_out', -5, 25),
      mv('rev', 'correction', 5, 25, { reversalOfMovementId: 'd', sourceDocumentType: 'reversal' }),
    ]);
    expect(r.inTransitValuation).toBe(0);
  });

  it('dispatch + receipt + reversal of the receipt → back in transit', async () => {
    const r = await transit([
      mv('d', 'transfer_out', -5, 25),
      mv('rc', 'transfer_in', 5, 25, { warehouseId: 'wB' }),
      mv('rev', 'correction', -5, 25, { reversalOfMovementId: 'rc', sourceDocumentType: 'reversal' }),
    ]);
    expect(r.inTransitValuation).toBe(25);
  });

  it('duplicate receive → duplicate_transfer_receipt error', async () => {
    const r = await transit([
      mv('d', 'transfer_out', -5, 25),
      mv('rc1', 'transfer_in', 5, 25, { warehouseId: 'wB' }),
      mv('rc2', 'transfer_in', 5, 25, { warehouseId: 'wB' }),
    ]);
    const f = r.findings.find((x) => x.code === 'duplicate_transfer_receipt')!;
    expect(f.severity).toBe('error');
    expect(f.transferRef).toBe(T);
    expect(r.isReconciled).toBe(false);
  });

  it('orphan receive (no dispatch) → orphan_in_transit error', async () => {
    const r = await transit([mv('rc', 'transfer_in', 5, 25, { warehouseId: 'wB' })]);
    const f = r.findings.find((x) => x.code === 'orphan_in_transit')!;
    expect(f.severity).toBe('error');
    expect(r.isReconciled).toBe(false);
  });
});
