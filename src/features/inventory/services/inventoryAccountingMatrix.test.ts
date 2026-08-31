import { describe, expect, it } from 'vitest';
import { InventoryPostingEngine } from './inventoryPostingEngine';
import { FakeInventoryStore, FakeInventoryTransactionExecutor } from './inventoryPostingEngine.fake';
import { newWeightedAverageCost, roundAfterSumValuation } from './inventoryValuation';
import { reconcileInventory } from './reconcileInventory';
import type { AccountMappingKey } from '@/features/accounting/services/accountMappingService';
import type { Product, StockBalance, StockMovement } from '@/types';

/**
 * Review 3B item 23 — the consolidated inventory-accounting test matrix.
 *
 * Every scenario the Phase-3 brief enumerates for the engine, proven against
 * the in-memory `FakeInventoryTransactionExecutor` (a line-for-line mirror of
 * the atomic `post_inventory_transaction` RPC — Review 3B item 24 forbids
 * exercising the shared database). The per-workflow service integrations
 * (adjustment / transfer / take / opening stock / supplier return / invoice /
 * bill / PO / credit note) have their own suites; this file is the accounting
 * core: WAC, atomicity, idempotency, the same-product race, and reconciliation.
 */

const INV = 'acc-1200';
const COGS = 'acc-5000';
const GRNI = 'acc-2050';

function setup() {
  const store = new FakeInventoryStore();
  return { store, engine: new InventoryPostingEngine(new FakeInventoryTransactionExecutor(store)) };
}

function receipt(postingKey: string, productId: string, qty: number, unitCost: number) {
  return {
    postingKey,
    sourceType: 'purchase_order',
    sourceId: postingKey,
    movementDate: '2026-09-01',
    createdBy: 'u1',
    lines: [
      {
        productId,
        warehouseId: 'w1',
        quantityDelta: qty,
        costingMode: 'receipt' as const,
        unitCostIn: unitCost,
        inventoryAccountId: INV,
        contraAccountId: GRNI,
      },
    ],
  };
}

describe('item 23 · WAC contract', () => {
  it('simple: empty product, first receipt sets WAC = received cost', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 0, 0);
    await engine.applyInventoryTransaction(receipt('po:1:receipt', 'p1', 100, 10));
    expect(store.products.get('p1')!.costPrice).toBe(10);
    expect(store.products.get('p1')!.quantityOnHand).toBe(100);
  });

  it('multiple receipts blend: 100@10 then 100@12 → 11.0000', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 0, 0);
    await engine.applyInventoryTransaction(receipt('po:1:receipt', 'p1', 100, 10));
    await engine.applyInventoryTransaction(receipt('po:2:receipt', 'p1', 100, 12));
    expect(store.products.get('p1')!.costPrice).toBe(11);
  });

  it('same-product multi-line in ONE transaction blends sequentially', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 0, 0);
    await engine.applyInventoryTransaction({
      postingKey: 'po:multi:receipt',
      sourceType: 'purchase_order',
      sourceId: 'po-multi',
      movementDate: '2026-09-01',
      createdBy: 'u1',
      lines: [
        { productId: 'p1', warehouseId: 'w1', quantityDelta: 100, costingMode: 'receipt', unitCostIn: 10, inventoryAccountId: INV, contraAccountId: GRNI },
        { productId: 'p1', warehouseId: 'w1', quantityDelta: 100, costingMode: 'receipt', unitCostIn: 12, inventoryAccountId: INV, contraAccountId: GRNI },
      ],
    });
    // (100×10 + 100×12) / 200 = 11
    expect(store.products.get('p1')!.costPrice).toBe(11);
    expect(store.products.get('p1')!.quantityOnHand).toBe(200);
  });

  it('concurrent same-product receipts serialise to the same deterministic WAC in either order', async () => {
    // The RPC serialises via SELECT ... FOR UPDATE ORDER BY id. The Fake is
    // single-threaded, so we assert the invariant the lock guarantees: order
    // of the two receipts does not change the final blended cost.
    async function run(first: [number, number], second: [number, number]) {
      const { store, engine } = setup();
      store.addProduct('p1', 0, 0);
      await Promise.all([
        engine.applyInventoryTransaction(receipt('po:a:receipt', 'p1', first[0], first[1])),
        engine.applyInventoryTransaction(receipt('po:b:receipt', 'p1', second[0], second[1])),
      ]);
      return store.products.get('p1')!.costPrice;
    }
    const ab = await run([30, 8.5], [20, 10.25]);
    const ba = await run([20, 10.25], [30, 8.5]);
    expect(ab).toBe(9.2); // (30×8.5 + 20×10.25) / 50
    expect(ba).toBe(9.2);
  });

  it('zero starting quantity with a 4-decimal cost keeps full precision', () => {
    expect(newWeightedAverageCost(0, 0, 40, 7.3333)).toBe(7.3333);
  });

  it('4-decimal costs blend and round half-away-from-zero at 4dp', () => {
    expect(newWeightedAverageCost(1, 1.00005, 1, 1.00005)).toBe(1.0001);
  });

  it('deterministic rounding: valuation is ROUND-AFTER-SUM, never sum-of-line-rounded', () => {
    const lines = [
      { quantity: 826, unitCost: 608.434 },
      { quantity: 265, unitCost: 1152.7394 },
      { quantity: 8164, unitCost: 58.7716 },
    ];
    const ras = roundAfterSumValuation(lines);
    const sumOfRounded = lines.reduce((a, l) => a + Math.round(l.quantity * l.unitCost * 100) / 100, 0);
    expect(ras).not.toBe(Math.round(sumOfRounded * 100) / 100);
    // and it equals round(Σ raw)
    const raw = lines.reduce((a, l) => a + l.quantity * l.unitCost, 0);
    expect(ras).toBe(Math.round(raw * 100) / 100);
  });

  it('an issue never moves WAC; historical movement keeps its own cost', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 100, 10);
    await engine.applyInventoryTransaction({
      postingKey: 'inv:1:post',
      sourceType: 'invoice',
      sourceId: 'inv-1',
      movementDate: '2026-09-02',
      createdBy: 'u1',
      lines: [{ productId: 'p1', warehouseId: 'w1', quantityDelta: -10, costingMode: 'issue', movementType: 'sale', inventoryAccountId: INV, contraAccountId: COGS }],
      extraJournal: [{ accountId: 'acc-1100', debit: 140, credit: 0 }, { accountId: 'acc-4000', debit: 0, credit: 140 }],
    });
    const last = store.movements[store.movements.length - 1];
    expect(store.products.get('p1')!.costPrice).toBe(10);
    expect(last.unitCost).toBe(10);
    expect(last.totalCost).toBe(100);
  });
});

