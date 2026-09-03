import type { AssetCategory, Bill, DepreciationMethod, ID, Product } from '@/types';
import type { IBillRepository } from '@/repositories/IBillRepository';
import type { AccountMapper } from '@/features/accounting/services';
import { roundToCents, SYSTEM_USER_ID } from '@/features/accounting/services';
import type { InventoryAccountResolver } from '@/features/inventory/services/inventoryAccountResolver';
import type {
  ExtraJournalLine,
  InventoryTransactionLine,
} from '@/features/inventory/services/inventoryPostingEngine';
import {
  type DocumentProductLookup,
  type DocumentWarehouseResolver,
  type InventoryTransactionPoster,
  projectDocumentLinesBestEffort,
  requireWarehouseId,
  toMovementDate,
} from '@/features/inventory/services/documentInventoryPosting';
import type { IDocumentLineProjector } from '@/repositories/IDocumentLineProjector';
import { NoopDocumentLineProjector } from '@/repositories/NoopDocumentLineProjector';

/**
 * Minimal surface of TaxRateService this service depends on — resolving a
 * line's `taxRateId` to its VAT `treatment` is all `postBill()` needs, so
 * it depends on this narrow interface rather than the whole service.
 */
export interface TaxRateResolver {
  getTaxRate(id: ID): Promise<{ treatment: string } | undefined>;
}

/**
 * Minimal surface of PurchaseOrderService this service depends on — checks
 * whether a Bill's linked PO already had its goods receipt posted (3-way
 * matching, `purchaseOrderService.recordReceipt()`), so `postBill()` knows
 * to clear GRNI instead of debiting Inventory again and NOT re-record the
 * stock movement. A PO with no `journalEntryId` was never GRNI-received
 * (or has no tracked-inventory lines), so a linked Bill behaves exactly as
 * it always has — debit Inventory, record the receipt now.
 */
export interface PurchaseOrderLookup {
  getPurchaseOrder(id: ID): Promise<{ journalEntryId?: ID } | undefined>;
}

/**
 * Minimal surface of FixedAssetService this service depends on
 * (src/features/assets/services/fixedAssetService.ts) — a Bill line
 * flagged `fixedAssetDetails` must capitalize to the Fixed Asset Register
 * (DR acc_1500) instead of being expensed, per
 * SA_ACCOUNTING_MASTER_SPEC.md §116 Phase 7 (docs/KNOWN_ISSUES.md: "No
 * Bill-line capitalization path into the Fixed Asset Register").
 */
export interface FixedAssetCapitalizer {
  capitalizeFromBillLine(input: {
    sourceBillId: ID;
    journalEntryId: ID;
    name: string;
    category: AssetCategory;
    acquisitionDate: string;
    cost: number;
    residualValue: number;
    usefulLifeYears: number;
    depreciationMethod: DepreciationMethod;
    reducingBalanceRatePercent?: number;
    taxWearTearRatePercent?: number;
  }): Promise<unknown>;
}

export type CreateBillDTO = Omit<Bill, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Business-logic layer for supplier bills.
 * Handles bill creation, updates, status changes, and GL posting.
 */
export class BillService {
  constructor(
    private readonly repository: IBillRepository,
    /**
     * The ONE atomic inventory posting engine. `postBill()` hands it the
     * expense / VAT-input / fixed-asset / AP lines as `extraJournal` plus
     * one `receipt` line per tracked-inventory line — the engine blends
     * WAC, moves stock, and posts a SINGLE balanced journal entry in one
     * RPC. No separate `journalEntryService` post, no separate stock call.
     */
    private readonly engine: InventoryTransactionPoster,
    private readonly taxRateResolver: TaxRateResolver,
    private readonly purchaseOrders: PurchaseOrderLookup,
    private readonly fixedAssetCapitalizer: FixedAssetCapitalizer,
    private readonly accounts: AccountMapper,
    /** Product → category → generic-key resolution for the Inventory / GRNI / AP accounts. */
    private readonly inventoryAccounts: InventoryAccountResolver,
    private readonly products: DocumentProductLookup,
    private readonly warehouses: DocumentWarehouseResolver,
    /** Phase 9B (docs/ACCOUNTING_RELATIONSHIPS.md §17-18) — see InvoiceService's identical parameter for the full rationale. */
    private readonly lineProjector: IDocumentLineProjector = new NoopDocumentLineProjector(),
  ) {}

  async getBills(): Promise<Bill[]> {
    return this.repository.getAll();
  }

  async getBill(id: string): Promise<Bill | undefined> {
    return this.repository.getById(id);
  }

  async createBill(data: CreateBillDTO): Promise<Bill> {
    const now = new Date().toISOString();
    const bill = await this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
    await projectDocumentLinesBestEffort(this.lineProjector, bill.id, bill.lineItems, `Bill ${bill.billNumber}`);
    return bill;
  }

