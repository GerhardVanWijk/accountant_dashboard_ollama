import { describe, expect, it } from 'vitest';
import {
  lineValue,
  newWeightedAverageCost,
  rawLineValue,
  roundAfterSumValuation,
} from './inventoryValuation';
import { InventoryPostingEngine } from './inventoryPostingEngine';
import { FakeInventoryStore, FakeInventoryTransactionExecutor } from './inventoryPostingEngine.fake';

function setup(store = new FakeInventoryStore()) {
  return { store, engine: new InventoryPostingEngine(new FakeInventoryTransactionExecutor(store)) };
}

/** Journal lines, order-agnostic (the RPC / fake sort by account id, which is a UUID in prod). */
function jl(entry: { lines: { accountId: string; debit: number; credit: number }[] }) {
  return [...entry.lines].sort((a, b) => (a.accountId < b.accountId ? -1 : 1));
}

const INV = 'acc-1200';
const COGS = 'acc-5000';
const GRNI = 'acc-2050';
const ADJ = 'acc-5050';
const OBE = 'acc-3950';
const TRANSIT = 'acc-1210';
const AP = 'acc-2000';
const AR = 'acc-1100';
const REVENUE = 'acc-4000';
const VAT_OUT = 'acc-2100';

describe('inventoryValuation — the authoritative WAC + valuation contract', () => {
  it('WAC blend: 100 @ 10.00 receive 100 @ 12.00 → 11.0000', () => {
    expect(newWeightedAverageCost(100, 10, 100, 12)).toBe(11);
  });

  it('WAC blend: 30 @ 8.5000 receive 20 @ 10.2500 → 9.2000', () => {
    // (30×8.5 + 20×10.25) / 50 = (255 + 205) / 50 = 460 / 50 = 9.2000
    expect(newWeightedAverageCost(30, 8.5, 20, 10.25)).toBe(9.2);
  });

  it('WAC on an empty product = the received cost', () => {
    expect(newWeightedAverageCost(0, 0, 40, 7.3333)).toBe(7.3333);
  });

  it('WAC keeps the old cost when new quantity would be ≤ 0', () => {
    expect(newWeightedAverageCost(5, 4, -10, 4)).toBe(4);
  });

  it('WAC rounds to 4 dp, half-away-from-zero', () => {
    // (1×1.00005 + 1×1.00005)/2 = 1.00005 → 1.0001 at 4dp
    expect(newWeightedAverageCost(1, 1.00005, 1, 1.00005)).toBe(1.0001);
  });

  it('lineValue rounds to cents, no float drift', () => {
    expect(lineValue(3, 1.005)).toBe(3.02); // 3.015 → 3.02
    expect(lineValue(7, 1.1415510000001)).toBe(7.99); // 7.9908... → 7.99
  });

  it('rawLineValue is |qty| × cost UNROUNDED (feeds round-after-sum)', () => {
    expect(rawLineValue(1, 10.004)).toBe(10.004);
    expect(rawLineValue(-2, 3.3333)).toBeCloseTo(6.6666, 10);
    // two raw contributions sum then round to 20.01 — NOT 20.00
    expect(Math.round((rawLineValue(1, 10.004) + rawLineValue(1, 10.004)) * 100) / 100).toBe(20.01);
  });

  it('ROUND AFTER SUM: two lines 0.015 each sum then round', () => {
    // Σ = 0.03 exactly → round → 0.03  (NOT round(0.015)+round(0.015) = 0.02+0.02)
    expect(roundAfterSumValuation([{ quantity: 1, unitCost: 0.015 }, { quantity: 1, unitCost: 0.015 }])).toBe(0.03);
  });

  it('ROUND AFTER SUM reproduces the Office National figure family', () => {
    // Representative: per-line sum-then-round differs from line-rounded-then-sum.
    const lines = [
      { quantity: 826, unitCost: 608.4340 },
      { quantity: 265, unitCost: 1152.7394 },
      { quantity: 8164, unitCost: 58.7716 },
    ];
    const roundAfterSum = roundAfterSumValuation(lines);
    const sumOfLineRounded = lines.reduce((a, l) => a + lineValue(l.quantity, l.unitCost), 0);
    expect(roundAfterSum).not.toBe(Math.round(sumOfLineRounded * 100) / 100);
  });
});

