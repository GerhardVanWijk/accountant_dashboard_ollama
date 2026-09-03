import type { SupabaseClient } from '@supabase/supabase-js';
import type { CustomerReceipt, ID, Invoice } from '@/types';
import type { ICustomerReceiptRepository } from '@/repositories/ICustomerReceiptRepository';
import type { AccountMapper, NewJournalLineInput } from '@/features/accounting/services';

/**
 * One logical "apply an existing customer deposit to an invoice" operation.
 *
 * The real executor is the atomic Postgres RPC `apply_customer_deposit`
 * (migration 0046): one implicit transaction that records the idempotency
 * key, locks the receipt + invoice rows, re-validates the amount against the
 * locked rows, posts DR 2600 / CR 1100, and updates both subledgers — all or
 * nothing. `RealDepositAllocationExecutor` calls it; `FakeDepositAllocationExecutor`
 * mirrors its exact logic over the in-memory mocks for tests. Same
 * Real/Fake split as `InventoryTransactionExecutor` (inventoryPostingEngine.ts).
 */
export interface DepositAllocationRequest {
  /**
   * Stable, immutable identity of this logical allocation — a UUID
   * generated client-side BEFORE the RPC runs. A retry of the same intent
   * re-uses it (the RPC returns the first result); a genuinely new
   * allocation gets a fresh one. De-duplicated by
   * `deposit_allocation_log`'s UNIQUE (company_id, allocation_id). Never
   * derived from mutable state such as `allocations.length`.
   */
  allocationId: ID;
  receiptId: ID;
  invoiceId: ID;
  amount: number;
  /** ISO date/date-time recorded on the journal entry; must fall in an open period. */
  date: string;
  createdBy: ID;
}

export interface DepositAllocationResult {
  /** true when this exact allocation id was already posted — nothing new happened. */
  idempotent: boolean;
  journalEntryId?: ID;
  appliedAmount: number;
}

export interface DepositAllocationExecutor {
  apply(request: DepositAllocationRequest): Promise<DepositAllocationResult>;
}

interface ApplyCustomerDepositRow {
  idempotent: boolean;
  journal_entry_id: string | null;
  applied_amount: number | string;
}

/** Production: the atomic `apply_customer_deposit` RPC (migration 0046). */
export class RealDepositAllocationExecutor implements DepositAllocationExecutor {
  constructor(private readonly client: SupabaseClient) {}

  async apply(request: DepositAllocationRequest): Promise<DepositAllocationResult> {
    const { data, error } = await this.client.rpc('apply_customer_deposit', {
      p_allocation_id: request.allocationId,
      p_receipt_id: request.receiptId,
      p_invoice_id: request.invoiceId,
      p_amount: request.amount,
      p_date: request.date,
      p_created_by: request.createdBy,
    });
    if (error) throw new Error(`apply_customer_deposit: ${error.message}`);
    const row = data as ApplyCustomerDepositRow;
    return {
      idempotent: row.idempotent,
      journalEntryId: row.journal_entry_id ?? undefined,
      appliedAmount: Number(row.applied_amount),
    };
  }
}

/** Minimal surfaces the fake executor needs — matches CustomerReceiptService's own deps. */
export interface FakeDepositAllocationDeps {
  journal: {
    postJournalEntry(input: {
      date: string;
      memo?: string;
      source: string;
      lines: NewJournalLineInput[];
      postedByUserId?: ID;
    }): Promise<{ id: ID }>;
  };
  invoices: {
    getInvoice(id: ID): Promise<Invoice | undefined>;
    recordPayment(id: ID, amount: number): Promise<unknown>;
  };
  receipts: ICustomerReceiptRepository;
  accounts: AccountMapper;
}

/**
 * Test double. Mirrors `apply_customer_deposit` step for step — including
 * de-duplication on the stable `allocationId` and re-validation of the
 * amount against the *current* (mock-repo) receipt/invoice state — so
 * `CustomerReceiptService` tests exercise the same observable contract the
 * production RPC provides.
 */
export class FakeDepositAllocationExecutor implements DepositAllocationExecutor {
  private readonly log = new Map<ID, { journalEntryId?: ID; amount: number }>();

  constructor(private readonly deps: FakeDepositAllocationDeps) {}

  async apply(request: DepositAllocationRequest): Promise<DepositAllocationResult> {
    const seen = this.log.get(request.allocationId);
    if (seen) {
      return { idempotent: true, journalEntryId: seen.journalEntryId, appliedAmount: seen.amount };
    }

    const amount = Math.round(request.amount * 100) / 100;
    if (amount <= 0) throw new Error('apply_customer_deposit: amount must be greater than zero');

    const receipt: CustomerReceipt | undefined = await this.deps.receipts.getById(request.receiptId);
    if (!receipt) throw new Error(`apply_customer_deposit: receipt ${request.receiptId} not found in company`);
    const invoice = await this.deps.invoices.getInvoice(request.invoiceId);
    if (!invoice) throw new Error(`apply_customer_deposit: invoice ${request.invoiceId} not found in company`);

    if (receipt.customerId !== invoice.customerId) {
      throw new Error('apply_customer_deposit: receipt and invoice belong to different customers');
    }
    if (invoice.status === 'draft' || invoice.status === 'void') {
      throw new Error(`apply_customer_deposit: invoice ${request.invoiceId} is ${invoice.status} — cannot apply a deposit to it`);
    }
    if (amount - receipt.unallocatedAmount > 0.005) {
      throw new Error(`apply_customer_deposit: only ${receipt.unallocatedAmount} remains unapplied on receipt ${request.receiptId}`);
    }
    if (amount - (invoice.total - invoice.amountPaid) > 0.005) {
      throw new Error(`apply_customer_deposit: invoice ${request.invoiceId} has only ${invoice.total - invoice.amountPaid} outstanding`);
    }

    // reserve the id before doing the writes (mirrors the log INSERT)
    this.log.set(request.allocationId, { amount });

    const entry = await this.deps.journal.postJournalEntry({
      date: request.date,
      memo: `Apply customer deposit ${receipt.receiptNumber} -> invoice ${invoice.invoiceNumber}`,
      source: 'customer_receipt_allocation',
      lines: [
        {
          accountId: await this.deps.accounts.getAccountId('CUSTOMER_DEPOSIT'),
          description: `Deposit applied - ${receipt.receiptNumber}`,
          debit: amount,
          credit: 0,
        },
        {
          accountId: await this.deps.accounts.getAccountId('AR'),
          description: `Deposit applied - ${receipt.receiptNumber}`,
          debit: 0,
          credit: amount,
        },
      ],
    });

    await this.deps.invoices.recordPayment(request.invoiceId, amount);
    await this.deps.receipts.update(request.receiptId, {
      allocations: [
        ...receipt.allocations,
        {
          id: request.allocationId,
          invoiceId: request.invoiceId,
          amount,
          journalEntryId: entry.id,
          allocatedAt: new Date().toISOString(),
        },
      ],
      unallocatedAmount: Math.max(0, receipt.unallocatedAmount - amount),
    });

    this.log.set(request.allocationId, { journalEntryId: entry.id, amount });
    return { idempotent: false, journalEntryId: entry.id, appliedAmount: amount };
  }
}