describe('item 23 · atomicity — a failed posting leaves NO partial state', () => {
  it('a second line referencing an unknown product rolls back the first line', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 0, 0);
    await expect(
      engine.applyInventoryTransaction({
        postingKey: 'po:bad:receipt',
        sourceType: 'purchase_order',
        sourceId: 'po-bad',
        movementDate: '2026-09-01',
        createdBy: 'u1',
        lines: [
          { productId: 'p1', warehouseId: 'w1', quantityDelta: 50, costingMode: 'receipt', unitCostIn: 10, inventoryAccountId: INV, contraAccountId: GRNI },
          { productId: 'ghost', warehouseId: 'w1', quantityDelta: 50, costingMode: 'receipt', unitCostIn: 10, inventoryAccountId: INV, contraAccountId: GRNI },
        ],
      }),
    ).rejects.toThrow(/not in company/i);

    expect(store.products.get('p1')!.quantityOnHand).toBe(0);
    expect(store.products.get('p1')!.costPrice).toBe(0);
    expect(store.movements).toHaveLength(0);
    expect(store.journalEntries).toHaveLength(0);
    expect(store.balance('p1', 'w1')).toBe(0);
    expect(store.transactionLog.size).toBe(0);
  });

  it('an unbalanced merged journal rolls back every movement and balance', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 10, 5);
    await expect(
      engine.applyInventoryTransaction({
        postingKey: 'inv:bad:post',
        sourceType: 'invoice',
        sourceId: 'inv-bad',
        movementDate: '2026-09-02',
        createdBy: 'u1',
        lines: [{ productId: 'p1', warehouseId: 'w1', quantityDelta: -1, costingMode: 'issue', movementType: 'sale', inventoryAccountId: INV, contraAccountId: COGS }],
        extraJournal: [{ accountId: 'acc-1100', debit: 999, credit: 0 }],
      }),
    ).rejects.toThrow(/unbalanced/i);

    expect(store.products.get('p1')!.quantityOnHand).toBe(10);
    expect(store.balance('p1', 'w1')).toBe(0);
    expect(store.movements).toHaveLength(0);
    expect(store.journalEntries).toHaveLength(0);
    expect(store.transactionLog.size).toBe(0);
  });

  it('a retry after a rolled-back attempt starts clean (posting key was not consumed)', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 0, 0);
    const bad = {
      postingKey: 'po:retry:receipt',
      sourceType: 'purchase_order',
      sourceId: 'po-retry',
      movementDate: '2026-09-01',
      createdBy: 'u1',
      lines: [
        { productId: 'p1', warehouseId: 'w1', quantityDelta: 10, costingMode: 'receipt' as const, unitCostIn: 10, inventoryAccountId: INV, contraAccountId: GRNI },
        { productId: 'ghost', warehouseId: 'w1', quantityDelta: 10, costingMode: 'receipt' as const, unitCostIn: 10, inventoryAccountId: INV, contraAccountId: GRNI },
      ],
    };
    await expect(engine.applyInventoryTransaction(bad)).rejects.toThrow();
    // fix the request and retry with the SAME posting key
    const good = { ...bad, lines: [bad.lines[0]] };
    const result = await engine.applyInventoryTransaction(good);
    expect(result.idempotent).toBe(false);
    expect(store.products.get('p1')!.quantityOnHand).toBe(10);
    expect(store.journalEntries).toHaveLength(1);
  });
});

