import type { AuditAction, ID, NewOpeningStockLine, OpeningStockBatch, OpeningStockLine } from '@/types';
import { roundToCents } from '@/features/accounting/services';
import { auditLogService } from '@/services/auditLogService';
import type { IOpeningStockBatchRepository } from '../repositories/IOpeningStockBatchRepository';
import { openingStockBatchRepository } from '../repositories/instances';
import type { InventoryPostingEngine, InventoryTransactionLine } from './inventoryPostingEngine';
import type { InventoryAccountResolver } from './inventoryAccountResolver';
import {
  inventoryAccountResolver,
  inventoryPostingEngine,
  postingProductLookup,
  type PostingProductLookup,
} from './inventoryPostingEngineInstance';

/** Minimal surface of AuditLogService this service depends on — see stockTakeService.ts's AuditLogger. */
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

export type CreateOpeningStockBatchDTO = Omit<
  OpeningStockBatch,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'batchNumber'
  | 'status'
  | 'totalCost'
  | 'confirmedBy'
  | 'confirmedAt'
  | 'journalEntryId'
>;
export type UpdateOpeningStockBatchDTO = Partial<CreateOpeningStockBatchDTO>;

/** Explicit-consent argument for `confirmBatch()` — models the "explicit user confirmation" rule. */
export interface ConfirmBatchArg {
  confirmed: boolean;
}

/** One leg of the previewed opening-stock GL entry. */
export interface PreviewLine {
  accountId: ID;
  debit: number;
  credit: number;
}

export interface AccountingEffectPreview {
  lines: PreviewLine[];
  balanced: boolean;
}

/**
 * docs/INVENTORY_ACCOUNTING.md § "Opening stock batch": the debit side is
 * INVENTORY, the credit side is `offsetAccountId` (default
 * OPENING_BALANCE_EQUITY / 3950). Account references are AccountMappingKeys
 * until Phase 3 wires the real category resolver, so the preview reports
 * the key on the leg with no `offsetAccountId` override.
 */
const INVENTORY_KEY: ID = 'INVENTORY';
const OPENING_BALANCE_EQUITY_KEY: ID = 'OPENING_BALANCE_EQUITY';

function recomputeTotalCost(lines: OpeningStockLine[]): number {
  return roundToCents(lines.reduce((sum, l) => sum + l.totalCost, 0));
}

/**
 * Business-logic layer for capturing opening inventory (migration 0029,
 * docs/INVENTORY_ACCOUNTING.md § "Opening stock batch"). The deliberate,
 * accounting-significant import path: a `draft` batch is populated (by hand
 * or import — import NEVER confirms it), `previewAccountingEffect()` shows
 * the DR INVENTORY / CR OPENING_BALANCE_EQUITY entry, then `confirmBatch()`
 * requires explicit `{ confirmed: true }` before it posts.
 *
 * PHASE 2 SKELETON: `confirmBatch()` transitions status and writes the
 * audit row but does NOT post GL or record `opening` movements — Phase 3.
 * `previewAccountingEffect()` is real (it only builds the preview object;
 * it posts nothing).
 */
export class OpeningStockBatchService {
  constructor(
    private readonly repository: IOpeningStockBatchRepository,
    private readonly auditLog: AuditLogger,
    private readonly engine?: InventoryPostingEngine,
    private readonly accountResolver?: InventoryAccountResolver,
    private readonly products?: PostingProductLookup,
  ) {}

  private get canPost(): boolean {
    return Boolean(this.engine && this.accountResolver && this.products);
  }

  async getOpeningStockBatches(): Promise<OpeningStockBatch[]> {
    return this.repository.getAll();
  }

  async getOpeningStockBatch(id: ID): Promise<OpeningStockBatch | undefined> {
    return this.repository.getById(id);
  }
  async addLine(id: ID,line: NewOpeningStockLine): Promise<OpeningStockBatch> { await this.requireDraft(id); await this.repository.createLine(id,line); return this.refreshTotal(id); }
  async updateLine(id: ID,lineId: ID,patch: Partial<NewOpeningStockLine>): Promise<OpeningStockBatch> { await this.requireDraft(id); await this.repository.updateLine(id,lineId,patch); return this.refreshTotal(id); }
  async deleteLine(id: ID,lineId: ID): Promise<OpeningStockBatch> { await this.requireDraft(id); await this.repository.deleteLine(id,lineId); return this.refreshTotal(id); }

