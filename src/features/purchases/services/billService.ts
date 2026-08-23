import type { AssetCategory, Bill, DepreciationMethod, ID, JournalEntry } from '@/types';
import type { IBillRepository } from '@/repositories/IBillRepository';
import type { AccountMapper, NewJournalLineInput } from '@/features/accounting/services';

/**
 * Minimal surface of TaxRateService this service depends on — resolving a
 * line's `taxRateId` to its VAT `treatment` is all `postBill()` needs, so
 * it depends on this narrow interface rather than the whole service.
 */
export interface TaxRateResolver {
  getTaxRate(id: ID): Promise<{ treatment: string } | undefined>;
}

/**
 * Minimal surface of InventoryPoster this service depends on
 * (src/features/inventory/services/inventoryPostingAdapter.ts) — a bill
 * for tracked inventory must capitalize to the Inventory asset rather than
 * being expensed, and stock must increase once the bill posts, per
 * SA_ACCOUNTING_MASTER_SPEC.md §22-§24.
 */
export interface InventoryReceiver {
  isTrackedInventory(productId: ID): Promise<boolean>;
  recordReceiptMovement(productId: ID, quantity: number, unitCost: number, reference: string, warehouseId?: ID): Promise<void>;
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
 * Minimal surface of JournalEntryService that BillService depends on — an
 * interface, not the concrete class, so this service stays unit-testable
 * with a stub and never needs to reach into src/features/accounting
 * internals beyond its published service API
 * (@/features/accounting/services). Mirrors bankTransactionService.ts's
 * JournalPoster exactly, per this dispatch's brief.
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

/**
 * Business-logic layer for supplier bills.
 * Handles bill creation, updates, status changes, and GL posting.
 */
export class BillService {
  constructor(
    private readonly repository: IBillRepository,
    private readonly journalEntryService: JournalPoster,
    private readonly taxRateResolver: TaxRateResolver,
    private readonly inventoryReceiver: InventoryReceiver,
    private readonly purchaseOrders: PurchaseOrderLookup,
    private readonly fixedAssetCapitalizer: FixedAssetCapitalizer,
    private readonly accounts: AccountMapper,
  ) {}

  async getBills(): Promise<Bill[]> {
    return this.repository.getAll();
  }

  async getBill(id: string): Promise<Bill | undefined> {
    return this.repository.getById(id);
  }

  async createBill(data: CreateBillDTO): Promise<Bill> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateBill(id: string, patch: Partial<Bill>): Promise<Bill> {
    return this.repository.update(id, patch);
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
    inventoryLines: Bill['lineItems'];
    fixedAssetValue: number;
    fixedAssetLines: Bill['lineItems'];
  }> {
    let inventoryValue = 0;
    let expenseValue = 0;
    let fixedAssetValue = 0;
    const inventoryLines: Bill['lineItems'] = [];
    const fixedAssetLines: Bill['lineItems'] = [];
    for (const line of bill.lineItems) {
      if (line.fixedAssetDetails) {
        fixedAssetValue += line.lineTotal;
        fixedAssetLines.push(line);
      } else if (line.productId && (await this.inventoryReceiver.isTrackedInventory(line.productId))) {
        inventoryValue += line.lineTotal;
        inventoryLines.push(line);
      } else {
        expenseValue += line.lineTotal;
      }
    }
    return { expenseValue, inventoryValue, inventoryLines, fixedAssetValue, fixedAssetLines };
  }

