import type { Bill, ID, JournalEntry } from '@/types';
import type { IBillRepository } from '@/repositories/IBillRepository';
import type { NewJournalLineInput } from '@/features/accounting/services';

/**
 * Minimal surface of TaxRateService this service depends on — resolving a
 * line's `taxRateId` to its VAT `treatment` is all `postBill()` needs, so
 * it depends on this narrow interface rather than the whole service.
 */
export interface TaxRateResolver {
  getTaxRate(id: ID): Promise<{ treatment: string } | undefined>;
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

/** Fixed GL account ids (src/mock-data/accounts.ts) this service posts against. */
const EXPENSE_ACCOUNT_ID = 'acc_5100'; // Operating Expenses
const VAT_INPUT_ACCOUNT_ID = 'acc_2110'; // VAT Input (Receivable)
const AP_ACCOUNT_ID = 'acc_2000'; // Accounts Payable

/**
 * Business-logic layer for supplier bills.
 * Handles bill creation, updates, status changes, and GL posting.
 */
export class BillService {
  constructor(
    private readonly repository: IBillRepository,
    private readonly journalEntryService: JournalPoster,
    private readonly taxRateResolver: TaxRateResolver,
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
   * Posts a bill to accounts payable: debit Operating Expenses for the
   * subtotal (plus any non-deductible VAT — see splitDeductibleVat()),
   * debit VAT Input for the DEDUCTIBLE tax only, credit Accounts Payable
   * for the bill total. GL posting happens FIRST — if postJournalEntry()
   * throws (unbalanced lines or a closed accounting period), this method
   * throws too and the bill is never transitioned, so a failed post never
   * leaves an orphaned "posted" row (same ordering bankTransactionService.ts
   * uses). Only a 'draft' bill may be posted, so the same bill can never be
   * posted to the ledger twice.
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

    const lines: NewJournalLineInput[] = [
      {
        accountId: EXPENSE_ACCOUNT_ID,
        description: `Bill ${bill.billNumber}`,
        debit: bill.subtotal + nonDeductibleVat,
        credit: 0,
      },
    ];

    if (deductibleVat > 0) {
      lines.push({
        accountId: VAT_INPUT_ACCOUNT_ID,
        description: `Bill ${bill.billNumber} - VAT Input`,
        debit: deductibleVat,
        credit: 0,
      });
    }

    lines.push({
      accountId: AP_ACCOUNT_ID,
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