describe('item 23 · idempotency — a retry never double-posts', () => {
  it('the same posting key twice → one movement, one journal, one audit row', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 0, 0);
    const req = {
      ...receipt('po:idem:receipt', 'p1', 100, 10),
      audit: { action: 'stock_import_committed' as const, recordType: 'purchase_order', recordId: 'po-idem' },
    };
    const first = await engine.applyInventoryTransaction(req);
    const second = await engine.applyInventoryTransaction(req);

    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(second.journalEntryId).toBe(first.journalEntryId);
    expect(second.movementIds).toEqual(first.movementIds);
    expect(store.movements).toHaveLength(1);
    expect(store.journalEntries).toHaveLength(1);
    expect(store.auditLog).toHaveLength(1);
    expect(store.products.get('p1')!.quantityOnHand).toBe(100);
  });

  it('reversal is idempotent on its own key', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 0, 0);
    await engine.applyInventoryTransaction(receipt('po:rev:receipt', 'p1', 100, 10));
    const r1 = await engine.reverseInventoryTransaction({
      postingKey: 'po:rev:receipt:reverse',
      originalPostingKey: 'po:rev:receipt',
      movementDate: '2026-09-05',
      createdBy: 'u1',
    });
    const r2 = await engine.reverseInventoryTransaction({
      postingKey: 'po:rev:receipt:reverse',
      originalPostingKey: 'po:rev:receipt',
      movementDate: '2026-09-05',
      createdBy: 'u1',
    });
    expect(r2.idempotent).toBe(true);
    expect(r2.journalEntryId).toBe(r1.journalEntryId);
    expect(store.movements).toHaveLength(2); // receipt + its one reversal
    expect(store.products.get('p1')!.quantityOnHand).toBe(0);
  });
});

// ── Reconciliation matrix ──────────────────────────────────────────────────

function prod(id: string, qoh: number, cost: number, track = true): Product {
  return {
    id, sku: id.toUpperCase(), name: id, type: 'good', unitPrice: cost * 1.5, costPrice: cost,
    trackInventory: track, quantityOnHand: qoh, status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  } as Product;
}
function bal(productId: string, warehouseId: string, qty: number): StockBalance {
  return {
    id: `${productId}-${warehouseId}`, productId, warehouseId, quantityOnHand: qty,
    quantityCommitted: 0, quantityOnOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  } as StockBalance;
}
function mv(productId: string, warehouseId: string, type: string, qty: number, totalCost = 0, tag = ''): StockMovement {
  return {
    id: `mv-${productId}-${warehouseId}-${type}-${qty}-${tag}`, productId, warehouseId,
    type: type as StockMovement['type'], quantityDelta: qty, totalCost,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  } as StockMovement;
}
const accounts = {
  getAccountId: async (key: AccountMappingKey) => {
    const m: Record<string, string> = { INVENTORY: INV, INVENTORY_IN_TRANSIT: 'acc-1210' };
    const id = m[key];
    if (!id) throw new Error(`no account for ${key}`);
    return id;
  },
};
function ledger(balances: Record<string, number>) {
  return { getAccountLedger: async (id: string) => (balances[id] ? [{ runningBalance: balances[id] }] : []) };
}

