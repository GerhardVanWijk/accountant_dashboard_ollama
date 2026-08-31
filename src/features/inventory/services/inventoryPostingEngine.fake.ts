import type { ID } from '@/types';
import type {
  InventoryReversalRequest,
  InventoryTransactionExecutor,
  InventoryTransactionRequest,
  InventoryTransactionResult,
} from './inventoryPostingEngine';
import { lineValue, newWeightedAverageCost, rawLineValue, roundCost, roundMoney } from './inventoryValuation';

/**
 * In-memory mirror of `public.post_inventory_transaction` /
 * `public.reverse_inventory_transaction` (migrations 0031/0032), used by every
 * Phase-3 test — the RPC is the production path; this Fake proves the control
 * flow (idempotency, per-mode behaviour, journal net-by-account, atomicity via
 * snapshot/rollback, reversal) without touching the shared database (item 24).
 *
 * WAC blend and per-movement 2dp valuation go through the SAME
 * `inventoryValuation.ts` contract functions the RPC re-implements in exact
 * `numeric`; they agree at every rounding boundary.
 *
 * As of migration 0035 this Fake mirrors the authoritative RPC exactly:
 *   (1) GL line aggregation is ROUND-AFTER-SUM — each inventory line
 *       contributes its RAW `|qty| × cost` (`rawLineValue`, full precision) to
 *       the per-account bucket, which is rounded to cents once. The movement's
 *       own `totalCost` field keeps its per-movement 2dp value (`lineValue`).
 *   (2) the idempotent-reversal branch returns the stored `movementIds` —
 *       shape-identical to the non-idempotent reversal result.
 * Any change to the RPC's rules MUST still be mirrored here.
 */

export interface FakeProduct {
  id: ID;
  companyId: ID;
  quantityOnHand: number;
  costPrice: number;
}

export interface FakeMovement {
  id: ID;
  companyId: ID;
  productId: ID;
  warehouseId: ID;
  type: string;
  quantityDelta: number;
  unitCost: number;
  totalCost: number;
  movementDate: string;
  /** `<sourceType>:<sourceId>` on a post, `reversal:<sourceId>` on a reversal — mirrors the RPC. reconcileInventory check D keys off this. */
  reference: string;
  sourceDocumentType: string;
  sourceDocumentId: ID;
  sourceDocumentLineId?: ID;
  createdBy: ID;
  reversalOfMovementId?: ID;
}

export interface FakeJournalLine {
  accountId: ID;
  debit: number;
  credit: number;
}
export interface FakeJournalEntry {
  id: ID;
  companyId: ID;
  entryNumber: string;
  source: string;
  memo?: string;
  status: 'posted' | 'reversed';
  reversalOfEntryId?: ID;
  lines: FakeJournalLine[];
}

export interface FakeAuditEntry {
  companyId: ID;
  userId: ID;
  action: string;
  module: string;
  recordType: string;
  recordId: string;
  reason?: string;
}

export interface FakeLogRow {
  id: ID;
  postingKey: string;
  sourceType: string;
  sourceId: ID;
  kind: 'post' | 'reversal';
  journalEntryId?: ID;
  movementIds: ID[];
  reversesTransactionId?: ID;
}

export class FakeInventoryStore {
  products = new Map<ID, FakeProduct>();
  balances = new Map<string, number>(); // `${productId}::${warehouseId}`
  movements: FakeMovement[] = [];
  journalEntries: FakeJournalEntry[] = [];
  auditLog: FakeAuditEntry[] = [];
  transactionLog = new Map<string, FakeLogRow>();
  private seq = 0;
  readonly companyId: ID;

  constructor(companyId: ID = 'co-1') {
    this.companyId = companyId;
  }

  id(prefix = 'x'): ID {
    this.seq += 1;
    return `${prefix}-${this.seq.toString().padStart(4, '0')}`;
  }

  addProduct(id: ID, quantityOnHand = 0, costPrice = 0): FakeProduct {
    const p: FakeProduct = { id, companyId: this.companyId, quantityOnHand, costPrice };
    this.products.set(id, p);
    return p;
  }

  balance(productId: ID, warehouseId: ID): number {
    return this.balances.get(`${productId}::${warehouseId}`) ?? 0;
  }
  setBalance(productId: ID, warehouseId: ID, qty: number): void {
    this.balances.set(`${productId}::${warehouseId}`, qty);
  }