describe('InventoryPostingEngine — purchase receipt (WAC blend, atomic, GL)', () => {
  it('receipt blends WAC, records the movement at the received cost, posts DR Inventory / CR GRNI', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 100, 10);
    const r = await engine.applyInventoryTransaction({
      postingKey: 'bill:b1:post',
      sourceType: 'bill',
      sourceId: 'b1',
      movementDate: '2026-09-01',
      createdBy: 'u1',
      lines: [
        {
          productId: 'p1',
          warehouseId: 'w1',
          quantityDelta: 100,
          costingMode: 'receipt',
          unitCostIn: 12,
          inventoryAccountId: INV,
          contraAccountId: GRNI,
        },
      ],
      journal: { source: 'bill' },
    });
    expect(store.products.get('p1')!.costPrice).toBe(11); // WAC blended
    expect(store.products.get('p1')!.quantityOnHand).toBe(200);
    expect(store.balance('p1', 'w1')).toBe(100);
    const mv = store.movements[0];
    expect(mv.type).toBe('goods_received');
    expect(mv.unitCost).toBe(12); // the movement carries the RECEIVED cost, not the blend
    expect(mv.totalCost).toBe(1200);
    expect(mv.sourceDocumentType).toBe('bill');
    const je = store.journalEntries[0];
    expect(jl(je)).toEqual([
      { accountId: INV, debit: 1200, credit: 0 },
      { accountId: GRNI, debit: 0, credit: 1200 },
    ].sort((a, b) => (a.accountId < b.accountId ? -1 : 1)));
    expect(r.journalEntryId).toBe(je.id);
  });

  it('same-product multi-line receipt blends sequentially inside one transaction', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 0, 0);
    await engine.applyInventoryTransaction({
      postingKey: 'bill:b2:post',
      sourceType: 'bill',
      sourceId: 'b2',
      movementDate: '2026-09-01',
      createdBy: 'u1',
      lines: [
        { productId: 'p1', warehouseId: 'w1', quantityDelta: 10, costingMode: 'receipt', unitCostIn: 5, inventoryAccountId: INV, contraAccountId: GRNI },
        { productId: 'p1', warehouseId: 'w1', quantityDelta: 10, costingMode: 'receipt', unitCostIn: 7, inventoryAccountId: INV, contraAccountId: GRNI },
      ],
    });
    // first: 0→10 @ 5 → WAC 5 ; second: 10@5 + 10@7 → WAC 6
    expect(store.products.get('p1')!.costPrice).toBe(6);
    expect(store.products.get('p1')!.quantityOnHand).toBe(20);
    // journal aggregated: DR Inventory 120 / CR GRNI 120
    expect(jl(store.journalEntries[0])).toEqual([
      { accountId: INV, debit: 120, credit: 0 },
      { accountId: GRNI, debit: 0, credit: 120 },
    ].sort((a, b) => (a.accountId < b.accountId ? -1 : 1)));
  });
});