  /**
   * Edits a bill. A POSTED bill is immutable (SA_ACCOUNTING_MASTER_SPEC.md
   * §14/§36/§72/§79, and Phase 3C item 5): once it has hit the ledger and
   * moved stock, its supplier, lines, quantities, prices, tax, accounting
   * date and status must not change through here. Corrections go through the
   * supplier-return / journal-reversal workflow, exactly as a posted invoice
   * is corrected with a credit note. `recordPayment()` / `markAsOverdue()` /
   * `postBill()` mutate their own specific fields directly and are unaffected.
   */
  async updateBill(id: string, patch: Partial<Bill>): Promise<Bill> {
    const bill = await this.repository.getById(id);
    if (!bill) {
      throw new Error(`Bill "${id}" not found`);
    }
    if (bill.status !== 'draft') {
      throw new Error(
        `Cannot edit bill "${id}": a posted bill is immutable (current status: ${bill.status}). ` +
          `Raise a supplier return, or post a compensating manual journal entry, to correct it.`,
      );
    }
    const updated = await this.repository.update(id, patch);
    if ('lineItems' in patch) {
      await projectDocumentLinesBestEffort(this.lineProjector, updated.id, updated.lineItems, `Bill ${updated.billNumber}`);
    }
    return updated;
  }

  /**
   * Permanently removes a draft bill. A posted bill (anything past 'draft')
   * is accounting history — per SA_ACCOUNTING_MASTER_SPEC.md §14/§36/§72/
   * §79 it must never be deleted.
   */
  async deleteBill(id: string): Promise<void> {
    const bill = await this.repository.getById(id);
    if (!bill) {
      throw new Error(`Bill "${id}" not found`);
    }
    if (bill.status !== 'draft') {
      throw new Error(`Cannot delete bill "${id}": only a draft bill can be deleted (current status: ${bill.status}).`);
    }
    return this.repository.delete(id);
  }

  /**
   * Sums a bill's line-item VAT into deductible vs non-deductible
   * (SA_ACCOUNTING_MASTER_SPEC.md §12: non-deductible input VAT must
   * never be claimed back). The non-deductible portion is capped at
   * `bill.taxTotal` and any shortfall (a line with no resolvable
   * `taxRateId`, or no line items at all) is conservatively treated as
   * non-deductible too — "don't claim it" is the safe default when the
   * treatment can't be confirmed, not "claim it anyway". This keeps the
   * split's total always exactly equal to `bill.taxTotal`, so the
   * Expense+VAT-Input debit total can never drift from the AP credit
   * (`bill.total`) regardless of any per-line data inconsistency.
   */
  private async splitDeductibleVat(bill: Bill): Promise<{ deductibleVat: number; nonDeductibleVat: number }> {
    let resolvedDeductible = 0;
    for (const line of bill.lineItems) {
      if (!line.taxRateId) continue;
      const rate = await this.taxRateResolver.getTaxRate(line.taxRateId);
      if (rate && rate.treatment !== 'non_deductible') {
        resolvedDeductible += line.taxAmount;
      }
    }
    const deductibleVat = Math.min(resolvedDeductible, bill.taxTotal);
    return { deductibleVat, nonDeductibleVat: bill.taxTotal - deductibleVat };
  }

  /**
   * Splits a bill's line items three ways: tracked-inventory lines
   * (capitalize to the Inventory asset — SA_ACCOUNTING_MASTER_SPEC.md
   * §22), lines flagged `fixedAssetDetails` (capitalize to the Fixed
   * Asset Register — §116 Phase 7), and everything else (expensed
   * immediately, as before). A `fixedAssetDetails` line is checked FIRST
   * and is mutually exclusive with the inventory check — a fixed asset
   * never comes from the Product catalog, per FixedAssetLineDetails' doc
   * comment (src/types/fixedAsset.ts). The three totals are computed from
   * the same `lineTotal`s that sum to `bill.subtotal`, so
   * `inventoryValue + fixedAssetValue + expenseValue === bill.subtotal`
   * always holds — nothing here can desync the posting from the AP
   * credit.
   */
  private async splitLineItems(bill: Bill): Promise<{
    expenseValue: number;
    inventoryValue: number;
    inventoryLines: { line: Bill['lineItems'][number]; product: Product }[];
    fixedAssetValue: number;
    fixedAssetLines: Bill['lineItems'];
  }> {
    let inventoryValue = 0;
    let expenseValue = 0;
    let fixedAssetValue = 0;
    const inventoryLines: { line: Bill['lineItems'][number]; product: Product }[] = [];
    const fixedAssetLines: Bill['lineItems'] = [];
    for (const line of bill.lineItems) {
      if (line.fixedAssetDetails) {
        fixedAssetValue += line.lineTotal;
        fixedAssetLines.push(line);
        continue;
      }
      const product = line.productId ? await this.products.getProduct(line.productId) : undefined;
      if (product?.trackInventory) {
        inventoryValue += line.lineTotal;
        inventoryLines.push({ line, product });
      } else {
        expenseValue += line.lineTotal;
      }
    }
    return { expenseValue, inventoryValue, inventoryLines, fixedAssetValue, fixedAssetLines };
  }