  companyValuation(): number {
    // ROUND-AFTER-SUM over the per-product company-wide (qty × cost_price).
    let acc = 0;
    for (const p of this.products.values()) acc += p.quantityOnHand * p.costPrice;
    return roundMoney(acc);
  }

  /**
   * Deep snapshot of every mutable collection. The RPC runs in ONE Postgres
   * transaction: a failure anywhere rolls the whole thing back. The executor
   * mirrors that by snapshotting before it touches anything and restoring on
   * any throw — so "posting failed" always means "store is exactly as it was"
   * (Review 3B item 4 / item 23 atomicity).
   */
  snapshot(): () => void {
    const products = new Map([...this.products].map(([k, v]) => [k, { ...v }]));
    const balances = new Map(this.balances);
    const movements = this.movements.map((m) => ({ ...m }));
    const journalEntries = this.journalEntries.map((e) => ({ ...e, lines: e.lines.map((l) => ({ ...l })) }));
    const auditLog = this.auditLog.map((a) => ({ ...a }));
    const transactionLog = new Map([...this.transactionLog].map(([k, v]) => [k, { ...v, movementIds: [...v.movementIds] }]));
    const seq = this.seq;
    return () => {
      this.products = products;
      this.balances = balances;
      this.movements = movements;
      this.journalEntries = journalEntries;
      this.auditLog = auditLog;
      this.transactionLog = transactionLog;
      this.seq = seq;
    };
  }
}

const TRANSFER_MODES = new Set(['transfer_out', 'transfer_in']);

export class FakeInventoryTransactionExecutor implements InventoryTransactionExecutor {
  constructor(private readonly store: FakeInventoryStore) {}

  async execute(request: InventoryTransactionRequest): Promise<InventoryTransactionResult> {
    const rollback = this.store.snapshot();
    try {
      return await this.executeInner(request);
    } catch (err) {
      rollback(); // atomic: a failed posting leaves the store untouched
      throw err;
    }
  }