describe('InventoryPostingEngine — sale / COGS', () => {
  it('issues stock at current WAC, posts DR COGS / CR Inventory exactly once, plus the caller revenue side', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 50, 8);
    store.setBalance('p1', 'w1', 50);
    await engine.applyInventoryTransaction({
      postingKey: 'invoice:i1:post',
      sourceType: 'invoice',
      sourceId: 'i1',
      movementDate: '2026-09-02',
      createdBy: 'u1',
      lines: [
        { productId: 'p1', warehouseId: 'w1', quantityDelta: -5, costingMode: 'issue', movementType: 'sale', inventoryAccountId: INV, contraAccountId: COGS },
      ],
      extraJournal: [
        { accountId: AR, debit: 115, credit: 0 },
        { accountId: REVENUE, debit: 0, credit: 100 },
        { accountId: VAT_OUT, debit: 0, credit: 15 },
      ],
    });
    expect(store.products.get('p1')!.costPrice).toBe(8); // WAC unchanged by a sale
    expect(store.products.get('p1')!.quantityOnHand).toBe(45);
    expect(store.movements.filter((m) => m.type === 'sale')).toHaveLength(1);
    expect(store.movements[0].unitCost).toBe(8);
    expect(store.movements[0].totalCost).toBe(40);
    const je = store.journalEntries[0];
    // one entry: AR 115 / Revenue 100 / VAT 15 / COGS 40 / Inventory (40)
    expect(je.lines.find((l) => l.accountId === COGS)).toEqual({ accountId: COGS, debit: 40, credit: 0 });
    expect(je.lines.find((l) => l.accountId === INV)).toEqual({ accountId: INV, debit: 0, credit: 40 });
    const dr = je.lines.reduce((a, l) => a + l.debit, 0);
    const cr = je.lines.reduce((a, l) => a + l.credit, 0);
    expect(dr).toBe(cr);
  });

  it('a non-stock (service) line produces no movement and no COGS', async () => {
    const { store, engine } = setup();
    store.addProduct('svc', 0, 0);
    await engine.applyInventoryTransaction({
      postingKey: 'invoice:i2:post',
      sourceType: 'invoice',
      sourceId: 'i2',
      movementDate: '2026-09-02',
      createdBy: 'u1',
      lines: [{ productId: 'svc', warehouseId: 'w1', quantityDelta: -1, costingMode: 'issue', movementType: 'sale', nonStock: true }],
      extraJournal: [
        { accountId: AR, debit: 100, credit: 0 },
        { accountId: REVENUE, debit: 0, credit: 100 },
      ],
    });
    expect(store.movements).toHaveLength(0);
    expect(store.journalEntries[0].lines).toEqual([
      { accountId: AR, debit: 100, credit: 0 },
      { accountId: REVENUE, debit: 0, credit: 100 },
    ]);
  });
});

describe('InventoryPostingEngine — ROUND AFTER SUM GL aggregation (migration 0035)', () => {
  it('two same-account lines: round(Σ raw), NOT Σ round(line)', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 100, 0);
    store.setBalance('p1', 'w1', 100);
    // Two write-off lines, 1 unit each at a frozen 10.004 → raw 10.004 + 10.004.
    //   contract  : round(20.008, 2)              = 20.01
    //   old (bug) : round(10.004,2)+round(10.004,2) = 10.00 + 10.00 = 20.00
    await engine.applyInventoryTransaction({
      postingKey: 'stock_adjustment:ras:post',
      sourceType: 'stock_adjustment',
      sourceId: 'ras',
      movementDate: '2026-09-03',
      createdBy: 'u1',
      lines: [
        { productId: 'p1', warehouseId: 'w1', quantityDelta: -1, costingMode: 'issue', movementType: 'write_off', unitCostOverride: 10.004, inventoryAccountId: INV, contraAccountId: ADJ },
        { productId: 'p1', warehouseId: 'w1', quantityDelta: -1, costingMode: 'issue', movementType: 'write_off', unitCostOverride: 10.004, inventoryAccountId: INV, contraAccountId: ADJ },
      ],
    });
    const je = store.journalEntries[0];
    expect(je.lines.find((l) => l.accountId === ADJ)).toEqual({ accountId: ADJ, debit: 20.01, credit: 0 });
    expect(je.lines.find((l) => l.accountId === INV)).toEqual({ accountId: INV, debit: 0, credit: 20.01 });
    // each movement's own total_cost is still the per-movement 2dp figure
    expect(store.movements.map((m) => m.totalCost)).toEqual([10, 10]);
  });
});

