import type { AuditAction, ID, StockMovementType } from '@/types';
import { newWeightedAverageCost, lineValue, roundMoney } from './inventoryValuation';

/**
 * The ONE authoritative inventory posting engine (Review 3B, item 3).
 *
 * Every financially-significant inventory workflow — purchase receipt, sale /
 * COGS, sales return, supplier return, adjustment, write-off, stock take,
 * opening stock, in-transit transfer, reversal — calls
 * `applyInventoryTransaction()` / `reverseInventoryTransaction()`. There is no
 * second implementation of "record a movement / move a balance / compute WAC /
 * post a journal / write audit".
 *
 * ── Atomicity (item 4) ──────────────────────────────────────────────────
 * The real executor is a SINGLE Postgres RPC (`post_inventory_transaction`,
 * migration 0031). Inside one implicit transaction it locks every referenced
 * product, records the movements + balances + WAC + one journal entry + the
 * audit row + the idempotency key. Either everything commits or nothing does —
 * a partial "stock changed but GL didn't" state is impossible. The Supabase JS
 * client cannot open a client-side transaction, so a server function is the
 * only correct fit.
 *
 * ── Idempotency (item 5) ────────────────────────────────────────────────
 * `postingKey` (e.g. `invoice:<uuid>:post`) is a UNIQUE key on
 * `inventory_transaction_log`. A retry (double-click, network timeout after
 * commit, service retry) inserts nothing and returns the first result. A retry
 * after a *rolled-back* attempt starts clean because the log row rolled back too.
 *
 * ── WAC race (item 6) ───────────────────────────────────────────────────
 * The RPC `SELECT … FROM products … ORDER BY id FOR UPDATE`s every referenced
 * product before touching cost. Two concurrent receipts for the same product
 * serialise: the second blocks until the first commits, then reads the updated
 * `cost_price`. Deterministic. `ORDER BY id` avoids deadlocks across multi-line
 * transactions.
 *
 * ── WAC & valuation contract (items 7-8) ────────────────────────────────
 * WAC blend and money rounding are defined once in `inventoryValuation.ts`; the
 * RPC implements the identical rules in exact `numeric`. Valuation is
 * ROUND-AFTER-SUM everywhere.
 */

export type InventoryCostingMode =
  | 'receipt' // stock IN at a real acquisition cost — WAC blends
  | 'opening' // opening stock — establishes cost (WAC blend, or = cost on an empty product)
  | 'issue' // stock OUT at current WAC — WAC unchanged
  | 'return_in' // stock IN at current WAC (a return, a gain) — WAC unchanged
  | 'transfer_out' // warehouse dispatch — company qty unchanged
  | 'transfer_in'; // warehouse receipt — company qty unchanged

export interface InventoryTransactionLine {
  productId: ID;
  warehouseId: ID;
  /** Signed change. `receipt`/`opening`/`return_in`/`transfer_in` > 0; `issue`/`transfer_out` < 0. */
  quantityDelta: number;
  costingMode: InventoryCostingMode;
  /** Required for `receipt` / `opening`: the real per-unit acquisition cost. */
  unitCostIn?: number;
  /**
   * `issue` / `return_in` only: value this movement (and its GL line) at THIS
   * cost instead of the product's *current* weighted-average cost. Used where
   * the document owns a frozen cost — a stock take's snapshot WAC, an
   * adjustment line's entered cost. The product's WAC is still never changed by
   * these modes. When omitted, current WAC is used.
   */
  unitCostOverride?: number;
  /** Required for `issue` / `return_in`: the concrete movement type (sale, sales_return, write_off, stock_gain, stock_take, purchase_return). */
  movementType?: StockMovementType;
  /** The normalized source-document line UUID — retained on the movement for full traceability. */
  sourceDocumentLineId?: ID;
  /** GL account for the inventory side of this line (resolved by the caller via InventoryAccountResolver). */
  inventoryAccountId?: ID;
  /** GL account for the contra side (COGS / Inventory Adjustments / GRNI / AP / Inventory in Transit / Opening Balance Equity). */
  contraAccountId?: ID;
  /** A service / non-tracked product line — skipped entirely (no movement, no journal). */
  nonStock?: boolean;
}

