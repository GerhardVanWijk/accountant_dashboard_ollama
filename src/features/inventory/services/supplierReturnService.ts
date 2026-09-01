import type { AuditAction, ID, NewSupplierReturnLine, SupplierReturn, SupplierReturnLine } from '@/types';
import { roundToCents } from '@/features/accounting/services';
import { auditLogService } from '@/services/auditLogService';
import type { ISupplierReturnRepository } from '../repositories/ISupplierReturnRepository';
import { supplierReturnRepository } from '../repositories/instances';
import type { ExtraJournalLine, InventoryPostingEngine, InventoryTransactionLine } from './inventoryPostingEngine';
import type { InventoryAccountResolver } from './inventoryAccountResolver';
import {
  inventoryAccountResolver,
  periodGuardedInventoryPostingEngine,
  postingProductLookup,
  type PostingProductLookup,
} from './inventoryPostingEngineInstance';
import type { AccountingEffectPreview, AccountingPreviewLine } from '../types/accountingPreview';

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

export type CreateSupplierReturnDTO = Omit<
  SupplierReturn,
  'id' | 'createdAt' | 'updatedAt' | 'returnNumber' | 'status' | 'subtotal' | 'taxTotal' | 'total' | 'journalEntryId'
>;
export type UpdateSupplierReturnDTO = Partial<CreateSupplierReturnDTO>;

/**
 * `subtotal = Σ line.lineTotal` (ex-VAT), `taxTotal = Σ line.taxAmount`,
 * `total = subtotal + taxTotal` — the same convention as
 * creditNoteService / DocumentLineItem, rounded to cents.
 */