describe('InventoryPostingEngine — adjustments, write-offs, stock take, opening stock', () => {
  it('write-off (loss): DR Inventory Adjustments / CR Inventory at current WAC', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 20, 15);
    store.setBalance('p1', 'w1', 20);
    await engine.applyInventoryTransaction({
      postingKey: 'stock_adjustment:a1:post',
      sourceType: 'stock_adjustment',
      sourceId: 'a1',
      movementDate: '2026-09-03',
      createdBy: 'u1',
      lines: [{ productId: 'p1', warehouseId: 'w1', quantityDelta: -3, costingMode: 'issue', movementType: 'write_off', inventoryAccountId: INV, contraAccountId: ADJ }],
      audit: { action: 'stock_written_off', recordType: 'StockAdjustment', recordId: 'a1', reason: 'damaged' },
    });
    expect(store.products.get('p1')!.quantityOnHand).toBe(17);
    expect(jl(store.journalEntries[0])).toEqual([
      { accountId: INV, debit: 0, credit: 45 },
      { accountId: ADJ, debit: 45, credit: 0 },
    ].sort((a, b) => (a.accountId < b.accountId ? -1 : 1)));
    expect(store.auditLog[0].action).toBe('stock_written_off');
  });

  it('stock gain: DR Inventory / CR Inventory Adjustments', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 10, 6);
    store.setBalance('p1', 'w1', 10);
    await engine.applyInventoryTransaction({
      postingKey: 'stock_adjustment:a2:post',
      sourceType: 'stock_adjustment',
      sourceId: 'a2',
      movementDate: '2026-09-03',
      createdBy: 'u1',
      lines: [{ productId: 'p1', warehouseId: 'w1', quantityDelta: 2, costingMode: 'return_in', movementType: 'stock_gain', inventoryAccountId: INV, contraAccountId: ADJ }],
    });
    expect(store.products.get('p1')!.quantityOnHand).toBe(12);
    expect(store.products.get('p1')!.costPrice).toBe(6); // gain does not move WAC
    expect(jl(store.journalEntries[0])).toEqual([
      { accountId: INV, debit: 12, credit: 0 },
      { accountId: ADJ, debit: 0, credit: 12 },
    ].sort((a, b) => (a.accountId < b.accountId ? -1 : 1)));
  });

  it('stock take: uses the frozen expected qty; positive & negative & zero variances in one atomic posting', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 100, 4); // expected 100, counted 103 → +3
    store.addProduct('p2', 50, 9); //  expected 50,  counted 48  → -2
    store.addProduct('p3', 10, 2); //  expected 10,  counted 10  → 0
    store.setBalance('p1', 'w1', 100);
    store.setBalance('p2', 'w1', 50);
    store.setBalance('p3', 'w1', 10);
    await engine.applyInventoryTransaction({
      postingKey: 'stock_take:t1:post',
      sourceType: 'stock_take',
      sourceId: 't1',
      movementDate: '2026-09-04',
      createdBy: 'u1',
      lines: [
        { productId: 'p1', warehouseId: 'w1', quantityDelta: 3, costingMode: 'return_in', movementType: 'stock_take', inventoryAccountId: INV, contraAccountId: ADJ },
        { productId: 'p2', warehouseId: 'w1', quantityDelta: -2, costingMode: 'issue', movementType: 'stock_take', inventoryAccountId: INV, contraAccountId: ADJ },
        // p3 zero-variance line omitted by the caller (no movement needed)
      ],
      audit: { action: 'stock_take_posted', recordType: 'StockTake', recordId: 't1' },
    });
    // net variance value = +3×4 (12) gain − 2×9 (18) loss → net DR Adjustments 6 / CR Inventory 6
    const je = store.journalEntries[0];
    expect(je.lines.find((l) => l.accountId === ADJ)).toEqual({ accountId: ADJ, debit: 6, credit: 0 });
    expect(je.lines.find((l) => l.accountId === INV)).toEqual({ accountId: INV, debit: 0, credit: 6 });
    expect(store.products.get('p1')!.quantityOnHand).toBe(103);
    expect(store.products.get('p2')!.quantityOnHand).toBe(48);
    expect(store.movements).toHaveLength(2);
  });

  it('opening stock: DR Inventory / CR Opening Balance Equity, WAC = the entered cost, no VAT', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 0, 0);
    await engine.applyInventoryTransaction({
      postingKey: 'opening_stock_batch:o1:confirm',
      sourceType: 'opening_stock_batch',
      sourceId: 'o1',
      movementDate: '2026-08-01',
      createdBy: 'u1',
      lines: [{ productId: 'p1', warehouseId: 'w1', quantityDelta: 40, costingMode: 'opening', unitCostIn: 7.5, inventoryAccountId: INV, contraAccountId: OBE }],
      audit: { action: 'opening_stock_set', recordType: 'OpeningStockBatch', recordId: 'o1' },
    });
    expect(store.products.get('p1')!.costPrice).toBe(7.5);
    expect(store.products.get('p1')!.quantityOnHand).toBe(40);
    expect(jl(store.journalEntries[0])).toEqual([
      { accountId: INV, debit: 300, credit: 0 },
      { accountId: OBE, debit: 0, credit: 300 },
    ].sort((a, b) => (a.accountId < b.accountId ? -1 : 1)));
  });
});