  /**
   * Posts a bill to accounts payable: debit Operating Expenses for
   * non-inventory lines (plus any non-deductible VAT — see
   * splitDeductibleVat()), debit VAT Input for the DEDUCTIBLE tax only,
   * credit Accounts Payable for the bill total. GL posting happens FIRST,
   * and stock is only increased AFTER it succeeds — if postJournalEntry()
   * throws (unbalanced lines or a closed accounting period), this method
   * throws too and neither the bill nor stock ever changes (same ordering
   * bankTransactionService.ts uses). Only a 'draft' bill may be posted, so
   * the same bill can never be posted to the ledger twice.
   *
   * Tracked-inventory lines (§22) split on whether this bill's PO already
   * had its goods receipt posted (`purchaseOrderService.recordReceipt()`,
   * 3-way PO/GRN/Invoice matching):
   *   - PO not GRNI-received (no `purchaseOrderId`, or its receipt was
   *     never recorded): debit Inventory (as before), then record the
   *     stock receipt now via `recordReceiptMovement()`.
   *   - PO already GRNI-received: debit GRNI instead (clearing the
   *     liability recorded at receipt time), and do NOT call
   *     `recordReceiptMovement()` again — stock and its GL value were
   *     already recognized then; recording it again here would
   *     double-count both the quantity and the weighted-average cost
   *     recalculation.
   *
   * A line flagged `fixedAssetDetails` (§116 Phase 7) debits Fixed Assets
   * instead of Expense/Inventory. AFTER the entry posts,
   * `fixedAssetCapitalizer.capitalizeFromBillLine()` writes the register
   * row directly as 'active' with `journalEntryId` pointing at THIS same
   * entry — the Bill's posting is the only capitalization event, there is
   * no separate acquisition entry (see FixedAssetService.
   * capitalizeFromBillLine()'s doc comment).
   */
  async postBill(id: string): Promise<Bill> {
    const bill = await this.repository.getById(id);
    if (!bill) {
      throw new Error(`Bill "${id}" not found`);
    }
    if (bill.status !== 'draft') {
      throw new Error(`Bill "${id}" has already been posted (status: ${bill.status}).`);
    }

    const { deductibleVat, nonDeductibleVat } = await this.splitDeductibleVat(bill);
    const { expenseValue, inventoryValue, inventoryLines, fixedAssetValue, fixedAssetLines } = await this.splitLineItems(bill);
    const linkedPO = bill.purchaseOrderId ? await this.purchaseOrders.getPurchaseOrder(bill.purchaseOrderId) : undefined;
    const grniAlreadyRecognized = Boolean(linkedPO?.journalEntryId);

    const lines: NewJournalLineInput[] = [];
    const expenseDebit = expenseValue + nonDeductibleVat;
    if (expenseDebit > 0) {
      lines.push({
        accountId: await this.accounts.getAccountId('EXPENSE'),
        description: `Bill ${bill.billNumber}`,
        debit: expenseDebit,
        credit: 0,
      });
    }
    if (inventoryValue > 0) {
      lines.push({
        accountId: await this.accounts.getAccountId(grniAlreadyRecognized ? 'GRNI' : 'INVENTORY'),
        description: grniAlreadyRecognized
          ? `Bill ${bill.billNumber} - GRNI clearing`
          : `Bill ${bill.billNumber} - Inventory`,
        debit: inventoryValue,
        credit: 0,
      });
    }
    if (fixedAssetValue > 0) {
      lines.push({
        accountId: await this.accounts.getAccountId('FIXED_ASSET'),
        description: `Bill ${bill.billNumber} - Fixed Assets`,
        debit: fixedAssetValue,
        credit: 0,
      });
    }
    if (lines.length === 0 && deductibleVat === 0 && bill.total === 0) {
      // A genuinely zero-value bill (no line items, no tax) has nothing
      // real to post — a fake zero-amount line would itself violate
      // validateLines(), and there is no meaningful journal entry here.
      throw new Error(`Cannot post bill "${id}": it has no value to record (subtotal, tax, and total are all zero).`);
    }

    if (deductibleVat > 0) {
      lines.push({
        accountId: await this.accounts.getAccountId('VAT_INPUT'),
        description: `Bill ${bill.billNumber} - VAT Input`,
        debit: deductibleVat,
        credit: 0,
      });
    }

    lines.push({
      accountId: await this.accounts.getAccountId('AP'),
      description: `Bill ${bill.billNumber}`,
      debit: 0,
      credit: bill.total,
    });

    const entry = await this.journalEntryService.postJournalEntry({
      date: bill.issueDate,
      memo: `Bill ${bill.billNumber}`,
      source: 'bill',
      lines,
    });

    if (!grniAlreadyRecognized) {
      await Promise.all(
        inventoryLines.map((line) =>
          this.inventoryReceiver.recordReceiptMovement(
            line.productId!,
            line.quantity,
            line.unitPrice,
            `Bill ${bill.billNumber}`,
            line.warehouseId,
          ),
        ),
      );
    }

    await Promise.all(
      fixedAssetLines.map((line) =>
        this.fixedAssetCapitalizer.capitalizeFromBillLine({
          sourceBillId: bill.id,
          journalEntryId: entry.id,
          name: line.description,
          category: line.fixedAssetDetails!.category,
          acquisitionDate: bill.issueDate,
          cost: line.lineTotal,
          residualValue: line.fixedAssetDetails!.residualValue,
          usefulLifeYears: line.fixedAssetDetails!.usefulLifeYears,
          depreciationMethod: line.fixedAssetDetails!.depreciationMethod,
          reducingBalanceRatePercent: line.fixedAssetDetails!.reducingBalanceRatePercent,
          taxWearTearRatePercent: line.fixedAssetDetails!.taxWearTearRatePercent,
        }),
      ),
    );

    return this.repository.update(id, { status: 'awaiting_payment', journalEntryId: entry.id });
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
   * Voids a bill (soft delete - marks as void instead of removing).
   */
  async voidBill(id: string): Promise<Bill> {
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
