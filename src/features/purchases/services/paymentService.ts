import type { Bill, ID, JournalEntry, Payment } from '@/types';
import type { IPaymentRepository } from '@/repositories/IPaymentRepository';
import type { AccountMapper, NewJournalLineInput } from '@/features/accounting/services';

export type CreatePaymentDTO = Omit<Payment, 'id' | 'createdAt' | 'updatedAt' | 'journalEntryId' | 'unallocatedAmount'>;

/**
 * Minimal surface of JournalEntryService this service depends on. Mirrors
 * BillService's JournalPoster / bankTransactionService.ts's JournalPoster
 * exactly, per this dispatch's brief.
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
 * Minimal surface of BillService this service depends on — reuses the
 * EXISTING paid/partially_paid status logic rather than reimplementing it,
 * per this dispatch's brief.
 */
export interface BillPaymentRecorder {
  recordPayment(id: ID, amount: number): Promise<Bill>;
}

/**
 * Every Payment posts against the default Cash and Bank control account —
 * resolving a Payment's real bank account to its own GL mapping is out of
 * scope this wave (docs/KNOWN_ISSUES.md), matching Banking's own current
 * behavior, not introducing a new gap.
 */

/** Half a cent — tolerance for floating-point rounding, not a real over-allocation. */
const ALLOCATION_EPSILON = 0.01;

/**
 * Business-logic layer for supplier payments (Payment Register). Posts a
 * balanced journal entry (debit AP, credit Cash/Bank) FIRST, then creates
 * the Payment record with the resulting journalEntryId, then applies each
 * allocation to its Bill via BillService.recordPayment() — mirroring the
 * "post to GL first, then persist the domain record" ordering used by
 * bankTransactionService.ts and billService.ts, so a failed post never
 * leaves an orphaned "paid" row.
 */
export class PaymentService {
  constructor(
    private readonly repository: IPaymentRepository,
    private readonly journalEntryService: JournalPoster,
    private readonly billService: BillPaymentRecorder,
    private readonly accounts: AccountMapper,
  ) {}

  async getPayments(): Promise<Payment[]> {
    return this.repository.getAll();
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    return this.repository.getById(id);
  }

  async getPaymentsBySupplier(supplierId: string): Promise<Payment[]> {
    const all = await this.repository.getAll();
    return all.filter((p) => p.supplierId === supplierId);
  }

  /**
   * Records a new supplier payment. Validates amount and allocations
   * BEFORE posting to the ledger — an invalid payment never reaches
   * postJournalEntry(). At least a partial allocation is not required:
   * a payment may be left fully or partially unallocated (on-account),
   * in which case unallocatedAmount reflects that.
   */
  async createPayment(data: CreatePaymentDTO): Promise<Payment> {
    if (data.amount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    let allocatedTotal = 0;
    data.allocations.forEach((allocation, index) => {
      if (!allocation.billId) {
        throw new Error(`Allocation ${index + 1} is missing a bill.`);
      }
      if (allocation.amount <= 0) {
        throw new Error(`Allocation ${index + 1}: amount must be greater than zero.`);
      }
      allocatedTotal += allocation.amount;
    });

    if (allocatedTotal - data.amount > ALLOCATION_EPSILON) {
      throw new Error(
        `Allocations total ${allocatedTotal.toFixed(2)} exceed the payment amount ${data.amount.toFixed(2)}.`,
      );
    }

    const unallocatedAmount = Math.max(0, data.amount - allocatedTotal);

    const lines: NewJournalLineInput[] = [
      {
        accountId: await this.accounts.getAccountId('AP'),
        description: `Payment ${data.paymentNumber}`,
        debit: data.amount,
        credit: 0,
      },
      {
        accountId: await this.accounts.getAccountId('CASH_AND_BANK'),
        description: `Payment ${data.paymentNumber}`,
        debit: 0,
        credit: data.amount,
      },
    ];

    const entry = await this.journalEntryService.postJournalEntry({
      date: data.date,
      memo: `Payment ${data.paymentNumber} to supplier ${data.supplierId}`,
      source: 'payment',
      lines,
    });

    const now = new Date().toISOString();
    const payment = await this.repository.create({
      ...data,
      id: '',
      unallocatedAmount,
      journalEntryId: entry.id,
      createdAt: now,
      updatedAt: now,
    });

    for (const allocation of data.allocations) {
      await this.billService.recordPayment(allocation.billId, allocation.amount);
    }

    return payment;
  }

  /**
   * Updates non-financial metadata only (reference/notes). Amount,
   * allocations, and date are immutable once posted — correcting those
   * would desynchronize the already-posted journal entry and the Bills
   * already updated by recordPayment(), so (like a posted JournalEntry)
   * there is no financial edit path, only this narrow metadata edit.
   */
  async updatePayment(id: string, patch: Pick<Payment, 'reference' | 'notes'>): Promise<Payment> {
    return this.repository.update(id, patch);
  }
}
