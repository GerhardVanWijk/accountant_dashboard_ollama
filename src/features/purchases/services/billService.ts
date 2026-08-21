import type { Bill, ID, JournalEntry } from '@/types';
import type { IBillRepository } from '@/repositories/IBillRepository';
import type { NewJournalLineInput } from '@/features/accounting/services';

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

  async deleteBill(id: string): Promise<void> {
    return this.repository.delete(id);
  }

  /**
   * Posts a bill to accounts payable: debit Operating Expenses for the
   * subtotal, debit VAT Input for the tax total (only when it's non-zero —
   * a zero-rated/exempt bill has no VAT line), credit Accounts Payable for
   * the bill total. GL posting happens FIRST — if postJournalEntry() throws
   * (unbalanced lines or a closed accounting period), this method throws
   * too and the bill is never transitioned, so a failed post never leaves
   * an orphaned "posted" row (same ordering bankTransactionService.ts
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

    const lines: NewJournalLineInput[] = [
      {
        accountId: EXPENSE_ACCOUNT_ID,
        description: `Bill ${bill.billNumber}`,
        debit: bill.subtotal,
        credit: 0,
      },
    ];

    if (bill.taxTotal > 0) {
      lines.push({
        accountId: VAT_INPUT_ACCOUNT_ID,
        description: `Bill ${bill.billNumber} - VAT Input`,
        debit: bill.taxTotal,
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