describe('item 23 · reconciliation', () => {
  it('a clean book reconciles: every difference is R0.00', async () => {
    const products = [prod('p1', 100, 10), prod('p2', 50, 4)];
    const balances = [bal('p1', 'w1', 100), bal('p2', 'w1', 50)];
    const movements = [mv('p1', 'w1', 'opening', 100), mv('p2', 'w1', 'opening', 50)];
    const r = await reconcileInventory({ products, stockBalances: balances, stockMovements: movements }, accounts, ledger({ [INV]: 1200 }));
    expect(r.subledgerValuation).toBe(1200);
    expect(r.subledgerVsGl).toBe(0);
    expect(r.totalInventoryVsGl).toBe(0);
    expect(r.isReconciled).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it('a deliberate GL mismatch is identified exactly (product, expected, actual, difference)', async () => {
    const products = [prod('p1', 100, 10)];
    const balances = [bal('p1', 'w1', 100)];
    const movements = [mv('p1', 'w1', 'opening', 100)];
    const r = await reconcileInventory({ products, stockBalances: balances, stockMovements: movements }, accounts, ledger({ [INV]: 1234.5 }));
    const f = r.findings.find((x) => x.code === 'subledger_vs_gl')!;
    expect(f.expected).toBe(1000);
    expect(f.actual).toBe(1234.5);
    expect(f.difference).toBe(-234.5);
    expect(r.isReconciled).toBe(false);
  });

  it('a deliberate balance-cache drift names the exact product/warehouse', async () => {
    const products = [prod('p1', 97, 10)];
    const balances = [bal('p1', 'w1', 98)]; // cache says 98
    const movements = [mv('p1', 'w1', 'opening', 100), mv('p1', 'w1', 'sale', -3)]; // ledger = 97
    const r = await reconcileInventory({ products, stockBalances: balances, stockMovements: movements }, accounts, ledger({ [INV]: 970 }));
    const f = r.findings.find((x) => x.code === 'balance_cache_drift')!;
    expect(f.productSku).toBe('P1');
    expect(f.warehouseId).toBe('w1');
    expect(f.expected).toBe(97);
    expect(f.actual).toBe(98);
    expect(f.difference).toBe(1);
  });

  it('a sub-cent-per-movement GL residual is a WARNING, not an integrity error', async () => {
    // subledger round-after-sum = 1000.00; GL 1200 = 1000.02 (2c of accumulated
    // per-line rounding across 12 movements → band = 0.005 × 12 = 0.06).
    const products = [prod('p1', 100, 10)];
    const balances = [bal('p1', 'w1', 100)];
    // 12 movements netting to +100 (opening 100, then 11 no-op ±0 counted rows).
    const movements = [
      mv('p1', 'w1', 'opening', 100, 1000, 'o'),
      ...Array.from({ length: 11 }, (_, i) => mv('p1', 'w1', 'goods_received', 0, 0, `n${i}`)),
    ];
    const r = await reconcileInventory(
      { products, stockBalances: balances, stockMovements: movements },
      accounts,
      ledger({ [INV]: 1000.02 }),
    );
    const f = r.findings.find((x) => x.code === 'subledger_vs_gl')!;
    expect(f.severity).toBe('warning');
    expect(f.difference).toBe(-0.02);
    expect(f.detail).toMatch(/rounding residual/i);
    expect(r.isReconciled).toBe(true); // a rounding residual does not fail reconciliation
  });

  it('a GL difference beyond the rounding band is still an ERROR', async () => {
    const products = [prod('p1', 100, 10)];
    const balances = [bal('p1', 'w1', 100)];
    const movements = [
      mv('p1', 'w1', 'opening', 100, 1000, 'o'),
      ...Array.from({ length: 3 }, (_, i) => mv('p1', 'w1', 'goods_received', 0, 0, `n${i}`)),
    ];
    const r = await reconcileInventory(
      { products, stockBalances: balances, stockMovements: movements },
      accounts,
      ledger({ [INV]: 1005 }), // R5 off, band is only 0.005 × 4 = 0.02
    );
    const f = r.findings.find((x) => x.code === 'subledger_vs_gl')!;
    expect(f.severity).toBe('error');
    expect(r.isReconciled).toBe(false);
  });

  it('reconciliation uses the round-after-sum valuation contract', async () => {
    const products = [prod('p1', 1, 0.015), prod('p2', 1, 0.015)];
    const balances = [bal('p1', 'w1', 1), bal('p2', 'w1', 1)];
    const movements = [mv('p1', 'w1', 'opening', 1), mv('p2', 'w1', 'opening', 1)];
    const r = await reconcileInventory({ products, stockBalances: balances, stockMovements: movements }, accounts, ledger({ [INV]: 0.03 }));
    expect(r.subledgerValuation).toBe(0.03); // round(0.03), not round(0.015)+round(0.015)=0.04
    expect(r.subledgerVsGl).toBe(0);
  });
});
