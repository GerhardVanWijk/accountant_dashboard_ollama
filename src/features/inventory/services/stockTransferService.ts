import type { ID, JournalEntry, NewStockTransferLine, StockTransfer, StockTransferLine } from '@/types';
import type { IStockTransferRepository } from '../repositories/IStockTransferRepository';
import type { NewJournalLineInput } from '@/features/accounting/services';
import { stockTransferRepository } from '../repositories/instances';
import type { InventoryPostingEngine, InventoryTransactionLine } from './inventoryPostingEngine';
import type { InventoryAccountResolver } from './inventoryAccountResolver';
import {
  inventoryAccountResolver,
  periodGuardedInventoryPostingEngine,
  postingProductLookup,
  type PostingProductLookup,
} from './inventoryPostingEngineInstance';

/**
 * Minimal surface of JournalEntryService the real (Phase 3) dispatch/receipt
 * legs would depend on — an interface, not the concrete class, mirroring
 * fixedAssetService.ts's JournalPoster.
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

export type CreateStockTransferDTO = Omit<
  StockTransfer,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'transferNumber'
  | 'status'
  | 'totalCost'
  | 'receivedDate'
  | 'dispatchedJournalEntryId'
  | 'receivedJournalEntryId'
>;
export type UpdateStockTransferDTO = Partial<CreateStockTransferDTO>;

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `totalCost` is always Σ line.totalCost — recomputed here, never trusted from the caller. */
function sumTotalCost(lines: StockTransferLine[]): number {
  return roundToCents(lines.reduce((total, line) => total + line.totalCost, 0));
}

/**
 * Business-logic layer for inter-warehouse stock transfers (migration
 * 0027). Mirrors fixedAssetService.ts's create-draft-then-explicit-action
 * lifecycle.
 *
 * Lifecycle: `draft → in_transit → completed`, or `→ cancelled` from
 * `draft` / `in_transit`. Company-wide inventory value is unchanged by a
 * transfer; the in-transit leg only reclassifies it
 * (docs/INVENTORY_ACCOUNTING.md § "Warehouse transfer").
 *
 * PHASE 3: `dispatch()` / `receive()` currently only transition status.
 * The real service posts the in-transit reclassification entries per
 * docs/INVENTORY_ACCOUNTING.md § "Warehouse transfer"
 * (dispatch: DR INVENTORY_IN_TRANSIT / CR from-category inventory;
 * receipt: DR to-category inventory / CR INVENTORY_IN_TRANSIT), records
 * `transfer_out` then `transfer_in` movements, and sets
 * `dispatchedJournalEntryId` / `receivedJournalEntryId` — inject a
 * `JournalPoster` + `AccountMapper` + inventory movement recorder then.
 */
export class StockTransferService {
  constructor(
    private readonly repository: IStockTransferRepository,
    private readonly engine?: InventoryPostingEngine,
    private readonly accountResolver?: InventoryAccountResolver,
    private readonly products?: PostingProductLookup,
  ) {}

  private get canPost(): boolean {
    return Boolean(this.engine && this.accountResolver && this.products);
  }

  async getTransfers(): Promise<StockTransfer[]> {
    return this.repository.getAll();
  }

  async getTransfer(id: ID): Promise<StockTransfer | undefined> {
    return this.repository.getById(id);
  }
  async addLine(id: ID, line: NewStockTransferLine): Promise<StockTransfer> { await this.requireDraft(id); await this.repository.createLine(id,line); return this.refreshTotal(id); }
  async updateLine(id: ID,lineId: ID,patch: Partial<NewStockTransferLine>): Promise<StockTransfer> { await this.requireDraft(id); await this.repository.updateLine(id,lineId,patch); return this.refreshTotal(id); }
  async deleteLine(id: ID,lineId: ID): Promise<StockTransfer> { await this.requireDraft(id); await this.repository.deleteLine(id,lineId); return this.refreshTotal(id); }