  private async executeInner(request: InventoryTransactionRequest): Promise<InventoryTransactionResult> {
    const s = this.store;

    // 1. idempotency
    const existing = s.transactionLog.get(request.postingKey);
    if (existing) {
      return {
        idempotent: true,
        transactionLogId: existing.id,
        journalEntryId: existing.journalEntryId,
        movementIds: existing.movementIds,
        warnings: [],
      };
    }
    const logRow: FakeLogRow = {
      id: s.id('itl'),
      postingKey: request.postingKey,
      sourceType: request.sourceType,
      sourceId: request.sourceId,
      kind: 'post',
      movementIds: [],
    };

    const movementIds: ID[] = [];
    const warnings: string[] = [];
    const invJournal: FakeJournalLine[] = [];

    for (const line of request.lines) {
      if (line.nonStock) continue;
      const product = s.products.get(line.productId);
      if (!product || product.companyId !== s.companyId) {
        throw new Error(`FakeExecutor: product ${line.productId} not in company`);
      }
      const companyQty = product.quantityOnHand;
      let movementCost: number;
      let movementType: string;

      if (line.costingMode === 'receipt' || line.costingMode === 'opening') {
        if (line.unitCostIn == null) throw new Error(`FakeExecutor: ${line.costingMode} needs unitCostIn`);
        movementCost = roundCost(line.unitCostIn);
        // WAC blend via the ONE authoritative contract — same rule the RPC
        // implements in exact `numeric` (migration 0031/0032 line 153).
        product.costPrice = newWeightedAverageCost(
          companyQty,
          product.costPrice,
          line.quantityDelta,
          line.unitCostIn,
        );
        movementType = line.costingMode === 'opening' ? 'opening' : 'goods_received';
      } else if (line.costingMode === 'issue' || line.costingMode === 'return_in') {
        movementCost = line.unitCostOverride != null ? roundCost(line.unitCostOverride) : product.costPrice;
        movementType = line.movementType ?? (line.costingMode === 'issue' ? 'sale' : 'sales_return');
      } else if (line.costingMode === 'transfer_out') {
        movementCost = product.costPrice;
        movementType = 'transfer_out';
      } else {
        movementCost = product.costPrice;
        movementType = 'transfer_in';
      }

      // Per-movement value at 2dp for the movement's own `totalCost` field
      // (`round(|qty| × cost, 2)` — the RPC's `stock_movements.total_cost`).
      const movementValue = lineValue(line.quantityDelta, movementCost);
      // RAW value for the round-after-sum GL aggregation (migration 0035): the
      // per-account bucket is rounded once, not per line.
      const movementValueRaw = rawLineValue(line.quantityDelta, movementCost);

      // balance
      const bal = s.balance(line.productId, line.warehouseId) + line.quantityDelta;
      s.setBalance(line.productId, line.warehouseId, bal);
      if (bal < 0) warnings.push(`negative stock: product ${line.productId} warehouse ${line.warehouseId} -> ${bal}`);

      // company-wide qty (transfers are net-zero company-wide)
      if (!TRANSFER_MODES.has(line.costingMode)) product.quantityOnHand = companyQty + line.quantityDelta;

      const mvId = s.id('stkmv');
      s.movements.push({
        id: mvId,
        companyId: s.companyId,
        productId: line.productId,
        warehouseId: line.warehouseId,
        type: movementType,
        quantityDelta: line.quantityDelta,
        unitCost: movementCost,
        totalCost: movementValue,
        movementDate: request.movementDate,
        reference: `${request.sourceType}:${request.sourceId}`,
        sourceDocumentType: request.sourceType,
        sourceDocumentId: request.sourceId,
        sourceDocumentLineId: line.sourceDocumentLineId,
        createdBy: request.createdBy,
      });
      movementIds.push(mvId);

      if (line.inventoryAccountId && line.contraAccountId && movementValueRaw !== 0) {
        if (line.quantityDelta > 0) {
          invJournal.push({ accountId: line.inventoryAccountId, debit: movementValueRaw, credit: 0 });
          invJournal.push({ accountId: line.contraAccountId, debit: 0, credit: movementValueRaw });
        } else {
          invJournal.push({ accountId: line.contraAccountId, debit: movementValueRaw, credit: 0 });
          invJournal.push({ accountId: line.inventoryAccountId, debit: 0, credit: movementValueRaw });
        }
      }
    }

    // 4. journal: merge + aggregate by account
    const merged = [
      ...invJournal,
      ...(request.extraJournal ?? []).map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit })),
    ];
    const agg = aggregate(merged);
    let journalEntryId: ID | undefined;
    if (agg.length > 0) {
      const totalDr = roundMoney(agg.reduce((a, l) => a + l.debit, 0));
      const totalCr = roundMoney(agg.reduce((a, l) => a + l.credit, 0));
      if (Math.abs(totalDr - totalCr) > 0.005) {
        throw new Error(`FakeExecutor: unbalanced journal (dr ${totalDr} / cr ${totalCr})`);
      }
      journalEntryId = s.id('je');
      s.journalEntries.push({
        id: journalEntryId,
        companyId: s.companyId,
        entryNumber: `JE-${(s.journalEntries.length + 1).toString().padStart(4, '0')}`,
        source: request.journal?.source ?? request.sourceType,
        memo: request.journal?.memo,
        status: 'posted',
        lines: agg,
      });
      logRow.journalEntryId = journalEntryId;
    }

    logRow.movementIds = movementIds;
    s.transactionLog.set(request.postingKey, logRow);

    if (request.audit?.action) {
      s.auditLog.push({
        companyId: s.companyId,
        userId: request.createdBy,
        action: request.audit.action,
        module: request.audit.module ?? 'inventory',
        recordType: request.audit.recordType ?? request.sourceType,
        recordId: request.audit.recordId ?? request.sourceId,
        reason: request.audit.reason,
      });
    }

    return { idempotent: false, transactionLogId: logRow.id, journalEntryId, movementIds, warnings };
  }

  async reverse(request: InventoryReversalRequest): Promise<InventoryTransactionResult> {
    const rollback = this.store.snapshot();
    try {
      return await this.reverseInner(request);
    } catch (err) {
      rollback();
      throw err;
    }
  }

  private async reverseInner(request: InventoryReversalRequest): Promise<InventoryTransactionResult> {
    const s = this.store;
    const existing = s.transactionLog.get(request.postingKey);
    if (existing) {
      // Migration 0035: the idempotent-reversal branch returns the stored
      // correction-movement ids + an empty warnings array — shape-identical to
      // the non-idempotent reversal result and to both `execute` branches.
      return {
        idempotent: true,
        transactionLogId: existing.id,
        journalEntryId: existing.journalEntryId,
        movementIds: existing.movementIds,
        warnings: [],
      };
    }
    const orig = s.transactionLog.get(request.originalPostingKey);
    if (!orig) throw new Error(`FakeExecutor: original posting ${request.originalPostingKey} not found`);

    const logRow: FakeLogRow = {
      id: s.id('itl'),
      postingKey: request.postingKey,
      sourceType: orig.sourceType,
      sourceId: orig.sourceId,
      kind: 'reversal',
      movementIds: [],
      reversesTransactionId: orig.id,
    };

    const newMovementIds: ID[] = [];
    for (const mvId of orig.movementIds) {
      const mv = s.movements.find((m) => m.id === mvId);
      if (!mv) continue;
      const revId = s.id('stkmv');
      s.movements.push({
        ...mv,
        id: revId,
        type: 'correction',
        quantityDelta: -mv.quantityDelta,
        movementDate: request.movementDate,
        reference: `reversal:${orig.sourceId}`,
        sourceDocumentType: 'reversal',
        createdBy: request.createdBy,
        reversalOfMovementId: mv.id,
      });
      newMovementIds.push(revId);
      s.setBalance(mv.productId, mv.warehouseId, s.balance(mv.productId, mv.warehouseId) - mv.quantityDelta);
      if (mv.type !== 'transfer_out' && mv.type !== 'transfer_in') {
        const p = s.products.get(mv.productId);
        if (p) p.quantityOnHand -= mv.quantityDelta;
      }
    }
    // reversal never recomputes cost_price — a reversal is not a re-pricing event.

    let journalEntryId: ID | undefined;
    if (orig.journalEntryId) {
      const origJe = s.journalEntries.find((e) => e.id === orig.journalEntryId);
      if (origJe) {
        journalEntryId = s.id('je');
        s.journalEntries.push({
          id: journalEntryId,
          companyId: s.companyId,
          entryNumber: `JE-${(s.journalEntries.length + 1).toString().padStart(4, '0')}`,
          source: 'reversal',
          memo: `Reversal of ${origJe.entryNumber}${request.reason ? ` — ${request.reason}` : ''}`,
          status: 'posted',
          reversalOfEntryId: origJe.id,
          lines: origJe.lines.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit })),
        });
        origJe.status = 'reversed';
        logRow.journalEntryId = journalEntryId;
      }
    }
    logRow.movementIds = newMovementIds;
    s.transactionLog.set(request.postingKey, logRow);

    if (request.audit?.action) {
      s.auditLog.push({
        companyId: s.companyId,
        userId: request.createdBy,
        action: request.audit.action,
        module: 'inventory',
        recordType: request.audit.recordType ?? orig.sourceType,
        recordId: request.audit.recordId ?? orig.sourceId,
        reason: request.reason,
      });
    }

    return { idempotent: false, transactionLogId: logRow.id, journalEntryId, movementIds: newMovementIds, warnings: [] };
  }
}

/**
 * Aggregate journal lines by account exactly as migration 0035's RPC does:
 *   agg  = round(Σ debit, 2), round(Σ credit, 2)   -- per account, ROUND AFTER SUM
 *   net  = greatest(d - c, 0), greatest(c - d, 0)  -- on the already-rounded pair
 * drop all-zero lines, sort by account id (`order by aid`).
 */
function aggregate(lines: FakeJournalLine[]): FakeJournalLine[] {
  const byAccount = new Map<ID, { d: number; c: number }>();
  for (const l of lines) {
    const cur = byAccount.get(l.accountId) ?? { d: 0, c: 0 };
    cur.d += l.debit;
    cur.c += l.credit;
    byAccount.set(l.accountId, cur);
  }
  const out: FakeJournalLine[] = [];
  for (const [accountId, { d, c }] of byAccount) {
    const dr = roundMoney(d);
    const cr = roundMoney(c);
    const nd = Math.max(roundMoney(dr - cr), 0);
    const nc = Math.max(roundMoney(cr - dr), 0);
    if (nd !== 0 || nc !== 0) out.push({ accountId, debit: nd, credit: nc });
  }
  return out.sort((a, b) => (a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0));
}
