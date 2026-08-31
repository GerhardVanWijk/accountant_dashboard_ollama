import type {
  AuditAction,
  ID,
  JournalEntry,
  NewStockAdjustmentLine,
  StockAdjustment,
  StockAdjustmentLine,
  StockMovementType,
} from '@/types';
import type { IStockAdjustmentRepository } from '../repositories/IStockAdjustmentRepository';
import type { NewJournalLineInput } from '@/features/accounting/services';
import { AuditLogService, auditLogService } from '@/services/auditLogService';
import { stockAdjustmentRepository } from '../repositories/instances';
import type { InventoryPostingEngine, InventoryTransactionLine } from './inventoryPostingEngine';
import type { InventoryAccountResolver } from './inventoryAccountResolver';
import {
  inventoryAccountResolver,
  periodGuardedInventoryPostingEngine,
  postingProductLookup,
  type PostingProductLookup,
} from './inventoryPostingEngineInstance';

/**
 * Minimal surface of JournalEntryService a real (Phase 3) posting flow
 * would depend on — an interface, not the concrete class, mirroring
 * fixedAssetService.ts's JournalPoster. Kept here so the Phase-3 wiring is
 * a one-line constructor change, not a re-architecture.
 */
export interface JournalPoster {
  postJournalEntry(input: {
    date: string;
    memo?: string;
    source: string;
    lines: NewJournalLineInput[];
    postedByUserId?: ID;
  }): Promise<JournalEntry>;
}

export type CreateStockAdjustmentDTO = Omit<
  StockAdjustment,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'adjustmentNumber'
  | 'status'
  | 'totalCostEffect'
  | 'approvedBy'
  | 'approvedAt'
  | 'postedBy'
  | 'postedAt'
  | 'journalEntryId'
>;
export type UpdateStockAdjustmentDTO = Partial<CreateStockAdjustmentDTO>;

/** Inventory-module audit actions (docs/INVENTORY_ACCOUNTING.md § Audit — on the `AuditAction` union; the column is `text`, no migration). */
const STOCK_ADJUSTED: AuditAction = 'stock_adjusted';
const STOCK_WRITTEN_OFF: AuditAction = 'stock_written_off';

/** Reasons that represent stock *leaving* the books (a write-off), vs a gain/correction. */
const WRITE_OFF_REASONS: ReadonlySet<StockAdjustment['reason']> = new Set(['write_off', 'shrinkage', 'damage']);

const SYSTEM_USER_ID = 'system';

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `totalCostEffect` is always Σ line.costEffect — recomputed here, never trusted from the caller. */
function sumCostEffect(lines: StockAdjustmentLine[]): number {
  return roundToCents(lines.reduce((total, line) => total + line.costEffect, 0));
}

/**
 * Business-logic layer for stock adjustments — write-off / shrinkage /
 * damage / stock gain / correction (migration 0027). Mirrors
 * fixedAssetService.ts's create-draft-then-explicit-post lifecycle so an
 * adjustment can be reviewed (and optionally approved) before it becomes
 * real, immutable accounting history.
 *
 * Lifecycle: `draft → (pending_approval) → posted`, or `→ cancelled` from
 * either pre-posted state. `posted` is terminal and immutable — a
 * correction is a brand-new adjustment (docs/INVENTORY_ACCOUNTING.md
 * § "Stock adjustment").
 *
 * PHASE 3: `postAdjustment()` currently only transitions status. The real
 * service posts the GL entry per docs/INVENTORY_ACCOUNTING.md
 * § "Stock adjustment" (loss: DR INVENTORY_ADJUSTMENT / CR category
 * inventory; gain: the reverse), records `write_off` / `stock_gain` /
 * `correction` stock movements, and sets `journalEntryId` — inject a
 * `JournalPoster` + `AccountMapper` + inventory movement recorder then.
 */
export class StockAdjustmentService {
  constructor(
    private readonly repository: IStockAdjustmentRepository,
    private readonly auditLog: AuditLogService,
    private readonly engine?: InventoryPostingEngine,
    private readonly accountResolver?: InventoryAccountResolver,
    private readonly products?: PostingProductLookup,
  ) {}

