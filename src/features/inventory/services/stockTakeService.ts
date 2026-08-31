import type { AuditAction, ID, NewStockTakeLine, StockTake, StockTakeLine } from '@/types';
import { roundToCents } from '@/features/accounting/services';
import { auditLogService } from '@/services/auditLogService';
import type { IStockTakeRepository } from '../repositories/IStockTakeRepository';
import { stockTakeRepository } from '../repositories/instances';
import type { InventoryPostingEngine, InventoryTransactionLine } from './inventoryPostingEngine';
import type { InventoryAccountResolver } from './inventoryAccountResolver';
import {
  inventoryAccountResolver,
  periodGuardedInventoryPostingEngine,
  postingProductLookup,
  stockTakeFreezeExecutor,
  type PostingProductLookup,
} from './inventoryPostingEngineInstance';

/**
 * Minimal surface of AuditLogService this service depends on — an
 * interface, not the concrete class, mirroring fixedAssetService.ts's
 * JournalPoster so this stays unit-testable with a stub. The inventory
 * `AuditAction` values (`stock_take_posted` etc.) are on the union in
 * src/types/auditLog.ts (the audit column is `text`, no migration).
 */
export interface AuditLogger {
  log(input: {
    userId: ID;
    action: AuditAction;
    module: string;
    recordType: string;
    recordId: ID;
    previousValue?: unknown;
    newValue?: unknown;
    reason?: string;
  }): Promise<unknown>;
}

export type CreateStockTakeDTO = Omit<
  StockTake,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'stockTakeNumber'
  | 'status'
  | 'totalVarianceValue'
  | 'frozenAt'
  | 'approvedBy'
  | 'approvedAt'
  | 'postedBy'
  | 'postedAt'
  | 'journalEntryId'
>;
export type UpdateStockTakeDTO = Partial<CreateStockTakeDTO>;

/** One entered count for `enterCounts()`. */
export interface StockTakeCountInput {
  lineId: ID;
  countedQty: number;
}

/**
 * The ONE atomic stock-take freeze operation (Phase 3C item 6). The caller
 * supplies SCOPE only (`stock_takes.scope` + `scope_ref`); the executor derives
 * the authoritative snapshot — `expectedQty` from the per-warehouse balance and
 * the frozen `unitCost` from the product's weighted-average cost — for the whole
 * scope in ONE coherent database state, so no unrelated receipt / sale /
 * transfer can interleave and produce a mixed-time snapshot.
 *
 * Production impl: one call to `public.freeze_stock_take` (migration 0036).
 * Test impl: mirrors that SQL over the in-memory fake store.
 */
export interface StockTakeFreezeExecutor {
  freeze(stockTakeId: ID): Promise<{ frozenAt: string; lineCount: number }>;
}

/**
 * `varianceQty = countedQty − expectedQty`; `varianceValue = varianceQty ×
 * unitCost` (rounded per line, then summed — the precision house rule in
 * docs/INVENTORY_ACCOUNTING.md § Costing). A line with no count entered yet
 * carries zero variance.
 */
function recomputeVariance(lines: StockTakeLine[]): {
  lineItems: StockTakeLine[];
  totalVarianceValue: number;
} {
  const lineItems = lines.map((line) => {
    const varianceQty = line.countedQty === undefined ? 0 : line.countedQty - line.expectedQty;
    const varianceValue = roundToCents(varianceQty * line.unitCost);
    return { ...line, varianceQty, varianceValue };
  });
  const totalVarianceValue = roundToCents(lineItems.reduce((sum, l) => sum + l.varianceValue, 0));
  return { lineItems, totalVarianceValue };
}

/**
 * Business-logic layer for physical stock counts (migration 0028,
 * docs/INVENTORY_ACCOUNTING.md § "Stock take"). Same create-draft-then-
 * explicit-transition shape as fixedAssetService / purchaseOrderService.
 *
 * Lifecycle: `draft → counting → ready_for_review → posted` (or
 * `cancelled`). A posted stock take is immutable.
 *
 * PHASE 2 SKELETON: `postStockTake()` transitions status and writes the
 * audit row but does NOT yet post GL or record stock movements — that is
 * Phase 3 (see the stub comment in `postStockTake`).
 */
