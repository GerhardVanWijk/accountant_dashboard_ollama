import type { ID, Invoice } from '@/types';
import type { IInvoiceRepository } from '@/repositories/IInvoiceRepository';
import type { NewJournalLineInput } from '@/features/accounting/services';

export type CreateInvoiceDTO = Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Minimal surface of JournalEntryService that InvoiceService depends on —
 * an interface, not the concrete class, so this service stays
 * unit-testable with a stub and never needs to reach into
 * src/features/accounting internals beyond its published service API
 * (@/features/accounting/services). Mirrors
 * src/features/banking/services/bankTransactionService.ts's JournalPoster.
 */
export interface JournalPoster {
  postJournalEntry(input: {
    date: string;
    memo?: string;
    source: string;
    lines: NewJournalLineInput[];
    postedByUserId?: ID;
  }): Promise<{ id: ID }>;
}

/** Fixed Chart of Accounts ids this service posts against (src/mock-data/accounts.ts). */
const AR_ACCOUNT_ID = 'acc_1100'; // Accounts Receivable
const SALES_REVENUE_ACCOUNT_ID = 'acc_4000'; // Sales Revenue
const VAT_OUTPUT_ACCOUNT_ID = 'acc_2100'; // VAT Output (Payable)

/**
 * Business-logic layer between hooks/components and the repository.
 * Handles invoice operations including CRUD, status transitions, payment
 * tracking, and GL posting for the draft -> sent transition.
 */
export class InvoiceService {
  constructor(
    private readonly repository: IInvoiceRepository,
    private readonly journalEntryService: JournalPoster,
  ) {}

  async getInvoices(): Promise<Invoice[]> {
    return this.repository.getAll();
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    return this.repository.getById(id);
  }

  async createInvoice(data: CreateInvoiceDTO): Promise<Invoice> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice> {
    return this.repository.update(id, patch);
  }

  async deleteInvoice(id: string): Promise<void> {
    return this.repository.delete(id);
  }

  /**
   * Posts an invoice to the ledger and transitions it from 'draft' to
   * 'sent'. Posts BEFORE updating the domain record — see
   * docs/LEDGER_ARCHITECTURE.md and bankTransactionService.ts's
   * postAllocationsToLedger — so a failed post (unbalanced entry, closed
   * accounting period) never leaves an orphaned "posted" invoice row.
   *
   * debit  Accounts Receivable (acc_1100)  for invoice.total
   * credit Sales Revenue      (acc_4000)  for invoice.subtotal
   * credit VAT Output         (acc_2100)  for invoice.taxTotal (only if > 0)
   */
  async postInvoice(id: string, postedByUserId?: ID): Promise<Invoice> {
    const invoice = await this.repository.getById(id);
    if (!invoice) {
      throw new Error(`Invoice "${id}" not found`);
    }
    if (invoice.status !== 'draft') {
      throw new Error(
        `Cannot post invoice "${id}": only a draft invoice can be posted (current status: ${invoice.status}).`,
      );
    }

    const lines: NewJournalLineInput[] = [
      {
        accountId: AR_ACCOUNT_ID,
        description: `Invoice ${invoice.invoiceNumber}`,
        debit: invoice.total,
        credit: 0,
      },
      {
        accountId: SALES_REVENUE_ACCOUNT_ID,
        description: `Invoice ${invoice.invoiceNumber}`,
        debit: 0,
        credit: invoice.subtotal,
      },
    ];
    if (invoice.taxTotal > 0) {
      lines.push({
        accountId: VAT_OUTPUT_ACCOUNT_ID,
        description: 'VAT Output',
        debit: 0,
        credit: invoice.taxTotal,
      });
    }

    const entry = await this.journalEntryService.postJournalEntry({
      date: invoice.issueDate,
      memo: `Invoice ${invoice.invoiceNumber}`,
      source: 'invoice',
      postedByUserId,
      lines,
    });

    return this.repository.update(id, { status: 'sent', journalEntryId: entry.id });
  }

  /**
   * Mark an invoice as sent (sent to customer). Delegates to postInvoice()
   * so "sent" always means "posted to the GL" — there is no
   * status-only path that skips the ledger.
   */
  async markInvoiceAsSent(id: string, postedByUserId?: ID): Promise<Invoice> {
    return this.postInvoice(id, postedByUserId);
  }

  /**
   * Record a payment against an invoice.
   * Updates amountPaid and recalculates status.
   */
  async recordPayment(id: string, amount: number): Promise<Invoice> {
    const invoice = await this.repository.getById(id);
    if (!invoice) {
      throw new Error(`Invoice ${id} not found`);
    }

    const newAmountPaid = Math.min(invoice.amountPaid + amount, invoice.total);
    let status = invoice.status;

    if (newAmountPaid >= invoice.total) {
      status = 'paid';
    } else if (newAmountPaid > 0) {
      status = 'partially_paid';
    }

    return this.repository.update(id, {
      amountPaid: newAmountPaid,
      status,
    });
  }

  /**
   * Calculate the outstanding amount (total - amountPaid).
   */
  getOutstandingAmount(invoice: Invoice): number {
    return Math.max(0, invoice.total - invoice.amountPaid);
  }

  /**
   * Calculate the collection percentage.
   */
  getCollectionPercentage(invoice: Invoice): number {
    if (invoice.total === 0) return 0;
    return (invoice.amountPaid / invoice.total) * 100;
  }

  /**
   * Check if invoice is overdue (dueDate has passed and status is not 'paid').
   */
  isOverdue(invoice: Invoice): boolean {
    if (invoice.status === 'paid') return false;
    const dueDate = new Date(invoice.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  }

  /**
   * Get invoices filtered by status.
   */
  async getInvoicesByStatus(status: string): Promise<Invoice[]> {
    const invoices = await this.repository.getAll();
    return invoices.filter((inv) => inv.status === status);
  }

  /**
   * Get invoices for a specific customer.
   */
  async getInvoicesByCustomer(customerId: string): Promise<Invoice[]> {
    const invoices = await this.repository.getAll();
    return invoices.filter((inv) => inv.customerId === customerId);
  }

  /**
   * Search invoices by invoice number or customer ID.
   */
  async searchInvoices(query: string): Promise<Invoice[]> {
    const invoices = await this.repository.getAll();
    const lowerQuery = query.toLowerCase();
    return invoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(lowerQuery) ||
        inv.customerId.toLowerCase().includes(lowerQuery),
    );
  }
}
