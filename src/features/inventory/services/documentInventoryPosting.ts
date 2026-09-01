import type { DocumentLineItem, ID, Product, Warehouse } from '@/types';
import type {
  InventoryTransactionRequest,
  InventoryTransactionResult,
  OpenPeriodGuard,
} from './inventoryPostingEngine';
import type { IDocumentLineProjector } from '@/repositories/IDocumentLineProjector';

/**
 * Shared glue between the Sales / Purchases document services
 * (invoiceService / billService / purchaseOrderService / creditNoteService)
 * and the ONE atomic inventory posting engine.
 *
 * Phase 3 move: each of those services stopped building a full journal and
 * posting it through `journalEntryService`, then fanning per-line stock
 * calls out with `Promise.all`. They now build ONLY their non-inventory
 * journal lines (AR / revenue / VAT / AP / expense / fixed asset) and hand
 * them to `engine.applyInventoryTransaction()` as `extraJournal` alongside
 * the inventory `lines`. The engine computes COGS / inventory from WAC
 * inside the atomic RPC, merges, and posts ONE balanced entry — records
 * movements + balances + WAC + idempotency key in the same transaction.
 * There is no second journal post and no separate stock call.
 */

/** Narrow engine surface these services depend on (the real `InventoryPostingEngine` satisfies it). */
export interface InventoryTransactionPoster {
  applyInventoryTransaction(request: InventoryTransactionRequest): Promise<InventoryTransactionResult>;
}

/** Product-by-id lookup — the shared `productService` singleton satisfies this. */
export interface DocumentProductLookup {
  getProduct(id: ID): Promise<Product | undefined>;
}

/** Warehouse resolution surface — the shared `warehouseService` singleton satisfies this. */
export interface DocumentWarehouseResolver {
  getWarehouse(id: ID): Promise<Warehouse | undefined>;
  getDefaultWarehouse(): Promise<Warehouse | undefined>;
}

/** Every movement records a plain `yyyy-mm-dd` date; document dates are sometimes full ISO. */
export function toMovementDate(date: string): string {
  return typeof date === 'string' && date.length >= 10 ? date.slice(0, 10) : date;
}

/**
 * Best-effort warehouse id for a line: the explicit one if it resolves to a
 * real warehouse, else the single default warehouse, else `undefined`.
 */
export async function resolveWarehouseId(
  warehouses: DocumentWarehouseResolver,
  lineWarehouseId: ID | null | undefined,
): Promise<ID | undefined> {
  if (lineWarehouseId) {
    const explicit = await warehouses.getWarehouse(lineWarehouseId);
    if (explicit) return explicit.id;
  }
  const fallback = await warehouses.getDefaultWarehouse();
  return fallback?.id;
}

/**
 * The warehouse a tracked-inventory movement must post against, or a loud
 * failure. Phase 0 bug fix: a sale / receipt / return for a tracked product
 * must NEVER book its revenue / expense side while the stock movement is
 * silently skipped because no warehouse resolved.
 */
export async function requireWarehouseId(
  warehouses: DocumentWarehouseResolver,
  lineWarehouseId: ID | null | undefined,
  docLabel: string,
): Promise<ID> {
  const resolved = await resolveWarehouseId(warehouses, lineWarehouseId);
  if (resolved) return resolved;
  throw new Error(
    `${docLabel}: cannot post — a tracked-inventory line has no warehouse and no default warehouse is configured. ` +
      `Assign a warehouse to the line or set a default warehouse (Inventory → Warehouses) before posting.`,
  );
}

/**
 * Best-effort call into an `IDocumentLineProjector` (Phase 9B —
 * docs/ACCOUNTING_RELATIONSHIPS.md §17-18, docs/PHASE_9B_DESIGN.md). The
 * projection table is explicitly NOT authoritative — a failure here must
 * never fail (or roll back) the document write it accompanies, so this
 * swallows any error, logging a warning instead of throwing. With
 * `NORMALIZED_DOCUMENT_LINES_ENABLED` false (the default —
 * src/config/featureFlags.ts), `projector.sync()` itself already no-ops, so
 * this call is inert; this wrapper is what stays safe even once that flag
 * flips true and the underlying table/RPC has some transient problem.
 */
export async function projectDocumentLinesBestEffort(
  projector: IDocumentLineProjector,
  documentId: ID,
  lines: readonly DocumentLineItem[],
  docLabel: string,
): Promise<void> {
  try {
    await projector.sync(documentId, lines);
  } catch (error) {
    console.warn(`${docLabel}: normalized line projection failed (jsonb lineItems remains authoritative and unaffected):`, error);
  }
}

/** Anything that can answer "which accounting period covers this date" (AccountingPeriodService does). */
export interface PeriodLookup {
  getPeriodForDate(date: string): Promise<{ name: string; status: string } | undefined>;
}

/**
 * An `OpenPeriodGuard` for the engine, reproducing `journalEntryService`'s
 * pre-existing "must be an open period" rule so routing these documents
 * through the engine doesn't lose it. Error text matches the old one.
 */
export function periodGuardFrom(periods: PeriodLookup): OpenPeriodGuard {
  return {
    async assertOpenForDate(isoDate: string): Promise<void> {
      const period = await periods.getPeriodForDate(isoDate);
      if (!period) {
        throw new Error(`Cannot post: no accounting period is defined for ${isoDate}.`);
      }
      if (period.status !== 'open') {
        throw new Error(`Cannot post: accounting period "${period.name}" is ${period.status}, not open.`);
      }
    },
  };
}