  /**
   * Posts a bill to accounts payable through the ONE atomic inventory
   * posting engine. `postBill()` builds only the non-inventory journal
   * lines and passes them as `extraJournal`:
   *
   *   DR Operating Expenses   expenseValue + non-deductible VAT   (only if > 0)
   *   DR VAT Input            deductible VAT only                 (only if > 0)
   *   DR Fixed Assets         Σ fixedAssetDetails line totals     (only if > 0)
   *   DR GRNI                 inventoryValue  — pre-received PO ONLY (clears the accrual)
   *   CR Accounts Payable     bill.total   (less inventoryValue when the engine posts the goods against AP)
   *
   * Tracked-inventory lines (§22) split on whether this bill's PO already
   * had its goods receipt posted (`purchaseOrderService.recordReceipt()`):
   *   - PO not GRNI-received: an engine `receipt` line per tracked line —
   *     DR <category Inventory> / CR AP, WAC blended, stock moved, all in
   *     the atomic RPC.
   *   - PO already GRNI-received: NO engine line (the PO receipt already
   *     moved the stock + blended WAC). The bill only reclassifies the
   *     GRNI accrual to real AP — DR GRNI in `extraJournal`, no stock
   *     re-record, no WAC recompute (the double-count guard, preserved).
   *
   * Only a 'draft' bill posts. GL + stock are one transaction — a failure
   * (unbalanced, closed period, no warehouse for a tracked line) throws
   * and nothing changes. `fixedAssetCapitalizer.capitalizeFromBillLine()`
   * runs AFTER, with `journalEntryId` pointing at THIS entry.
   */
  async postBill(id: string): Promise<Bill> {
    const bill = await this.repository.getById(id);
    if (!bill) {
      throw new Error(`Bill "${id}" not found`);
    }
    if (bill.status !== 'draft') {
      throw new Error(`Bill "${id}" has already been posted (status: ${bill.status}).`);
    }

    const docLabel = `Bill ${bill.billNumber}`;
    const { deductibleVat, nonDeductibleVat } = await this.splitDeductibleVat(bill);
    const { expenseValue, inventoryValue, inventoryLines, fixedAssetValue, fixedAssetLines } = await this.splitLineItems(bill);
    const linkedPO = bill.purchaseOrderId ? await this.purchaseOrders.getPurchaseOrder(bill.purchaseOrderId) : undefined;
    const grniAlreadyRecognized = Boolean(linkedPO?.journalEntryId);

    const expenseDebit = roundToCents(expenseValue + nonDeductibleVat);
    const hasValue =
      expenseDebit > 0 || deductibleVat > 0 || fixedAssetValue > 0 || inventoryValue > 0 || bill.total > 0;
    if (!hasValue) {
      throw new Error(`Cannot post bill "${id}": it has no value to record (subtotal, tax, and total are all zero).`);
    }

    const extraJournal: ExtraJournalLine[] = [];
    if (expenseDebit > 0) {
      extraJournal.push({ accountId: await this.accounts.getAccountId('EXPENSE'), debit: expenseDebit, credit: 0, description: docLabel });
    }
    if (deductibleVat > 0) {
      extraJournal.push({ accountId: await this.accounts.getAccountId('VAT_INPUT'), debit: deductibleVat, credit: 0, description: `${docLabel} - VAT Input` });
    }
    if (fixedAssetValue > 0) {
      extraJournal.push({ accountId: await this.accounts.getAccountId('FIXED_ASSET'), debit: fixedAssetValue, credit: 0, description: `${docLabel} - Fixed Assets` });
    }

    const lines: InventoryTransactionLine[] = [];
    let apCredit = bill.total;
    if (inventoryValue > 0) {
      if (grniAlreadyRecognized) {
        extraJournal.push({
          accountId: await this.inventoryAccounts.resolveKey('GRNI'),
          debit: inventoryValue,
          credit: 0,
          description: `${docLabel} - GRNI clearing`,
        });
      } else {
        for (const { line, product } of inventoryLines) {
          lines.push({
            productId: product.id,
            warehouseId: await requireWarehouseId(this.warehouses, line.warehouseId, docLabel),
            quantityDelta: line.quantity,
            costingMode: 'receipt',
            unitCostIn: line.unitPrice,
            inventoryAccountId: await this.inventoryAccounts.resolveForProduct(product, 'inventory'),
            contraAccountId: await this.inventoryAccounts.resolveKey('AP'),
            sourceDocumentLineId: line.id,
            nonStock: false,
          });
        }
        apCredit = roundToCents(bill.total - inventoryValue);
      }
    }
    if (apCredit > 0) {
      extraJournal.push({ accountId: await this.accounts.getAccountId('AP'), debit: 0, credit: apCredit, description: docLabel });
    }

    const result = await this.engine.applyInventoryTransaction({
      postingKey: `bill:${bill.id}:post`,
      sourceType: 'bill',
      sourceId: bill.id,
      movementDate: toMovementDate(bill.issueDate),
      createdBy: SYSTEM_USER_ID,
      lines,
      extraJournal,
      journal: { source: 'bill', memo: docLabel },
    });

    for (const line of fixedAssetLines) {
      await this.fixedAssetCapitalizer.capitalizeFromBillLine({
        sourceBillId: bill.id,
        journalEntryId: result.journalEntryId!,
        name: line.description,
        category: line.fixedAssetDetails!.category,
        acquisitionDate: bill.issueDate,
        cost: line.lineTotal,
        residualValue: line.fixedAssetDetails!.residualValue,
        usefulLifeYears: line.fixedAssetDetails!.usefulLifeYears,
        depreciationMethod: line.fixedAssetDetails!.depreciationMethod,
        reducingBalanceRatePercent: line.fixedAssetDetails!.reducingBalanceRatePercent,
        taxWearTearRatePercent: line.fixedAssetDetails!.taxWearTearRatePercent,
      });
    }

    return this.repository.update(id, { status: 'awaiting_payment', journalEntryId: result.journalEntryId });
  }