  /** True when this instance is wired to post real GL + stock movements (Phase 3). */
  private get canPost(): boolean {
    return Boolean(this.engine && this.accountResolver && this.products);
  }

  async getAdjustments(): Promise<StockAdjustment[]> {
    return this.repository.getAll();
  }

  async getAdjustment(id: ID): Promise<StockAdjustment | undefined> {
    return this.repository.getById(id);
  }

  async addLine(id: ID, line: NewStockAdjustmentLine): Promise<StockAdjustment> {
    await this.requireDraft(id); await this.repository.createLine(id, line); return this.refreshTotal(id);
  }
  async updateLine(id: ID, lineId: ID, patch: Partial<NewStockAdjustmentLine>): Promise<StockAdjustment> {
    await this.requireDraft(id); await this.repository.updateLine(id, lineId, patch); return this.refreshTotal(id);
  }
  async deleteLine(id: ID, lineId: ID): Promise<StockAdjustment> {
    await this.requireDraft(id); await this.repository.deleteLine(id, lineId); return this.refreshTotal(id);
  }

  async createAdjustment(data: CreateStockAdjustmentDTO): Promise<StockAdjustment> {
    const lineItems = data.lineItems ?? [];
    const { lineItems: _lineItems, ...headerData } = data;
    void _lineItems;
    const now = new Date().toISOString();
    const created = await this.repository.createHeader({
      ...headerData,
      id: '',
      adjustmentNumber: await this.nextAdjustmentNumber(),
      totalCostEffect: sumCostEffect(lineItems),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
    for (const { adjustmentId: _parentId, ...line } of lineItems) { void _parentId; await this.repository.createLine(created.id, line); }
    return this.requireAdjustment(created.id);
  }

  /** Only a `draft` adjustment can be edited — once past draft it drives (Phase 3) real posted GL history, same guard class as every other posted-document in this codebase. */
  async updateAdjustment(id: ID, patch: UpdateStockAdjustmentDTO): Promise<StockAdjustment> {
    const existing = await this.requireAdjustment(id);
    if (existing.status !== 'draft') {
      throw new Error(
        `Cannot edit "${existing.adjustmentNumber}": only a draft stock adjustment can be edited (current status: ${existing.status}).`,
      );
    }
    const { lineItems, ...headerPatch } = patch;
    await this.repository.updateHeader(id, {
      ...headerPatch,
      ...(lineItems ? { totalCostEffect: sumCostEffect(lineItems) } : {}),
    });
    if (lineItems) await this.replaceLines(id, lineItems);
    return this.requireAdjustment(id);
  }

  /** Permanently removes a draft adjustment. Anything past `draft` must be cancelled (or, once posted, corrected with a new adjustment) — never deleted. */
  async deleteAdjustment(id: ID): Promise<void> {
    const existing = await this.requireAdjustment(id);
    if (existing.status !== 'draft') {
      throw new Error(
        `Cannot delete "${existing.adjustmentNumber}": only a draft stock adjustment can be deleted (current status: ${existing.status}).`,
      );
    }
    return this.repository.deleteHeader(id);
  }

  /** `draft → pending_approval`. */
  async submitForApproval(id: ID): Promise<StockAdjustment> {
    const existing = await this.requireAdjustment(id);
    if (existing.status !== 'draft') {
      throw new Error(`Cannot submit "${existing.adjustmentNumber}" for approval (current status: ${existing.status}).`);
    }
    return this.repository.updateHeader(id, { status: 'pending_approval' });
  }

  /**
   * Records an approval marker (`approvedBy` / `approvedAt`) on a `draft`
   * or `pending_approval` adjustment. There is no dedicated `approved`
   * status — the timestamp IS the marker; Phase 3 gates `postAdjustment()`
   * on it where policy requires segregation of duties.
   */
  async approve(id: ID, approvedBy: ID = SYSTEM_USER_ID): Promise<StockAdjustment> {
    const existing = await this.requireAdjustment(id);
    if (existing.status !== 'draft' && existing.status !== 'pending_approval') {
      throw new Error(`Cannot approve "${existing.adjustmentNumber}" (current status: ${existing.status}).`);
    }
    return this.repository.updateHeader(id, { approvedBy, approvedAt: new Date().toISOString() });
  }

  /**
   * `draft | pending_approval → posted`. Sets `postedBy` / `postedAt` and
   * writes the audit trail. GL posting + stock movements land in Phase 3
   * (see the class doc comment) — this skeleton transitions status only.
   */
  async postAdjustment(id: ID, postedBy: ID = SYSTEM_USER_ID): Promise<StockAdjustment> {
    const existing = await this.requireAdjustment(id);
    if (existing.status !== 'draft' && existing.status !== 'pending_approval') {
      throw new Error(
        `Cannot post "${existing.adjustmentNumber}": expected a draft or pending-approval adjustment (current status: ${existing.status}).`,
      );
    }

    if (existing.lineItems.length === 0) throw new Error(`Cannot post "${existing.adjustmentNumber}": add at least one line.`);

    const isWriteOff = WRITE_OFF_REASONS.has(existing.reason);

    // Phase 3: ONE atomic inventory transaction — write_off / stock_gain / correction
    // movements + one balanced GL entry (loss: DR INVENTORY_ADJUSTMENT / CR inventory;
    // gain: the reverse), per docs/INVENTORY_ACCOUNTING.md § "Stock adjustment". The RPC
    // is idempotent on `stock_adjustment:<id>:post`, so the header update after it is
    // retry-safe. When this instance is not wired for posting (legacy Phase-2 callers),
    // this transitions status only.
    let journalEntryId: ID | undefined;
    if (this.canPost) {
      const result = await this.postToEngine(existing, postedBy, isWriteOff);
      journalEntryId = result.journalEntryId;
    }

    const posted = await this.repository.updateHeader(id, {
      status: 'posted',
      postedBy,
      postedAt: new Date().toISOString(),
      ...(journalEntryId ? { journalEntryId } : {}),
    });

    if (!this.canPost) {
      // The engine writes the audit row itself (see `postToEngine`); only log here
      // when we didn't route through it.
      await this.auditLog.log({
        userId: postedBy,
        action: isWriteOff ? STOCK_WRITTEN_OFF : STOCK_ADJUSTED,
        module: 'inventory',
        recordType: 'StockAdjustment',
        recordId: posted.id,
        newValue: posted,
        reason: posted.reason,
      });
    }

    return posted;
  }

  /**
   * Reverses a posted adjustment: a new, dated-now inventory transaction that
   * negates every movement and swaps the original journal entry
   * (docs/INVENTORY_ACCOUNTING.md § "Immutability & corrections"). The posted
   * adjustment stays immutable; its header moves to `cancelled`.
   */
  async reverseAdjustment(id: ID, reason: string, userId: ID = SYSTEM_USER_ID): Promise<StockAdjustment> {
    const existing = await this.requireAdjustment(id);
    if (existing.status !== 'posted') {
      throw new Error(
        `Cannot reverse "${existing.adjustmentNumber}": only a posted adjustment can be reversed (current status: ${existing.status}).`,
      );
    }

    if (this.canPost) {
      await this.engine!.reverseInventoryTransaction({
        postingKey: `stock_adjustment:${id}:reverse`,
        originalPostingKey: `stock_adjustment:${id}:post`,
        movementDate: new Date().toISOString().slice(0, 10),
        createdBy: userId,
        reason,
        audit: { action: 'reversed', recordType: 'StockAdjustment', recordId: id },
      });
    } else {
      await this.auditLog.log({
        userId,
        action: 'reversed',
        module: 'inventory',
        recordType: 'StockAdjustment',
        recordId: id,
        reason,
      });
    }

    return this.repository.updateHeader(id, { status: 'cancelled' });
  }

  /** Builds and applies the one inventory transaction for a stock adjustment post. */
  private async postToEngine(
    adjustment: StockAdjustment,
    postedBy: ID,
    isWriteOff: boolean,
  ): Promise<{ journalEntryId?: ID }> {
    const lines: InventoryTransactionLine[] = [];
    for (const line of adjustment.lineItems) {
      const product = await this.products!.getById(line.productId);
      if (!product) {
        throw new Error(
          `Cannot post "${adjustment.adjustmentNumber}": product "${line.productId}" not found.`,
        );
      }
      const nonStock = !product.trackInventory;
      const isLoss = line.quantityDelta < 0;
      const movementType: StockMovementType =
        isLoss && WRITE_OFF_REASONS.has(adjustment.reason)
          ? 'write_off'
          : !isLoss && adjustment.reason === 'stock_gain'
            ? 'stock_gain'
            : 'correction';
      lines.push({
        productId: line.productId,
        warehouseId: line.warehouseId,
        quantityDelta: line.quantityDelta,
        costingMode: isLoss ? 'issue' : 'return_in',
        movementType,
        // Post at the adjustment line's entered/approved unit cost, not the
        // product's live WAC. The `totalCostEffect` the approver signed off is
        // Σ quantityDelta × line.unitCost — the GL must match it exactly. Also
        // fixes a stock GAIN on a product currently at 0 qty / 0 WAC, which
        // would otherwise post a zero-value journal and silently drop the gain.
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

    const result = await this.engine!.applyInventoryTransaction({
      postingKey: `stock_adjustment:${adjustment.id}:post`,
      sourceType: 'stock_adjustment',
      sourceId: adjustment.id,
      movementDate: adjustment.adjustmentDate,
      createdBy: postedBy,
      lines,
      extraJournal: [],
      audit: {
        action: isWriteOff ? STOCK_WRITTEN_OFF : STOCK_ADJUSTED,
        recordType: 'StockAdjustment',
        recordId: adjustment.id,
        reason: adjustment.notes,
      },
    });
    return { journalEntryId: result.journalEntryId };
  }

  /** `draft | pending_approval → cancelled`. A posted adjustment can never be cancelled. */
  async cancelAdjustment(id: ID): Promise<StockAdjustment> {
    const existing = await this.requireAdjustment(id);
    if (existing.status !== 'draft' && existing.status !== 'pending_approval') {
      throw new Error(
        `Cannot cancel "${existing.adjustmentNumber}": only a draft or pending-approval adjustment can be cancelled (current status: ${existing.status}).`,
      );
    }
    return this.repository.updateHeader(id, { status: 'cancelled' });
  }

  private async requireAdjustment(id: ID): Promise<StockAdjustment> {
    const existing = await this.repository.getById(id);
    if (!existing) {
      throw new Error(`Stock adjustment "${id}" not found.`);
    }
    return existing;
  }
  private async requireDraft(id: ID): Promise<void> { const document = await this.requireAdjustment(id); if (document.status !== 'draft') throw new Error('Only a draft stock adjustment allows line changes.'); }
  private async refreshTotal(id: ID): Promise<StockAdjustment> { await this.repository.updateHeader(id, { totalCostEffect: sumCostEffect(await this.repository.getLines(id)) }); return this.requireAdjustment(id); }

  private async replaceLines(id: ID, lines: StockAdjustmentLine[]): Promise<void> {
    const existing = await this.repository.getLines(id);
    const nextIds = new Set(lines.map((line) => line.id));
    for (const line of existing) if (!nextIds.has(line.id)) await this.repository.deleteLine(id, line.id);
    for (const { adjustmentId: _parentId, ...line } of lines) {
      void _parentId;
      if (existing.some((item) => item.id === line.id)) await this.repository.updateLine(id, line.id, line);
      else await this.repository.createLine(id, line);
    }
  }

  /** A sequential document number based on register size (a per-document-type counter, not the journal-number allocator). */
  private async nextAdjustmentNumber(): Promise<string> {
    const all = await this.repository.getAll();
    return `ADJ-${String(all.length + 1).padStart(4, '0')}`;
  }
}

/** Singleton (Phase 3) — Supabase-backed via the shared `stockAdjustmentRepository` (migration 0027 applied). Audit uses the app-wide singleton, same as journalEntryService. */
export const stockAdjustmentService = new StockAdjustmentService(
  stockAdjustmentRepository,
  auditLogService,
  periodGuardedInventoryPostingEngine,
  inventoryAccountResolver,
  postingProductLookup,
);