export interface ExtraJournalLine {
  accountId: ID;
  debit: number;
  credit: number;
  description?: string;
}

export interface InventoryTransactionRequest {
  /** Idempotency key: `<sourceType>:<sourceId>:<verb>`. */
  postingKey: string;
  sourceType: string;
  sourceId: ID;
  /** ISO date (yyyy-mm-dd) recorded on every movement. */
  movementDate: string;
  createdBy: ID;
  lines: InventoryTransactionLine[];
  /** The non-inventory journal lines the caller already knows (AR / revenue / VAT / AP / expense / fixed asset). Merged + aggregated with the engine-computed inventory lines. */
  extraJournal?: ExtraJournalLine[];
  journal?: { source?: string; memo?: string; currency?: string };
  audit?: {
    action: AuditAction;
    module?: string;
    recordType?: string;
    recordId?: string;
    reason?: string;
    newValue?: unknown;
  };
}

export interface InventoryReversalRequest {
  postingKey: string;
  originalPostingKey: string;
  movementDate: string;
  createdBy: ID;
  reason?: string;
  audit?: { action: AuditAction; recordType?: string; recordId?: string };
}

export interface InventoryTransactionResult {
  idempotent: boolean;
  transactionLogId: ID;
  journalEntryId?: ID;
  movementIds: ID[];
  warnings: string[];
}

/**
 * The atomic executor. `RealInventoryTransactionExecutor` calls the Postgres
 * RPC; `FakeInventoryTransactionExecutor` (see `inventoryPostingEngine.fake.ts`)
 * mirrors the RPC's exact logic over in-memory stores for tests.
 */
export interface InventoryTransactionExecutor {
  execute(request: InventoryTransactionRequest): Promise<InventoryTransactionResult>;
  reverse(request: InventoryReversalRequest): Promise<InventoryTransactionResult>;
}

/** Optional guard: reject a posting whose movement date is not in an open accounting period (matches the pre-existing `journalEntryService` pattern — the check is done before the RPC, same tiny window every other posting has). */
export interface OpenPeriodGuard {
  assertOpenForDate(isoDate: string): Promise<void>;
}

export class InventoryPostingEngine {
  constructor(
    private readonly executor: InventoryTransactionExecutor,
    private readonly periodGuard?: OpenPeriodGuard,
  ) {}

  async applyInventoryTransaction(request: InventoryTransactionRequest): Promise<InventoryTransactionResult> {
    validateRequest(request);
    if (this.periodGuard) await this.periodGuard.assertOpenForDate(request.movementDate);
    return this.executor.execute(request);
  }

  async reverseInventoryTransaction(request: InventoryReversalRequest): Promise<InventoryTransactionResult> {
    if (this.periodGuard) await this.periodGuard.assertOpenForDate(request.movementDate);
    return this.executor.reverse(request);
  }
}

function validateRequest(request: InventoryTransactionRequest): void {
  if (!request.postingKey) throw new Error('InventoryPostingEngine: postingKey is required (idempotency)');
  for (const line of request.lines) {
    if (line.nonStock) continue;
    if ((line.costingMode === 'receipt' || line.costingMode === 'opening') && line.unitCostIn == null) {
      throw new Error(`InventoryPostingEngine: ${line.costingMode} line needs unitCostIn`);
    }
    if ((line.costingMode === 'issue' || line.costingMode === 'return_in') && !line.movementType) {
      throw new Error(`InventoryPostingEngine: ${line.costingMode} line needs movementType`);
    }
    const inDir = line.quantityDelta > 0;
    const wantsIn = ['receipt', 'opening', 'return_in', 'transfer_in'].includes(line.costingMode);
    if (line.quantityDelta !== 0 && inDir !== wantsIn) {
      throw new Error(
        `InventoryPostingEngine: ${line.costingMode} line has quantityDelta ${line.quantityDelta} with the wrong sign`,
      );
    }
  }
}

// Re-export the valuation primitives the workflow services need when building
// `extraJournal` (so they never re-implement rounding).
export { newWeightedAverageCost, lineValue, roundMoney };