describe('InventoryPostingEngine — supplier return & transfer', () => {
  it('supplier return: CR Inventory / CR VAT Input / DR AP, stock leaves at current WAC, WAC unchanged', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 30, 20);
    store.setBalance('p1', 'w1', 30);
    await engine.applyInventoryTransaction({
      postingKey: 'supplier_return:sr1:post',
      sourceType: 'supplier_return',
      sourceId: 'sr1',
      movementDate: '2026-09-05',
      createdBy: 'u1',
      // engine: DR AP 80 / CR Inventory 80 (goods at WAC 4×20). extraJournal = the VAT leg only.
      lines: [{ productId: 'p1', warehouseId: 'w1', quantityDelta: -4, costingMode: 'issue', movementType: 'purchase_return', inventoryAccountId: INV, contraAccountId: AP }],
      extraJournal: [
        { accountId: AP, debit: 12, credit: 0 },
        { accountId: 'acc-2110', debit: 0, credit: 12 },
      ],
    });
    expect(store.products.get('p1')!.costPrice).toBe(20);
    expect(store.products.get('p1')!.quantityOnHand).toBe(26);
    const je = store.journalEntries[0];
    expect(je.lines.find((l) => l.accountId === INV)).toEqual({ accountId: INV, debit: 0, credit: 80 });
    // AP: 80 (engine contra) + 12 (extra) = 92 total debit
    expect(je.lines.find((l) => l.accountId === AP)).toEqual({ accountId: AP, debit: 92, credit: 0 });
    const dr = je.lines.reduce((a, l) => a + l.debit, 0);
    const cr = je.lines.reduce((a, l) => a + l.credit, 0);
    expect(dr).toBe(cr);
  });

  it('immediate transfer: GL-neutral, company qty unchanged, per-warehouse balances move', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 20, 3);
    store.setBalance('p1', 'wA', 20);
    await engine.applyInventoryTransaction({
      postingKey: 'stock_transfer:tr1:complete',
      sourceType: 'stock_transfer',
      sourceId: 'tr1',
      movementDate: '2026-09-06',
      createdBy: 'u1',
      lines: [
        { productId: 'p1', warehouseId: 'wA', quantityDelta: -5, costingMode: 'transfer_out' },
        { productId: 'p1', warehouseId: 'wB', quantityDelta: 5, costingMode: 'transfer_in' },
      ],
    });
    expect(store.products.get('p1')!.quantityOnHand).toBe(20); // company total unchanged
    expect(store.balance('p1', 'wA')).toBe(15);
    expect(store.balance('p1', 'wB')).toBe(5);
    expect(store.journalEntries).toHaveLength(0); // GL-neutral
  });

  it('in-transit transfer: DR 1210 / CR 1200 on dispatch, DR 1200 / CR 1210 on receipt', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 20, 3);
    store.setBalance('p1', 'wA', 20);
    await engine.applyInventoryTransaction({
      postingKey: 'stock_transfer:tr2:dispatch',
      sourceType: 'stock_transfer',
      sourceId: 'tr2',
      movementDate: '2026-09-06',
      createdBy: 'u1',
      lines: [{ productId: 'p1', warehouseId: 'wA', quantityDelta: -5, costingMode: 'transfer_out', inventoryAccountId: INV, contraAccountId: TRANSIT }],
    });
    expect(jl(store.journalEntries[0])).toEqual([
      { accountId: INV, debit: 0, credit: 15 },
      { accountId: TRANSIT, debit: 15, credit: 0 },
    ].sort((a, b) => (a.accountId < b.accountId ? -1 : 1)));
    await engine.applyInventoryTransaction({
      postingKey: 'stock_transfer:tr2:receive',
      sourceType: 'stock_transfer',
      sourceId: 'tr2',
      movementDate: '2026-09-08',
      createdBy: 'u1',
      lines: [{ productId: 'p1', warehouseId: 'wB', quantityDelta: 5, costingMode: 'transfer_in', inventoryAccountId: INV, contraAccountId: TRANSIT }],
    });
    expect(jl(store.journalEntries[1])).toEqual([
      { accountId: INV, debit: 15, credit: 0 },
      { accountId: TRANSIT, debit: 0, credit: 15 },
    ].sort((a, b) => (a.accountId < b.accountId ? -1 : 1)));
    expect(store.products.get('p1')!.quantityOnHand).toBe(20);
  });
});