  async createOpeningStockBatch(data: CreateOpeningStockBatchDTO): Promise<OpeningStockBatch> {
    const now = new Date().toISOString();
    const { lineItems, ...headerData } = data;
    const created = await this.repository.createHeader({
      ...headerData,
      id: '',
      batchNumber: await this.nextBatchNumber(),
      totalCost: recomputeTotalCost(lineItems ?? []),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
    for (const { openingStockBatchId: _parentId, ...line } of lineItems ?? []) { void _parentId; await this.repository.createLine(created.id, line); }
    return this.requireBatch(created.id);
  }

  async updateOpeningStockBatch(id: ID, patch: UpdateOpeningStockBatchDTO): Promise<OpeningStockBatch> {
    const batch = await this.requireBatch(id);
    if (batch.status !== 'draft') {
      throw new Error(
        `Cannot edit "${batch.batchNumber}": only a draft opening stock batch can be edited (current status: ${batch.status}).`,
      );
    }
    const { lineItems, ...headerPatch } = patch;
    const nextLines = lineItems ?? batch.lineItems;
    await this.repository.updateHeader(id, { ...headerPatch, totalCost: recomputeTotalCost(nextLines) });
    if (lineItems) await this.replaceLines(id, lineItems);
    return this.requireBatch(id);
  }

  async deleteOpeningStockBatch(id: ID): Promise<void> {
    const batch = await this.requireBatch(id);
    if (batch.status !== 'draft') {
      throw new Error(
        `Cannot delete "${batch.batchNumber}": only a draft opening stock batch can be deleted (current status: ${batch.status}).`,
      );
    }
    return this.repository.deleteHeader(id);
  }

  /**
   * Builds (does NOT post) the opening-stock GL entry from hydrated persistent lines:
   * DR INVENTORY Σ totalCost / CR `offsetAccountId` (default
   * OPENING_BALANCE_EQUITY) Σ totalCost. `balanced` is true when the two
   * legs agree to the cent.
   */
  async previewAccountingEffect(batchId: ID): Promise<AccountingEffectPreview> {
    const batch = await this.requireBatch(batchId);
    const total = recomputeTotalCost(batch.lineItems);
    const inventoryAccountId = this.accountResolver
      ? await this.accountResolver.resolveKey('INVENTORY')
      : INVENTORY_KEY;
    const offsetAccountId =
      batch.offsetAccountId ??
      (this.accountResolver ? await this.accountResolver.resolveKey('OPENING_BALANCE_EQUITY') : OPENING_BALANCE_EQUITY_KEY);
    const lines: PreviewLine[] = [
      { accountId: inventoryAccountId, debit: total, credit: 0 },
      { accountId: offsetAccountId, debit: 0, credit: total },
    ];
    const totalDebit = roundToCents(lines.reduce((sum, l) => sum + l.debit, 0));
    const totalCredit = roundToCents(lines.reduce((sum, l) => sum + l.credit, 0));
    return { lines, balanced: totalDebit === totalCredit };
  }

  /**
   * Confirms the batch: `draft → confirmed`, stamps `confirmedBy`/
   * `confirmedAt`, writes the audit row. Throws unless the caller passes
   * `{ confirmed: true }` — the explicit-user-confirmation rule
   * (docs/INVENTORY_ACCOUNTING.md § "Opening stock batch", step 2).
   *
   * PHASE 3 STUB: this would post the previewed GL entry and record one
   * `opening` movement per line (`unit_cost` per line,
   * `source_document_type='opening_stock_batch'`), then set
   * `journalEntryId`. No GL / stock mutation happens in Phase 2.
   */
  async confirmBatch(id: ID, arg: ConfirmBatchArg, confirmedByUserId?: ID): Promise<OpeningStockBatch> {
    const batch = await this.requireBatch(id);
    if (!arg?.confirmed) {
      throw new Error(
        `Cannot confirm "${batch.batchNumber}": opening stock is accounting-significant and requires explicit confirmation ({ confirmed: true }).`,
      );
    }
    if (batch.status !== 'draft') {
      throw new Error(
        `Cannot confirm "${batch.batchNumber}": only a draft batch can be confirmed (current status: ${batch.status}).`,
      );
    }

    if (batch.lineItems.length === 0) throw new Error(`Cannot confirm "${batch.batchNumber}": add at least one line.`);

    // Phase 3 (docs/INVENTORY_ACCOUNTING.md § "Opening stock batch"): one `opening`
    // movement per line (WAC established at `line.unitCost`) and ONE balanced entry —
    // DR inventory (per product) / CR `offsetAccountId` (default OPENING_BALANCE_EQUITY).
    // No VAT. `opening_stock_batch:<id>:confirm` is idempotent.
    let journalEntryId: ID | undefined;
    if (this.canPost) {
      journalEntryId = await this.postToEngine(batch, confirmedByUserId ?? 'system');
    }

    const now = new Date().toISOString();
    const confirmed = await this.repository.updateHeader(id, {
      status: 'confirmed',
      confirmedBy: confirmedByUserId,
      confirmedAt: now,
      totalCost: recomputeTotalCost(batch.lineItems),
      ...(journalEntryId ? { journalEntryId } : {}),
    });

    if (!this.canPost) {
      await this.auditLog.log({
        userId: confirmedByUserId ?? 'system',
        action: 'opening_stock_set',
        module: 'inventory',
        recordType: 'OpeningStockBatch',
        recordId: id,
        newValue: { status: 'confirmed', totalCost: confirmed.totalCost },
      });
    }

    return confirmed;
  }

  /** Applies the one inventory transaction for an opening-stock-batch confirm. */
  private async postToEngine(batch: OpeningStockBatch, confirmedBy: ID): Promise<ID | undefined> {
    const offsetAccountId = batch.offsetAccountId ?? (await this.accountResolver!.resolveKey('OPENING_BALANCE_EQUITY'));
    const lines: InventoryTransactionLine[] = [];
    for (const line of batch.lineItems) {
      const product = await this.products!.getById(line.productId);
      if (!product) {
        throw new Error(`Cannot confirm "${batch.batchNumber}": product "${line.productId}" not found.`);
      }
      const nonStock = !product.trackInventory;
      lines.push({
        productId: line.productId,
        warehouseId: line.warehouseId,
        quantityDelta: line.quantity,
        costingMode: 'opening',
        unitCostIn: line.unitCost,
        sourceDocumentLineId: line.id,
        nonStock,
        ...(nonStock
          ? {}
          : {
              inventoryAccountId: await this.accountResolver!.resolveForProduct(product, 'inventory'),
              contraAccountId: offsetAccountId,
            }),
      });
    }

    const result = await this.engine!.applyInventoryTransaction({
      postingKey: `opening_stock_batch:${batch.id}:confirm`,
      sourceType: 'opening_stock_batch',
      sourceId: batch.id,
      movementDate: batch.effectiveDate,
      createdBy: confirmedBy,
      lines,
      extraJournal: [],
      audit: { action: 'opening_stock_set', recordType: 'OpeningStockBatch', recordId: batch.id },
    });
    return result.journalEntryId;
  }

  /** Cancels a draft batch. A confirmed batch has posted opening balances behind it and is immutable. */
  async cancelBatch(id: ID): Promise<OpeningStockBatch> {
    const batch = await this.requireBatch(id);
    if (batch.status === 'confirmed') {
      throw new Error(`Cannot cancel "${batch.batchNumber}": a confirmed opening stock batch is immutable.`);
    }
    if (batch.status === 'cancelled') {
      return batch;
    }
    return this.repository.updateHeader(id, { status: 'cancelled' });
  }

  private async nextBatchNumber(): Promise<string> {
    const all = await this.repository.getAll();
    return `OSB-${String(all.length + 1).padStart(4, '0')}`;
  }

  private async requireBatch(id: ID): Promise<OpeningStockBatch> {
    const batch = await this.repository.getById(id);
    if (!batch) {
      throw new Error(`Opening stock batch "${id}" not found.`);
    }
    return batch;
  }
  private async requireDraft(id: ID): Promise<void> { const document=await this.requireBatch(id); if(document.status!=='draft') throw new Error('Only a draft opening stock batch allows line changes.'); }
  private async refreshTotal(id: ID): Promise<OpeningStockBatch> { await this.repository.updateHeader(id,{totalCost:recomputeTotalCost(await this.repository.getLines(id))}); return this.requireBatch(id); }

  private async replaceLines(id: ID, lines: OpeningStockLine[]): Promise<void> {
    const existing = await this.repository.getLines(id);
    const nextIds = new Set(lines.map((line) => line.id));
    for (const line of existing) if (!nextIds.has(line.id)) await this.repository.deleteLine(id, line.id);
    for (const { openingStockBatchId: _parentId, ...line } of lines) {
      void _parentId;
      if (existing.some((item) => item.id === line.id)) await this.repository.updateLine(id, line.id, line);
      else await this.repository.createLine(id, line);
    }
  }
}

/** Singleton (Phase 3) — Supabase-backed via the shared `openingStockBatchRepository` (migration 0029 applied). */
export const openingStockBatchService = new OpeningStockBatchService(
  openingStockBatchRepository,
  auditLogService,
  inventoryPostingEngine,
  inventoryAccountResolver,
  postingProductLookup,
);
