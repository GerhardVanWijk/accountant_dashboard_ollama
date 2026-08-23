import type { CustomerReceipt, ID } from '@/types';
import type { ICustomerReceiptRepository } from '@/repositories/ICustomerReceiptRepository';
import type { AccountMapper, NewJournalLineInput } from '@/features/accounting/services';

export type CreateCustomerReceiptDTO = Omit<CustomerReceipt, 'id' | 'createdAt' | 'updatedAt' | 'journalEntryId'>;

/**
 * Minimal surface of JournalEntryService this service depends on. Mirrors
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

/**
 * Minimal surface of InvoiceService this service depends on — see
 * InvoiceService.recordPayment(), reused rather than reimplemented so a
 * receipt's invoice allocations stay consistent with every other place
 * that updates amountPaid/status.
 */
export interface InvoicePaymentRecorder {
  recordPayment(invoiceId: string, amount: number): Promise<unknown>;
}

/**
 * Every receipt posts to the default Cash and Bank control account
 * regardless of `bankAccountId` — resolving the actual bank account's real
 * GL mapping is explicitly out of scope this wave; the Banking module
 * itself posts against a fixed default account too right now (a known,
 * already-flagged gap, not a new one introduced here).
 */
const BALANCE_EPSILON = 0.01;

/**
 * Business-logic layer for Customer Receipts (money received against
 * Accounts Receivable). Unlike Invoices/Credit Notes, a receipt has no
 * separate draft/issued lifecycle — recording one IS posting it: creation
 * posts a balanced journal entry, then applies each allocation via
 * InvoiceService.recordPayment(). See docs/LEDGER_ARCHITECTURE.md.
 */
export class CustomerReceiptService {
  constructor(
    private readonly repository: ICustomerReceiptRepository,
    private readonly journalEntryService: JournalPoster,
    private readonly invoiceService: InvoicePaymentRecorder,
    private readonly accounts: AccountMapper,
  ) {}

  async getReceipts(): Promise<CustomerReceipt[]> {
    return this.repository.getAll();
  }

  async getReceipt(id: string): Promise<CustomerReceipt | undefined> {
    return this.repository.getById(id);
  }

  /**
   * Records (and posts) a new customer receipt.
   *
   * debit  Cash and Bank        for the receipt amount
   * credit Accounts Receivable  for the receipt amount
   *
   * Posts BEFORE creating the domain record — see
   * docs/LEDGER_ARCHITECTURE.md and bankTransactionService.ts's
   * postAllocationsToLedger — so a failed post never leaves an orphaned
   * receipt row. Once the record exists, each `{invoiceId, amount}` in
   * `allocations` is applied via InvoiceService.recordPayment().
   */
  async recordReceipt(data: CreateCustomerReceiptDTO, postedByUserId?: ID): Promise<CustomerReceipt> {
    if (data.amount <= 0) {
      throw new Error('Receipt amount must be greater than zero.');
    }
    const allocatedTotal = data.allocations.reduce((sum, a) => sum + a.amount, 0);
    if (Math.abs(allocatedTotal + data.unallocatedAmount - data.amount) > BALANCE_EPSILON) {
      throw new Error(
        `Allocations (${allocatedTotal.toFixed(2)}) plus unallocated amount (${data.unallocatedAmount.toFixed(2)}) must equal the receipt amount (${data.amount.toFixed(2)}).`,
      );
    }
    data.allocations.forEach((a, i) => {
      if (a.amount <= 0) throw new Error(`Allocation line ${i + 1}: amount must be greater than zero.`);
    });

    const lines: NewJournalLineInput[] = [
      {
        accountId: await this.accounts.getAccountId('CASH_AND_BANK'),
        description: `Receipt ${data.receiptNumber}`,
        debit: data.amount,
        credit: 0,
      },
      {
        accountId: await this.accounts.getAccountId('AR'),
        description: `Receipt ${data.receiptNumber}`,
        debit: 0,
        credit: data.amount,
      },
    ];

    const entry = await this.journalEntryService.postJournalEntry({
      date: data.date,
      memo: `Customer Receipt ${data.receiptNumber}`,
      source: 'customer_receipt',
      postedByUserId,
      lines,
    });

    const now = new Date().toISOString();
    const receipt = await this.repository.create({
      ...data,
      id: '',
      journalEntryId: entry.id,
      createdAt: now,
      updatedAt: now,
    });

    for (const allocation of data.allocations) {
      await this.invoiceService.recordPayment(allocation.invoiceId, allocation.amount);
    }

    return receipt;
  }

  /**
   * Applies more of an already-recorded receipt's unallocated balance to
   * an invoice — the "apply payment on account" follow-up once the
   * customer/invoice is known.
   */
  async allocateToInvoice(id: string, invoiceId: string, amount: number): Promise<CustomerReceipt> {
    const receipt = await this.requireReceipt(id);
    if (amount <= 0) {
      throw new Error('Allocation amount must be greater than zero.');
    }
    if (amount - receipt.unallocatedAmount > BALANCE_EPSILON) {
      throw new Error(
        `Cannot allocate ${amount.toFixed(2)}: only ${receipt.unallocatedAmount.toFixed(2)} remains unallocated on receipt "${id}".`,
      );
    }

    await this.invoiceService.recordPayment(invoiceId, amount);

    return this.repository.update(id, {
      allocations: [...receipt.allocations, { invoiceId, amount }],
      unallocatedAmount: Math.max(0, receipt.unallocatedAmount - amount),
    });
  }

  /** Get receipts for a specific customer. */
  async getReceiptsByCustomer(customerId: string): Promise<CustomerReceipt[]> {
    const all = await this.repository.getAll();
    return all.filter((r) => r.customerId === customerId);
  }

  /** Search receipts by receipt number, reference, or customer ID. */
  async searchReceipts(query: string): Promise<CustomerReceipt[]> {
    const all = await this.repository.getAll();
    const lowerQuery = query.toLowerCase();
    return all.filter(
      (r) =>
        r.receiptNumber.toLowerCase().includes(lowerQuery) ||
        r.customerId.toLowerCase().includes(lowerQuery) ||
        (r.reference ?? '').toLowerCase().includes(lowerQuery),
    );
  }

  private async requireReceipt(id: string): Promise<CustomerReceipt> {
    const receipt = await this.repository.getById(id);
    if (!receipt) {
      throw new Error(`Customer receipt "${id}" not found`);
    }
    return receipt;
  }
}