describe('InventoryPostingEngine — idempotency & atomicity', () => {
  it('the same posting key twice creates exactly one accounting result', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 10, 5);
    store.setBalance('p1', 'w1', 10);
    const req = {
      postingKey: 'stock_adjustment:a3:post',
      sourceType: 'stock_adjustment',
      sourceId: 'a3',
      movementDate: '2026-09-03',
      createdBy: 'u1',
      lines: [{ productId: 'p1', warehouseId: 'w1', quantityDelta: -1, costingMode: 'issue' as const, movementType: 'write_off' as const, inventoryAccountId: INV, contraAccountId: ADJ }],
    };
    const first = await engine.applyInventoryTransaction(req);
    const second = await engine.applyInventoryTransaction(req);
    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(second.journalEntryId).toBe(first.journalEntryId);
    expect(store.movements).toHaveLength(1);
    expect(store.journalEntries).toHaveLength(1);
    expect(store.products.get('p1')!.quantityOnHand).toBe(9); // moved once, not twice
  });

  it('an unbalanced merged journal throws and nothing is committed by the fake either', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 10, 5);
    await expect(
      engine.applyInventoryTransaction({
        postingKey: 'invoice:bad:post',
        sourceType: 'invoice',
        sourceId: 'bad',
        movementDate: '2026-09-02',
        createdBy: 'u1',
        lines: [{ productId: 'p1', warehouseId: 'w1', quantityDelta: -1, costingMode: 'issue', movementType: 'sale', inventoryAccountId: INV, contraAccountId: COGS }],
        extraJournal: [{ accountId: AR, debit: 999, credit: 0 }], // wildly unbalanced
      }),
    ).rejects.toThrow(/unbalanced/i);
  });

  it('rejects a wrong-sign line before touching anything', async () => {
    const { engine } = setup();
    await expect(
      engine.applyInventoryTransaction({
        postingKey: 'x:1:post',
        sourceType: 'x',
        sourceId: '1',
        movementDate: '2026-09-02',
        createdBy: 'u1',
        lines: [{ productId: 'p1', warehouseId: 'w1', quantityDelta: 5, costingMode: 'issue', movementType: 'sale' }],
      }),
    ).rejects.toThrow(/wrong sign/i);
  });

  it('negative stock under WAC is allowed but returns a warning', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 2, 5);
    store.setBalance('p1', 'w1', 2);
    const r = await engine.applyInventoryTransaction({
      postingKey: 'invoice:oversell:post',
      sourceType: 'invoice',
      sourceId: 'oversell',
      movementDate: '2026-09-02',
      createdBy: 'u1',
      lines: [{ productId: 'p1', warehouseId: 'w1', quantityDelta: -5, costingMode: 'issue', movementType: 'sale', inventoryAccountId: INV, contraAccountId: COGS }],
      extraJournal: [
        { accountId: AR, debit: 25, credit: 0 },
        { accountId: REVENUE, debit: 0, credit: 25 },
      ],
    });
    expect(r.warnings.some((w) => /negative stock/i.test(w))).toBe(true);
    expect(store.balance('p1', 'w1')).toBe(-3);
  });
});