function recomputeTotals(lines: SupplierReturnLine[]): {
  subtotal: number;
  taxTotal: number;
  total: number;
} {
  const subtotal = roundToCents(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  const taxTotal = roundToCents(lines.reduce((sum, l) => sum + l.taxAmount, 0));
  return { subtotal, taxTotal, total: roundToCents(subtotal + taxTotal) };
}

/**
 * Business-logic layer for returning goods to a supplier (migration 0029,
 * docs/INVENTORY_ACCOUNTING.md § "Purchase return / supplier return") — the
 * purchase-side mirror of creditNoteService. Draft-then-post; a posted
 * supplier return is immutable.
 *
 * PHASE 2 SKELETON: `postSupplierReturn()` transitions status and writes
 * the audit row but does NOT post the reversing GL entry or record
 * `purchase_return` movements — Phase 3 (see the stub comment).
 */
export class SupplierReturnService {
  constructor(
    private readonly repository: ISupplierReturnRepository,
    private readonly auditLog: AuditLogger,
    private readonly engine?: InventoryPostingEngine,
    private readonly accountResolver?: InventoryAccountResolver,
    private readonly products?: PostingProductLookup,
  ) {}

  private get canPost(): boolean {
    return Boolean(this.engine && this.accountResolver && this.products);
  }

  async getSupplierReturns(): Promise<SupplierReturn[]> {
    return this.repository.getAll();
  }

  async getSupplierReturn(id: ID): Promise<SupplierReturn | undefined> {
    return this.repository.getById(id);
  }
  async addLine(id: ID,line: NewSupplierReturnLine): Promise<SupplierReturn> { await this.requireDraft(id); await this.repository.createLine(id,line); return this.refreshTotals(id); }
  async updateLine(id: ID,lineId: ID,patch: Partial<NewSupplierReturnLine>): Promise<SupplierReturn> { await this.requireDraft(id); await this.repository.updateLine(id,lineId,patch); return this.refreshTotals(id); }
  async deleteLine(id: ID,lineId: ID): Promise<SupplierReturn> { await this.requireDraft(id); await this.repository.deleteLine(id,lineId); return this.refreshTotals(id); }

  async createSupplierReturn(data: CreateSupplierReturnDTO): Promise<SupplierReturn> {
    const now = new Date().toISOString();
    const totals = recomputeTotals(data.lineItems ?? []);
    const { lineItems, ...headerData } = data;
    const created = await this.repository.createHeader({
      ...headerData,
      id: '',
      returnNumber: await this.nextReturnNumber(),
      ...totals,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
    for (const { supplierReturnId: _parentId, ...line } of lineItems ?? []) { void _parentId; await this.repository.createLine(created.id, line); }
    return this.requireSupplierReturn(created.id);
  }

  async updateSupplierReturn(id: ID, patch: UpdateSupplierReturnDTO): Promise<SupplierReturn> {
    const supplierReturn = await this.requireSupplierReturn(id);
    if (supplierReturn.status !== 'draft') {
      throw new Error(
        `Cannot edit "${supplierReturn.returnNumber}": only a draft supplier return can be edited (current status: ${supplierReturn.status}).`,
      );
    }
    const { lineItems, ...headerPatch } = patch;
    const nextLines = lineItems ?? supplierReturn.lineItems;
    await this.repository.updateHeader(id, { ...headerPatch, ...recomputeTotals(nextLines) });
    if (lineItems) await this.replaceLines(id, lineItems);
    return this.requireSupplierReturn(id);
  }

  async deleteSupplierReturn(id: ID): Promise<void> {
    const supplierReturn = await this.requireSupplierReturn(id);
    if (supplierReturn.status !== 'draft') {
      throw new Error(
        `Cannot delete "${supplierReturn.returnNumber}": only a draft supplier return can be deleted (current status: ${supplierReturn.status}).`,
      );
    }
    return this.repository.deleteHeader(id);
  }

  /**
   * Posts the supplier return: `draft → posted`, writes the audit row, and
   * (when wired with the posting engine) posts ONE balanced GL entry +
   * one `purchase_return` movement per stock line.
   *
   * Accounting model (docs/INVENTORY_ACCOUNTING.md § "Purchase return /
   * supplier return", Phase 3C item 3):
   *
   *   - Stock leaves at the weighted-average carrying cost (WAC is NOT
   *     recomputed — goods leaving are not a re-priced purchase).
   *   - Accounts Payable / GRNI unwinds at the supplier's ACTUAL credit note
   *     value (`subtotal` ex-VAT + `taxTotal`), not at WAC.
   *   - Input VAT reverses at the supplier's actual tax basis (`taxTotal`).
   *   - The gap between the supplier's net credit and the WAC carrying value
   *     is a purchasing gain/loss → `PURCHASE_PRICE_VARIANCE` (5060), NOT
   *     5050 Inventory Adjustments (which is for physical stock differences).
   *
   *   ex-VAT, 10 units, WAC R9.00, supplier net credit R100.00:
   *       Dr Accounts Payable           100.00
   *           Cr Inventory Asset          90.00   (10 × WAC 9.00)
   *           Cr Purchase Price Variance  10.00
   *
   *   supplier net credit only R80.00:
   *       Dr Accounts Payable            80.00
   *       Dr Purchase Price Variance     10.00
   *           Cr Inventory Asset          90.00
   *
   *   with 15% VAT on the R100 net credit (total R115.00):
   *       Dr Accounts Payable           115.00
   *           Cr Inventory Asset          90.00
   *           Cr VAT Input                15.00
   *           Cr Purchase Price Variance  10.00
   *
   * The engine posts the inventory movement + `Dr PPV / Cr Inventory` at
   * carrying value inside the atomic RPC; the `extraJournal`
   * (`Dr AP total / Cr PPV netCredit / Cr VAT_INPUT taxTotal`) nets against
   * it so the persisted entry shows only the residual PPV line.
   * `supplier_return:<id>:post` is idempotent.
   */
  async postSupplierReturn(id: ID, postedByUserId?: ID): Promise<SupplierReturn> {
    const supplierReturn = await this.requireSupplierReturn(id);
    if (supplierReturn.status !== 'draft') {
      throw new Error(
        `Cannot post "${supplierReturn.returnNumber}": only a draft supplier return can be posted (current status: ${supplierReturn.status}).`,
      );
    }

    if (supplierReturn.lineItems.length === 0) throw new Error(`Cannot post "${supplierReturn.returnNumber}": add at least one line.`);

    let journalEntryId: ID | undefined;
    if (this.canPost) {
      journalEntryId = await this.postToEngine(supplierReturn, postedByUserId ?? 'system');
    }

    const posted = await this.repository.updateHeader(id, {
      status: 'posted',
      ...recomputeTotals(supplierReturn.lineItems),
      ...(journalEntryId ? { journalEntryId } : {}),
    });

    if (!this.canPost) {
      await this.auditLog.log({
        userId: postedByUserId ?? 'system',
        action: 'supplier_return_posted',
        module: 'inventory',
        recordType: 'SupplierReturn',
        recordId: id,
        newValue: { status: 'posted', total: posted.total },
      });
    }

    return posted;
  }

  /**
   * The ONE line-building pass shared by `postToEngine()` and
   * `previewPostEffect()` — computes the WAC carrying value, the supplier
   * settlement, the VAT reversal and the residual Purchase Price Variance
   * exactly once. `carryingValue` uses each product's CURRENT weighted-
   * average cost (`product.costPrice`) — the same value `costingMode:
   * 'issue'` (no `unitCostOverride`) resolves inside the engine — so the
   * preview matches what will actually post as long as no other posting for
   * the same product lands between preview and post.
   */
  private async buildReturnLines(supplierReturn: SupplierReturn): Promise<{
    engine: InventoryTransactionLine[];
    extraJournal: ExtraJournalLine[];
    preview: AccountingPreviewLine[];
  }> {
    // Settlement account: AP for a billed return; GRNI for a return against an
    // un-billed PO receipt (no input VAT was claimed yet, so no VAT leg).
    const isGrni = !supplierReturn.billId && Boolean(supplierReturn.purchaseOrderId);
    const settlementKey = isGrni ? 'GRNI' : 'AP';
    const settlementAccountId = await this.accountResolver!.resolveKey(settlementKey);
    const ppvAccountId = await this.accountResolver!.resolveKey('PURCHASE_PRICE_VARIANCE');

    // Stock leaves at WAC (costingMode 'issue', no unitCostOverride). The engine
    // posts `Dr PPV / Cr <inventory>` at carrying value; PPV then nets against
    // the supplier's actual net credit in `extraJournal`.
    const lines: InventoryTransactionLine[] = [];
    let stockNetCredit = 0; // ex-VAT supplier credit attributable to stock lines
    let nonStockNetCredit = 0;
    let carryingValue = 0; // Σ quantity × current WAC for stock lines
    let inventoryAccountId: ID | undefined;
    for (const line of supplierReturn.lineItems) {
      const product = await this.products!.getById(line.productId);
      if (!product) {
        throw new Error(
          `Cannot post "${supplierReturn.returnNumber}": product "${line.productId}" not found.`,
        );
      }
      if (!line.warehouseId) {
        throw new Error(
          `Cannot post "${supplierReturn.returnNumber}": line "${line.id}" has no warehouse.`,
        );
      }
      const nonStock = !product.trackInventory;
      if (nonStock) {
        nonStockNetCredit = roundToCents(nonStockNetCredit + line.lineTotal);
      } else {
        stockNetCredit = roundToCents(stockNetCredit + line.lineTotal);
        carryingValue = roundToCents(carryingValue + line.quantity * product.costPrice);
        inventoryAccountId = await this.accountResolver!.resolveForProduct(product, 'inventory');
      }
      lines.push({
        productId: line.productId,
        warehouseId: line.warehouseId,
        quantityDelta: -line.quantity,
        costingMode: 'issue',
        movementType: 'purchase_return',
        sourceDocumentLineId: line.id,
        nonStock,
        ...(nonStock
          ? {}
          : {
              inventoryAccountId,
              contraAccountId: ppvAccountId,
            }),
      });
    }

    // Supplier settles the whole credit note; input VAT reverses at the actual
    // supplier tax basis (AP path only — a GRNI return carries no claimed VAT).
    const vatReversal = isGrni ? 0 : Math.max(0, supplierReturn.taxTotal);
    const settlementDebit = isGrni
      ? roundToCents(stockNetCredit + nonStockNetCredit)
      : roundToCents(supplierReturn.subtotal + supplierReturn.taxTotal);

    const extraJournal: ExtraJournalLine[] = [];
    if (settlementDebit > 0) {
      extraJournal.push({ accountId: settlementAccountId, debit: settlementDebit, credit: 0 });
    }
    if (stockNetCredit > 0) {
      // Cr PPV the supplier's net credit for stock lines; engine already Dr'd PPV
      // the carrying value → the residual is the purchasing gain/loss.
      extraJournal.push({ accountId: ppvAccountId, debit: 0, credit: stockNetCredit });
    }
    if (nonStockNetCredit > 0) {
      extraJournal.push({
        accountId: await this.accountResolver!.resolveKey('EXPENSE'),
        debit: 0,
        credit: nonStockNetCredit,
      });
    }
    if (vatReversal > 0) {
      extraJournal.push({ accountId: await this.accountResolver!.resolveKey('VAT_INPUT'), debit: 0, credit: vatReversal });
    }

    // Preview: the four named figures the workflow shows explicitly (spec §5)
    // — carrying value, supplier credit, VAT reversal, and the residual PPV,
    // netted the same way the posted, aggregated GL entry nets it. PPV is
    // ALWAYS shown, even when the net residual is exactly R0.00.
    const preview: AccountingPreviewLine[] = [];
    if (carryingValue > 0 || stockNetCredit > 0) {
      preview.push({
        accountId: inventoryAccountId ?? ppvAccountId,
        debit: 0,
        credit: carryingValue,
        source: 'Inventory carrying value (WAC)',
      });
    }
    if (settlementDebit > 0) {
      preview.push({ accountId: settlementAccountId, debit: settlementDebit, credit: 0, source: 'Supplier credit value' });
    }
    if (vatReversal > 0) {
      preview.push({
        accountId: await this.accountResolver!.resolveKey('VAT_INPUT'),
        debit: 0,
        credit: vatReversal,
        source: 'VAT reversal',
      });
    }
    if (nonStockNetCredit > 0) {
      preview.push({
        accountId: await this.accountResolver!.resolveKey('EXPENSE'),
        debit: 0,
        credit: nonStockNetCredit,
        source: 'Non-stock line credit',
      });
    }
    // Never hide PPV: net = Dr carryingValue − Cr stockNetCredit. Shown even at R0.00.
    const netPpv = roundToCents(carryingValue - stockNetCredit);
    preview.push({
      accountId: ppvAccountId,
      debit: netPpv > 0 ? netPpv : 0,
      credit: netPpv < 0 ? -netPpv : 0,
      source: 'Purchase Price Variance',
    });

    return { engine: lines, extraJournal, preview };
  }

  /** Applies the one inventory transaction for a supplier-return post. */
  private async postToEngine(supplierReturn: SupplierReturn, postedBy: ID): Promise<ID | undefined> {
    const { engine: lines, extraJournal } = await this.buildReturnLines(supplierReturn);

    const result = await this.engine!.applyInventoryTransaction({
      postingKey: `supplier_return:${supplierReturn.id}:post`,
      sourceType: 'supplier_return',
      sourceId: supplierReturn.id,
      movementDate: supplierReturn.returnDate,
      createdBy: postedBy,
      lines,
      extraJournal,
      audit: { action: 'supplier_return_posted', recordType: 'SupplierReturn', recordId: supplierReturn.id },
    });
    return result.journalEntryId;
  }

  /**
   * Pure preview of the GL entry `postSupplierReturn()` would post — built
   * from the exact same `buildReturnLines()` pass. Posts nothing. Always
   * includes the Purchase Price Variance line, even at R0.00 (spec: never
   * hide PPV).
   */
  async previewPostEffect(id: ID): Promise<AccountingEffectPreview> {
    const supplierReturn = await this.requireSupplierReturn(id);
    if (!this.accountResolver || !this.products) {
      throw new Error('Cannot preview: the account resolver / product lookup is not available in this context.');
    }
    const { preview: lines } = await this.buildReturnLines(supplierReturn);
    const totalDebit = roundToCents(lines.reduce((sum, l) => sum + l.debit, 0));
    const totalCredit = roundToCents(lines.reduce((sum, l) => sum + l.credit, 0));
    return { lines, balanced: totalDebit === totalCredit };
  }

  /** Cancels a draft supplier return. A posted return is immutable. */
  async cancelSupplierReturn(id: ID): Promise<SupplierReturn> {
    const supplierReturn = await this.requireSupplierReturn(id);
    if (supplierReturn.status === 'posted') {
      throw new Error(`Cannot cancel "${supplierReturn.returnNumber}": a posted supplier return is immutable.`);
    }
    if (supplierReturn.status === 'cancelled') {
      return supplierReturn;
    }
    return this.repository.updateHeader(id, { status: 'cancelled' });
  }

  private async nextReturnNumber(): Promise<string> {
    const all = await this.repository.getAll();
    return `SRET-${String(all.length + 1).padStart(4, '0')}`;
  }

  private async requireSupplierReturn(id: ID): Promise<SupplierReturn> {
    const supplierReturn = await this.repository.getById(id);
    if (!supplierReturn) {
      throw new Error(`Supplier return "${id}" not found.`);
    }
    return supplierReturn;
  }
  private async requireDraft(id: ID): Promise<void> { const document=await this.requireSupplierReturn(id); if(document.status!=='draft') throw new Error('Only a draft supplier return allows line changes.'); }
  private async refreshTotals(id: ID): Promise<SupplierReturn> { await this.repository.updateHeader(id,recomputeTotals(await this.repository.getLines(id))); return this.requireSupplierReturn(id); }

  private async replaceLines(id: ID, lines: SupplierReturnLine[]): Promise<void> {
    const existing = await this.repository.getLines(id);
    const nextIds = new Set(lines.map((line) => line.id));
    for (const line of existing) if (!nextIds.has(line.id)) await this.repository.deleteLine(id, line.id);
    for (const { supplierReturnId: _parentId, ...line } of lines) {
      void _parentId;
      if (existing.some((item) => item.id === line.id)) await this.repository.updateLine(id, line.id, line);
      else await this.repository.createLine(id, line);
    }
  }
}

/** Singleton (Phase 3) — Supabase-backed via the shared `supplierReturnRepository` (migration 0029 applied). */
export const supplierReturnService = new SupplierReturnService(
  supplierReturnRepository,
  auditLogService,
  periodGuardedInventoryPostingEngine,
  inventoryAccountResolver,
  postingProductLookup,
);