export class StockTakeService {
  constructor(
    private readonly repository: IStockTakeRepository,
    private readonly auditLog: AuditLogger,
    private readonly engine?: InventoryPostingEngine,
    private readonly accountResolver?: InventoryAccountResolver,
    private readonly products?: PostingProductLookup,
    private readonly freezeExecutor?: StockTakeFreezeExecutor,
  ) {}

  private get canPost(): boolean {
    return Boolean(this.engine && this.accountResolver && this.products);
  }

  async getStockTakes(): Promise<StockTake[]> {
    return this.repository.getAll();
  }

  async getStockTake(id: ID): Promise<StockTake | undefined> {
    return this.repository.getById(id);
  }
  async addLine(id: ID,line: NewStockTakeLine): Promise<StockTake> { await this.requireDraft(id); await this.repository.createLine(id,line); return this.refreshTotal(id); }
  async updateLine(id: ID,lineId: ID,patch: Partial<NewStockTakeLine>): Promise<StockTake> { await this.requireDraft(id); await this.repository.updateLine(id,lineId,patch); return this.refreshTotal(id); }
  async deleteLine(id: ID,lineId: ID): Promise<StockTake> { await this.requireDraft(id); await this.repository.deleteLine(id,lineId); return this.refreshTotal(id); }

  async createStockTake(data: CreateStockTakeDTO): Promise<StockTake> {
    const now = new Date().toISOString();
    const { lineItems, totalVarianceValue } = recomputeVariance(data.lineItems ?? []);
    const { lineItems: _lineItems, ...headerData } = data;
    void _lineItems;
    const created = await this.repository.createHeader({
      ...headerData,
      id: '',
      stockTakeNumber: await this.nextStockTakeNumber(),
      totalVarianceValue,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
    for (const { stockTakeId: _parentId, ...line } of lineItems) { void _parentId; await this.repository.createLine(created.id, line); }
    return this.requireStockTake(created.id);
  }

  /** Edits are draft-only — once counting starts the count sheet is live. */
  async updateStockTake(id: ID, patch: UpdateStockTakeDTO): Promise<StockTake> {
    const stockTake = await this.requireStockTake(id);
    if (stockTake.status !== 'draft') {
      throw new Error(
        `Cannot edit "${stockTake.stockTakeNumber}": only a draft stock take can be edited (current status: ${stockTake.status}). Use enterCounts() while counting.`,
      );
    }
    const { lineItems: replacementLines, ...headerPatch } = patch;
    const nextLines = replacementLines ?? stockTake.lineItems;
    const { lineItems, totalVarianceValue } = recomputeVariance(nextLines);
    await this.repository.updateHeader(id, { ...headerPatch, totalVarianceValue });
    if (replacementLines) await this.replaceLines(id, lineItems);
    return this.requireStockTake(id);
  }

  /** Permanently removes a draft stock take. Anything past draft has a frozen count sheet (or posted GL history) behind it. */
  async deleteStockTake(id: ID): Promise<void> {
    const stockTake = await this.requireStockTake(id);
    if (stockTake.status !== 'draft') {
      throw new Error(
        `Cannot delete "${stockTake.stockTakeNumber}": only a draft stock take can be deleted (current status: ${stockTake.status}).`,
      );
    }
    return this.repository.deleteHeader(id);
  }

  /**
   * Freezes the count sheet: `draft → counting`, atomically snapshotting the
   * authoritative `expectedQty` (per-warehouse balance) and frozen `unitCost`
   * (weighted-average cost) for every product in the take's SCOPE, and
   * stamping `frozenAt` (Phase 3C item 6, docs/INVENTORY_ACCOUNTING.md §
   * "Stock take").
   *
   * The caller supplies scope only — any lines a draft take accumulated are
   * replaced by the snapshot the executor computes. Once frozen the expected
   * quantity and unit cost are immutable: later movement never rewrites them,
   * and `postStockTake()` posts `countedQty − expectedQty` at the frozen
   * `unitCost`.
   */
  async freeze(id: ID): Promise<StockTake> {
    const stockTake = await this.requireStockTake(id);
    if (stockTake.status !== 'draft') {
      throw new Error(
        `Cannot freeze "${stockTake.stockTakeNumber}": it must be draft (current status: ${stockTake.status}).`,
      );
    }
    if (stockTake.frozenAt) {
      throw new Error(
        `Cannot freeze "${stockTake.stockTakeNumber}": it is already frozen (${stockTake.frozenAt}).`,
      );
    }
    if (!this.freezeExecutor) {
      throw new Error(
        `Cannot freeze "${stockTake.stockTakeNumber}": the stock-take freeze operation is not available in this context.`,
      );
    }
    await this.freezeExecutor.freeze(id);
    return this.requireStockTake(id);
  }

  /**
   * Records entered/imported counts against a frozen sheet (status
   * `counting` only) and recomputes every line's variance plus
   * `totalVarianceValue`.
   */
  async enterCounts(id: ID, counts: StockTakeCountInput[]): Promise<StockTake> {
    const stockTake = await this.requireStockTake(id);
    if (stockTake.status !== 'counting') {
      throw new Error(
        `Cannot enter counts on "${stockTake.stockTakeNumber}": it must be frozen for counting first (current status: ${stockTake.status}).`,
      );
    }
    const byLine = new Map(counts.map((c) => [c.lineId, c.countedQty]));
    const merged = stockTake.lineItems.map((line) =>
      byLine.has(line.id) ? { ...line, countedQty: byLine.get(line.id) } : line,
    );
    const { lineItems, totalVarianceValue } = recomputeVariance(merged);
    for (const line of lineItems) {
      const { id: lineId, stockTakeId: _parentId, ...values } = line;
      void _parentId;
      await this.repository.updateLine(id, lineId, values);
    }
    return this.repository.updateHeader(id, { totalVarianceValue });
  }

  async markReadyForReview(id: ID): Promise<StockTake> {
    const stockTake = await this.requireStockTake(id);
    if (stockTake.status !== 'counting') {
      throw new Error(
        `Cannot mark "${stockTake.stockTakeNumber}" ready for review: it must be counting (current status: ${stockTake.status}).`,
      );
    }
    if (stockTake.lineItems.length === 0) throw new Error(`Cannot mark "${stockTake.stockTakeNumber}" ready for review: add at least one line.`);
    return this.repository.updateHeader(id, { status: 'ready_for_review' });
  }

  /**
   * Posts the stock take: `ready_for_review → posted`, stamps
   * `postedBy`/`postedAt`, writes the audit row.
   *
   * PHASE 3 STUB — docs/INVENTORY_ACCOUNTING.md § "Stock take": this would
   * (a) record one `stock_take` movement per non-zero-variance line
   * (`quantityDelta = countedQty − expectedQty`, `unit_cost` = frozen WAC),
   * and (b) post ONE balanced GL entry for the NET variance value
   * (net loss → DR INVENTORY_ADJUSTMENT / CR <inventory>; net gain → the
   * reverse; category-bucketed), then set `journalEntryId`. No GL / stock
   * mutation happens in Phase 2.
   */
  async postStockTake(id: ID, postedByUserId?: ID): Promise<StockTake> {
    const stockTake = await this.requireStockTake(id);
    if (stockTake.status !== 'ready_for_review') {
      throw new Error(
        `Cannot post "${stockTake.stockTakeNumber}": it must be ready_for_review (current status: ${stockTake.status}).`,
      );
    }

    // Phase 3 (docs/INVENTORY_ACCOUNTING.md § "Stock take"): one `stock_take`
    // movement per non-zero-variance line at the FROZEN unit cost, and ONE
    // balanced GL entry for the NET variance (net loss → DR INVENTORY_ADJUSTMENT
    // / CR inventory; net gain → the reverse). The engine nets it into a single
    // entry. Zero-variance lines are omitted. `stock_take:<id>:post` is idempotent.
    let journalEntryId: ID | undefined;
    if (this.canPost) {
      journalEntryId = await this.postToEngine(stockTake, postedByUserId ?? 'system');
    }

    const now = new Date().toISOString();
    const posted = await this.repository.updateHeader(id, {
      status: 'posted',
      postedBy: postedByUserId,
      postedAt: now,
      ...(journalEntryId ? { journalEntryId } : {}),
    });

    if (!this.canPost) {
      await this.auditLog.log({
        userId: postedByUserId ?? 'system',
        action: 'stock_take_posted',
        module: 'inventory',
        recordType: 'StockTake',
        recordId: id,
        newValue: { status: 'posted', totalVarianceValue: posted.totalVarianceValue },
      });
    }

    return posted;
  }

  /** Applies the one net-variance inventory transaction for a stock-take post. */
  private async postToEngine(stockTake: StockTake, postedBy: ID): Promise<ID | undefined> {
    const lines: InventoryTransactionLine[] = [];
    for (const line of stockTake.lineItems) {
      if (line.varianceQty === 0) continue;
      const product = await this.products!.getById(line.productId);
      if (!product) {
        throw new Error(
          `Cannot post "${stockTake.stockTakeNumber}": product "${line.productId}" not found.`,
        );
      }
      const nonStock = !product.trackInventory;
      lines.push({
        productId: line.productId,
        warehouseId: line.warehouseId,
        quantityDelta: line.varianceQty,
        costingMode: line.varianceQty < 0 ? 'issue' : 'return_in',
        movementType: 'stock_take',
        // Post the variance at the count sheet's FROZEN unit cost (snapshotted
        // when the sheet was frozen), not the product's live WAC — the sheet
        // owns its cost, and the product's WAC is never moved by a stock take.
        unitCostOverride: line.unitCost,
        sourceDocumentLineId: line.id,
        nonStock,
        ...(nonStock
          ? {}
          : {
              inventoryAccountId: await this.accountResolver!.resolveForProduct(product, 'inventory'),
              contraAccountId: await this.accountResolver!.resolveForProduct(product, 'adjustment'),
            }),
      });
    }
    if (lines.length === 0) return undefined;

    const result = await this.engine!.applyInventoryTransaction({
      postingKey: `stock_take:${stockTake.id}:post`,
      sourceType: 'stock_take',
      sourceId: stockTake.id,
      movementDate: stockTake.countDate,
      createdBy: postedBy,
      lines,
      extraJournal: [],
      audit: { action: 'stock_take_posted', recordType: 'StockTake', recordId: stockTake.id },
    });
    return result.journalEntryId;
  }

  /** Cancels a stock take. A posted take is immutable and cannot be cancelled. */
  async cancelStockTake(id: ID): Promise<StockTake> {
    const stockTake = await this.requireStockTake(id);
    if (stockTake.status === 'posted') {
      throw new Error(`Cannot cancel "${stockTake.stockTakeNumber}": a posted stock take is immutable.`);
    }
    if (stockTake.status === 'cancelled') {
      return stockTake;
    }
    return this.repository.updateHeader(id, { status: 'cancelled' });
  }

  /** A sequential document number based on register size (a per-document-type counter, not the journal-number allocator). */
  private async nextStockTakeNumber(): Promise<string> {
    const all = await this.repository.getAll();
    return `STK-${String(all.length + 1).padStart(4, '0')}`;
  }

  private async requireStockTake(id: ID): Promise<StockTake> {
    const stockTake = await this.repository.getById(id);
    if (!stockTake) {
      throw new Error(`Stock take "${id}" not found.`);
    }
    return stockTake;
  }
  private async requireDraft(id: ID): Promise<void> { const document=await this.requireStockTake(id); if(document.status!=='draft') throw new Error('Only a draft stock take allows line changes.'); }
  private async refreshTotal(id: ID): Promise<StockTake> { const result=recomputeVariance(await this.repository.getLines(id)); await this.repository.updateHeader(id,{totalVarianceValue:result.totalVarianceValue}); return this.requireStockTake(id); }

  private async replaceLines(id: ID, lines: StockTakeLine[]): Promise<void> {
    const existing = await this.repository.getLines(id);
    const nextIds = new Set(lines.map((line) => line.id));
    for (const line of existing) if (!nextIds.has(line.id)) await this.repository.deleteLine(id, line.id);
    for (const { id: lineId, stockTakeId: _parentId, ...values } of lines) {
      void _parentId;
      if (existing.some((line) => line.id === lineId)) await this.repository.updateLine(id, lineId, values);
      else await this.repository.createLine(id, { id: lineId, ...values });
    }
  }
}

/** Singleton (Phase 3) — Supabase-backed via the shared `stockTakeRepository` (migration 0028 applied). */
export const stockTakeService = new StockTakeService(
  stockTakeRepository,
  auditLogService,
  periodGuardedInventoryPostingEngine,
  inventoryAccountResolver,
  postingProductLookup,
  stockTakeFreezeExecutor,
);