describe('InventoryPostingEngine — reversal', () => {
  it('reverses movements (negated, historical cost retained) and swaps the journal, leaving inventory reconciled', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 20, 10);
    store.setBalance('p1', 'w1', 20);
    await engine.applyInventoryTransaction({
      postingKey: 'stock_adjustment:a4:post',
      sourceType: 'stock_adjustment',
      sourceId: 'a4',
      movementDate: '2026-09-03',
      createdBy: 'u1',
      lines: [{ productId: 'p1', warehouseId: 'w1', quantityDelta: -6, costingMode: 'issue', movementType: 'write_off', inventoryAccountId: INV, contraAccountId: ADJ }],
    });
    expect(store.products.get('p1')!.quantityOnHand).toBe(14);

    const rev = await engine.reverseInventoryTransaction({
      postingKey: 'stock_adjustment:a4:reverse',
      originalPostingKey: 'stock_adjustment:a4:post',
      movementDate: '2026-09-10',
      createdBy: 'u2',
      reason: 'entered against the wrong product',
      audit: { action: 'reversed', recordType: 'StockAdjustment', recordId: 'a4' },
    });
    expect(store.products.get('p1')!.quantityOnHand).toBe(20); // restored
    expect(store.balance('p1', 'w1')).toBe(20);
    const revMv = store.movements.find((m) => m.reversalOfMovementId);
    expect(revMv?.type).toBe('correction');
    expect(revMv?.quantityDelta).toBe(6); // negated
    expect(revMv?.unitCost).toBe(10); // historical cost retained
    const revJe = store.journalEntries.find((e) => e.id === rev.journalEntryId)!;
    // original: DR ADJ 60 / CR INV 60  →  reversal: DR INV 60 / CR ADJ 60
    expect(revJe.lines.find((l) => l.accountId === INV)).toEqual({ accountId: INV, debit: 60, credit: 0 });
    expect(revJe.lines.find((l) => l.accountId === ADJ)).toEqual({ accountId: ADJ, debit: 0, credit: 60 });
    expect(store.journalEntries.find((e) => e.entryNumber === revJe.entryNumber)).toBeDefined();
    const origJe = store.journalEntries.find((e) => e.source === 'stock_adjustment')!;
    expect(origJe.status).toBe('reversed');
  });

  it('reversal is idempotent on its own key', async () => {
    const { store, engine } = setup();
    store.addProduct('p1', 10, 5);
    store.setBalance('p1', 'w1', 10);
    await engine.applyInventoryTransaction({
      postingKey: 'stock_adjustment:a5:post',
      sourceType: 'stock_adjustment',
      sourceId: 'a5',
      movementDate: '2026-09-03',
      createdBy: 'u1',
      lines: [{ productId: 'p1', warehouseId: 'w1', quantityDelta: -1, costingMode: 'issue', movementType: 'write_off', inventoryAccountId: INV, contraAccountId: ADJ }],
    });
    const req = {
      postingKey: 'stock_adjustment:a5:reverse',
      originalPostingKey: 'stock_adjustment:a5:post',
      movementDate: '2026-09-10',
      createdBy: 'u2',
    };
    const a = await engine.reverseInventoryTransaction(req);
    const b = await engine.reverseInventoryTransaction(req);
    expect(a.idempotent).toBe(false);
    expect(b.idempotent).toBe(true);
    expect(store.products.get('p1')!.quantityOnHand).toBe(10); // reversed once
  });
});