  async createTransfer(data: CreateStockTransferDTO): Promise<StockTransfer> {
    if (data.fromWarehouseId === data.toWarehouseId) {
      throw new Error('A stock transfer must move stock between two different warehouses.');
    }
    const lineItems = data.lineItems ?? [];
    const { lineItems: _lineItems, ...headerData } = data;
    void _lineItems;
    const now = new Date().toISOString();
    const created = await this.repository.createHeader({
      ...headerData,
      id: '',
      transferNumber: await this.nextTransferNumber(),
      totalCost: sumTotalCost(lineItems),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
    for (const { transferId: _parentId, ...line } of lineItems) { void _parentId; await this.repository.createLine(created.id, line); }
    return this.requireTransfer(created.id);
  }

  /** Only a `draft` transfer can be edited — once dispatched it is in-flight and drives (Phase 3) real posted GL history. */
  async updateTransfer(id: ID, patch: UpdateStockTransferDTO): Promise<StockTransfer> {
    const existing = await this.requireTransfer(id);
    if (existing.status !== 'draft') {
      throw new Error(
        `Cannot edit "${existing.transferNumber}": only a draft stock transfer can be edited (current status: ${existing.status}).`,
      );
    }
    if (patch.fromWarehouseId !== undefined || patch.toWarehouseId !== undefined) {
      const from = patch.fromWarehouseId ?? existing.fromWarehouseId;
      const to = patch.toWarehouseId ?? existing.toWarehouseId;
      if (from === to) {
        throw new Error('A stock transfer must move stock between two different warehouses.');
      }
    }
    const { lineItems, ...headerPatch } = patch;
    await this.repository.updateHeader(id, {
      ...headerPatch,
      ...(lineItems ? { totalCost: sumTotalCost(lineItems) } : {}),
    });
    if (lineItems) await this.replaceLines(id, lineItems);
    return this.requireTransfer(id);
  }

  /** Permanently removes a draft transfer. Once dispatched it must be cancelled, not deleted. */
  async deleteTransfer(id: ID): Promise<void> {
    const existing = await this.requireTransfer(id);
    if (existing.status !== 'draft') {
      throw new Error(
        `Cannot delete "${existing.transferNumber}": only a draft stock transfer can be deleted (current status: ${existing.status}).`,
      );
    }
    return this.repository.deleteHeader(id);
  }

  /**
   * `draft → in_transit`. Skeleton transitions status only; the GL
   * reclassification + `transfer_out` movement land in Phase 3 (see the
   * class doc comment).
   */
  async dispatch(id: ID): Promise<StockTransfer> {
    const existing = await this.requireTransfer(id);
    if (existing.status !== 'draft') {
      throw new Error(
        `Cannot dispatch "${existing.transferNumber}": expected a draft transfer (current status: ${existing.status}).`,
      );
    }

    if (existing.lineItems.length === 0) throw new Error(`Cannot dispatch "${existing.transferNumber}": add at least one line.`);

    // Phase 3 (docs/INVENTORY_ACCOUNTING.md § "Warehouse transfer"): `transfer_out`
    // movements on the from-warehouse + DR INVENTORY_IN_TRANSIT / CR from-inventory.
    // `stock_transfer:<id>:dispatch` is idempotent.
    let dispatchedJournalEntryId: ID | undefined;
    if (this.canPost) {
      dispatchedJournalEntryId = await this.postTransferLeg(existing, 'dispatch');
    }

    return this.repository.updateHeader(id, {
      status: 'in_transit',
      ...(dispatchedJournalEntryId ? { dispatchedJournalEntryId } : {}),
    });
  }

  /**
   * `draft → completed` in one step — no in-transit tracking. GL-neutral:
   * records paired `transfer_out` / `transfer_in` movements at once and posts
   * NO journal (docs/INVENTORY_ACCOUNTING.md § "Warehouse transfer").
   */
  async completeImmediate(id: ID): Promise<StockTransfer> {
    const existing = await this.requireTransfer(id);
    if (existing.status !== 'draft') {
      throw new Error(
        `Cannot complete "${existing.transferNumber}": expected a draft transfer (current status: ${existing.status}).`,
      );
    }
    if (existing.lineItems.length === 0) {
      throw new Error(`Cannot complete "${existing.transferNumber}": add at least one line.`);
    }

    if (this.canPost) {
      await this.engine!.applyInventoryTransaction({
        postingKey: `stock_transfer:${id}:complete`,
        sourceType: 'stock_transfer',
        sourceId: id,
        movementDate: existing.transferDate,
        createdBy: 'system',
        lines: existing.lineItems.flatMap((line): InventoryTransactionLine[] => [
          {
            productId: line.productId,
            warehouseId: existing.fromWarehouseId,
            quantityDelta: -line.quantity,
            costingMode: 'transfer_out',
          },
          {
            productId: line.productId,
            warehouseId: existing.toWarehouseId,
            quantityDelta: line.quantity,
            costingMode: 'transfer_in',
          },
        ]),
      });
    }

    return this.repository.updateHeader(id, {
      status: 'completed',
      receivedDate: new Date().toISOString(),
    });
  }

  /** Builds the dispatch / receive in-transit leg (one line per product, one warehouse). */
  private async postTransferLeg(transfer: StockTransfer, leg: 'dispatch' | 'receive'): Promise<ID | undefined> {
    const transitAccountId = await this.accountResolver!.resolveKey('INVENTORY_IN_TRANSIT');
    const warehouseId = leg === 'dispatch' ? transfer.fromWarehouseId : transfer.toWarehouseId;
    const lines: InventoryTransactionLine[] = [];
    for (const line of transfer.lineItems) {
      const product = await this.products!.getById(line.productId);
      if (!product) {
        throw new Error(`Cannot ${leg} "${transfer.transferNumber}": product "${line.productId}" not found.`);
      }
      lines.push({
        productId: line.productId,
        warehouseId,
        quantityDelta: leg === 'dispatch' ? -line.quantity : line.quantity,
        costingMode: leg === 'dispatch' ? 'transfer_out' : 'transfer_in',
        inventoryAccountId: await this.accountResolver!.resolveForProduct(product, 'inventory'),
        contraAccountId: transitAccountId,
      });
    }
    const result = await this.engine!.applyInventoryTransaction({
      postingKey: `stock_transfer:${transfer.id}:${leg}`,
      sourceType: 'stock_transfer',
      sourceId: transfer.id,
      movementDate: leg === 'dispatch' ? transfer.transferDate : new Date().toISOString().slice(0, 10),
      createdBy: 'system',
      lines,
    });
    return result.journalEntryId;
  }

  /**
   * `in_transit → completed`. Sets `receivedDate`. Skeleton transitions
   * status only; the reverse GL reclassification + `transfer_in` movement
   * land in Phase 3 (see the class doc comment).
   */
  async receive(id: ID): Promise<StockTransfer> {
    const existing = await this.requireTransfer(id);
    if (existing.status !== 'in_transit') {
      throw new Error(
        `Cannot receive "${existing.transferNumber}": expected an in-transit transfer (current status: ${existing.status}).`,
      );
    }

    // Phase 3 (docs/INVENTORY_ACCOUNTING.md § "Warehouse transfer"): `transfer_in`
    // movements on the to-warehouse + DR to-inventory / CR INVENTORY_IN_TRANSIT
    // (same accounts as dispatch, swapped by the engine on the positive delta).
    // `stock_transfer:<id>:receive` is idempotent.
    let receivedJournalEntryId: ID | undefined;
    if (this.canPost) {
      receivedJournalEntryId = await this.postTransferLeg(existing, 'receive');
    }

    return this.repository.updateHeader(id, {
      status: 'completed',
      receivedDate: new Date().toISOString(),
      ...(receivedJournalEntryId ? { receivedJournalEntryId } : {}),
    });
  }

  /** `draft | in_transit → cancelled`. A completed transfer can never be cancelled. */
  async cancelTransfer(id: ID): Promise<StockTransfer> {
    const existing = await this.requireTransfer(id);
    if (existing.status !== 'draft' && existing.status !== 'in_transit') {
      throw new Error(
        `Cannot cancel "${existing.transferNumber}": only a draft or in-transit transfer can be cancelled (current status: ${existing.status}).`,
      );
    }
    return this.repository.updateHeader(id, { status: 'cancelled' });
  }

  private async requireTransfer(id: ID): Promise<StockTransfer> {
    const existing = await this.repository.getById(id);
    if (!existing) {
      throw new Error(`Stock transfer "${id}" not found.`);
    }
    return existing;
  }
  private async requireDraft(id: ID): Promise<void> { const document=await this.requireTransfer(id); if(document.status!=='draft') throw new Error('Only a draft stock transfer allows line changes.'); }
  private async refreshTotal(id: ID): Promise<StockTransfer> { await this.repository.updateHeader(id,{totalCost:sumTotalCost(await this.repository.getLines(id))}); return this.requireTransfer(id); }

  private async replaceLines(id: ID, lines: StockTransferLine[]): Promise<void> {
    const existing = await this.repository.getLines(id);
    const nextIds = new Set(lines.map((line) => line.id));
    for (const line of existing) if (!nextIds.has(line.id)) await this.repository.deleteLine(id, line.id);
    for (const { transferId: _parentId, ...line } of lines) {
      void _parentId;
      if (existing.some((item) => item.id === line.id)) await this.repository.updateLine(id, line.id, line);
      else await this.repository.createLine(id, line);
    }
  }

  /** A sequential document number based on register size (a per-document-type counter, not the journal-number allocator). */
  private async nextTransferNumber(): Promise<string> {
    const all = await this.repository.getAll();
    return `TRF-${String(all.length + 1).padStart(4, '0')}`;
  }
}

/** Singleton (Phase 3) — Supabase-backed via the shared `stockTransferRepository` (migration 0027 applied). */
export const stockTransferService = new StockTransferService(
  stockTransferRepository,
  periodGuardedInventoryPostingEngine,
  inventoryAccountResolver,
  postingProductLookup,
);