  /**
   * Records a payment against a bill.
   */
  async recordPayment(id: string, amount: number): Promise<Bill> {
    const bill = await this.repository.getById(id);
    if (!bill) {
      throw new Error(`Bill "${id}" not found`);
    }

    const newAmountPaid = bill.amountPaid + amount;
    let newStatus: Bill['status'] = bill.status;

    if (newAmountPaid >= bill.total) {
      newStatus = 'paid';
    } else if (newAmountPaid > 0) {
      newStatus = 'partially_paid';
    }

    return this.repository.update(id, {
      amountPaid: newAmountPaid,
      status: newStatus,
    });
  }

  /**
   * Marks a bill as overdue (typically called by a batch job or manually).
   */
  async markAsOverdue(id: string): Promise<Bill> {
    return this.repository.update(id, { status: 'overdue' });
  }

  /**
   * Voids a DRAFT bill (soft cancel — marks 'void' instead of removing the
   * row). A posted bill cannot be voided (Phase 3C item 5): voiding a posted
   * bill would leave its journal entry and stock movements live while the
   * document reads "void" — a subledger ↔ GL inconsistency. There is no
   * product requirement for voiding a posted bill; correct one via a supplier
   * return (which atomically reverses stock + GL) or a compensating manual
   * journal entry. (The generic JournalEntryService.reverseJournalEntry() now
   * refuses `bill`-sourced entries — reversing one from the GL alone would
   * leave bill.amountPaid / status out of step with the ledger.)
   */
  async voidBill(id: string): Promise<Bill> {
    const bill = await this.repository.getById(id);
    if (!bill) {
      throw new Error(`Bill "${id}" not found`);
    }
    if (bill.status !== 'draft') {
      throw new Error(
        `Cannot void bill "${id}": only a draft bill can be voided (current status: ${bill.status}). ` +
          `Raise a supplier return, or post a compensating manual journal entry, to unwind a posted bill.`,
      );
    }
    return this.repository.update(id, { status: 'void' });
  }

  /**
   * Get bills by status.
   */
  async getBillsByStatus(status: Bill['status']): Promise<Bill[]> {
    const all = await this.repository.getAll();
    return all.filter((b) => b.status === status);
  }

  /**
   * Get bills for a specific supplier.
   */
  async getBillsBySupplier(supplierId: string): Promise<Bill[]> {
    const all = await this.repository.getAll();
    return all.filter((b) => b.supplierId === supplierId);
  }

  /**
   * Get outstanding bills (not fully paid).
   */
  async getOutstandingBills(): Promise<Bill[]> {
    const all = await this.repository.getAll();
    return all.filter((b) => b.amountPaid < b.total && b.status !== 'void');
  }

  /**
   * Calculate total outstanding amount across all bills.
   */
  async calculateTotalOutstanding(): Promise<number> {
    const bills = await this.getOutstandingBills();
    return bills.reduce((sum, b) => sum + (b.total - b.amountPaid), 0);
  }
}
