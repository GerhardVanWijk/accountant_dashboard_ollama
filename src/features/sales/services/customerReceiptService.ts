import type { CustomerReceipt, ID } from '@/types';
import type { ICustomerReceiptRepository } from '@/repositories/ICustomerReceiptRepository';
import type { AccountMapper, NewJournalLineInput } from '@/features/accounting/services';
import { newUuid } from '@/lib/uuid';
import type { DepositAllocationExecutor } from './depositAllocationExecutor';

export type CreateCustomerReceiptDTO = Omit<CustomerReceipt, 'id' | 'createdAt' | 'updatedAt' | 'journalEntryId'>;

/**
 * Minimal surface of JournalEntryService this service depends on. Mirrors
 * src/features/banking/services/bankTransactionService.ts's JournalPoster.
 * Used only by `recordReceipt` (the initial split posting); the later
 * `allocateToInvoice` goes through the atomic `DepositAllocationExecutor`.
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

/** Round to cents so a split journal entry always balances exactly. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

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
    /**
     * The atomic, idempotent, concurrency-safe executor for applying a
     * customer deposit to an invoice (`apply_customer_deposit` RPC,
     * migration 0046). Same Real/Fake split as InvoiceService's engine.
     */
    private readonly depositAllocationExecutor: DepositAllocationExecutor,
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
   * The receipt is one balanced journal entry, split by how the money is
   * being applied (Increment 4A — customer deposits / contract liability):
   *
   *   DR Cash and Bank                    receipt.amount
   *     CR Accounts Receivable            Σ allocations           (money applied to open invoices)
   *     CR Customer Deposits (2600)       unallocatedAmount       (money not yet earned/applied)
   *
   * A fully-allocated receipt has no Customer Deposits line; a pure deposit
   * (no allocations) has no Accounts Receivable line. Posts BEFORE creating
   * the domain record — see docs/LEDGER_ARCHITECTURE.md — so a failed post
   * never leaves an orphaned receipt row. Once the record exists, each
   * `{invoiceId, amount}` in `allocations` is applied via
   * InvoiceService.recordPayment() (the AR credit above already moved the
   * money; recordPayment only updates the invoice subledger).
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

    const appliedToAr = round2(allocatedTotal);
    const toDeposits = Math.max(0, round2(data.amount - appliedToAr));

    const lines: NewJournalLineInput[] = [
      {
        accountId: await this.accounts.getAccountId('CASH_AND_BANK'),
        description: `Receipt ${data.receiptNumber}`,
        debit: data.amount,
        credit: 0,
      },
    ];
    if (appliedToAr > 0) {
      lines.push({
        accountId: await this.accounts.getAccountId('AR'),
        description: `Receipt ${data.receiptNumber} — applied to invoices`,
        debit: 0,
        credit: appliedToAr,
      });
    }
    if (toDeposits > 0) {
      lines.push({
        accountId: await this.accounts.getAccountId('CUSTOMER_DEPOSIT'),
        description: `Receipt ${data.receiptNumber} — customer deposit (unapplied)`,
        debit: 0,
        credit: toDeposits,
      });
    }

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
   * Applies more of an already-recorded receipt's unallocated balance
   * (its Customer Deposits liability) to an invoice — the "apply the
   * deposit" follow-up once the invoice exists.
   *
   * The whole operation is a SINGLE atomic transaction inside the
   * `apply_customer_deposit` RPC (migration 0046): it records the
   * idempotency key, LOCKS the receipt + invoice rows, re-validates the
   * amount against the LOCKED rows, posts
   *
   *   DR Customer Deposits (2600)   amount        (NO bank movement)
   *     CR Accounts Receivable       amount
   *
   * and updates both subledgers (invoice.amountPaid/status,
   * receipt.allocations/unallocatedAmount) — all or nothing. Concurrent
   * calls cannot double-post: the `deposit_allocation_log` UNIQUE
   * (company_id, posting_key) de-duplicates identical submits, and the row
   * locks serialise different-key calls against the same deposit so a stale
   * client can never over-draw it.
   *
   * `allocationId` is the STABLE identity of this logical allocation — a
   * UUID the UI generates once per "apply deposit" intent and re-uses on
   * retry, so a lost-response retry de-duplicates and a genuinely new
   * allocation gets a fresh id. Callers that don't supply one (a script,
   * an isolated test) get a fresh id per call. Never derived from
   * `allocations.length`. The pre-RPC checks here are a fast-fail
   * courtesy; the RPC re-checks everything against locked rows.
   */
  async allocateToInvoice(
    id: string,
    invoiceId: string,
    amount: number,
    allocationId: string = newUuid(),
  ): Promise<CustomerReceipt> {
    const receipt = await this.requireReceipt(id);
    if (amount <= 0) {
      throw new Error('Allocation amount must be greater than zero.');
    }
    if (amount - receipt.unallocatedAmount > BALANCE_EPSILON) {
      throw new Error(
        `Cannot allocate ${amount.toFixed(2)}: only ${receipt.unallocatedAmount.toFixed(2)} remains unallocated on receipt "${id}".`,
      );
    }

    await this.depositAllocationExecutor.apply({
      allocationId,
      receiptId: receipt.id,
      invoiceId,
      amount,
      date: today(),
      createdBy: 'system',
    });

    return this.requireReceipt(id);
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
