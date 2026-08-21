import type { CreditNote, ID } from '@/types';
import type { ICreditNoteRepository } from '@/repositories/ICreditNoteRepository';
import type { NewJournalLineInput } from '@/features/accounting/services';

export type CreateCreditNoteDTO = Omit<CreditNote, 'id' | 'createdAt' | 'updatedAt'>;

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
 * Minimal surface of InvoiceService this service depends on — allocating a
 * credit note against an invoice reduces what's owed the same way a
 * receipt does, from the invoice's point of view, so it reuses
 * InvoiceService.recordPayment() rather than reimplementing the
 * paid/partially_paid status logic.
 */
export interface InvoicePaymentRecorder {
  recordPayment(invoiceId: string, amount: number): Promise<unknown>;
}

/** Fixed Chart of Accounts ids this service posts against (src/mock-data/accounts.ts). */
const SALES_REVENUE_ACCOUNT_ID = 'acc_4000'; // Sales Revenue (reused as a contra — see class doc)
const VAT_OUTPUT_ACCOUNT_ID = 'acc_2100'; // VAT Output (Payable)
const AR_ACCOUNT_ID = 'acc_1100'; // Accounts Receivable

const BALANCE_EPSILON = 0.01;

/**
 * Business-logic layer for Credit Notes (Accounts Receivable contra
 * documents). Issuing one posts the reverse of an Invoice posting; see
 * docs/LEDGER_ARCHITECTURE.md. There is no separate "Sales Returns"
 * contra-account in the seed chart of accounts (src/mock-data/accounts.ts)
 * — reusing acc_4000 (Sales Revenue) for the debit leg is a deliberate,
 * flagged simplification for this wave.
 */
export class CreditNoteService {
  constructor(
    private readonly repository: ICreditNoteRepository,
    private readonly journalEntryService: JournalPoster,
    private readonly invoiceService: InvoicePaymentRecorder,
  ) {}

  async getCreditNotes(): Promise<CreditNote[]> {
    return this.repository.getAll();
  }

  async getCreditNote(id: string): Promise<CreditNote | undefined> {
    return this.repository.getById(id);
  }

  async createCreditNote(data: CreateCreditNoteDTO): Promise<CreditNote> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateCreditNote(id: string, patch: Partial<CreditNote>): Promise<CreditNote> {
    return this.repository.update(id, patch);
  }

  /**
   * Permanently removes a draft credit note. An issued/allocated credit
   * note has already posted to the GL — per SA_ACCOUNTING_MASTER_SPEC.md
   * §14/§36/§72/§79 it must never be deleted.
   */
  async deleteCreditNote(id: string): Promise<void> {
    const creditNote = await this.requireCreditNote(id);
    if (creditNote.status !== 'draft') {
      throw new Error(
        `Cannot delete credit note "${id}": only a draft credit note can be deleted (current status: ${creditNote.status}).`,
      );
    }
    return this.repository.delete(id);
  }

  /**
   * Posts a credit note to the ledger and transitions it from 'draft' to
   * 'issued'. Posts BEFORE updating the domain record — see
   * docs/LEDGER_ARCHITECTURE.md and bankTransactionService.ts's
   * postAllocationsToLedger — so a failed post never leaves an orphaned
   * "issued" credit note row.
   *
   * debit  Sales Revenue        (acc_4000) for creditNote.subtotal
   * debit  VAT Output           (acc_2100) for creditNote.taxTotal (only if > 0)
   * credit Accounts Receivable  (acc_1100) for creditNote.total
   */
  async issueCreditNote(id: string, postedByUserId?: ID): Promise<CreditNote> {
    const creditNote = await this.requireCreditNote(id);
    if (creditNote.status !== 'draft') {
      throw new Error(
        `Cannot issue credit note "${id}": only a draft credit note can be issued (current status: ${creditNote.status}).`,
      );
    }

    const lines: NewJournalLineInput[] = [
      {
        accountId: SALES_REVENUE_ACCOUNT_ID,
        description: `Credit Note ${creditNote.creditNoteNumber}`,
        debit: creditNote.subtotal,
        credit: 0,
      },
    ];
    if (creditNote.taxTotal > 0) {
      lines.push({
        accountId: VAT_OUTPUT_ACCOUNT_ID,
        description: 'VAT Output reversal',
        debit: creditNote.taxTotal,
        credit: 0,
      });
    }
    lines.push({
      accountId: AR_ACCOUNT_ID,
      description: `Credit Note ${creditNote.creditNoteNumber}`,
      debit: 0,
      credit: creditNote.total,
    });

    const entry = await this.journalEntryService.postJournalEntry({
      date: creditNote.issueDate,
      memo: `Credit Note ${creditNote.creditNoteNumber}`,
      source: 'credit_note',
      postedByUserId,
      lines,
    });

    return this.repository.update(id, { status: 'issued', journalEntryId: entry.id });
  }

  /**
   * Allocates part (or all) of an already-issued credit note's value
   * against a specific invoice. Reuses InvoiceService.recordPayment() —
   * see class doc — then records the allocation on the credit note itself
   * and moves it to 'allocated' once its full value has been applied.
   */
  async allocateToInvoice(id: string, invoiceId: string, amount: number): Promise<CreditNote> {
    const creditNote = await this.requireCreditNote(id);
    if (creditNote.status !== 'issued' && creditNote.status !== 'allocated') {
      throw new Error(
        `Cannot allocate credit note "${id}": it must be issued first (current status: ${creditNote.status}).`,
      );
    }
    if (amount <= 0) {
      throw new Error('Allocation amount must be greater than zero.');
    }
    const remaining = creditNote.total - creditNote.amountAllocated;
    if (amount - remaining > BALANCE_EPSILON) {
      throw new Error(
        `Cannot allocate ${amount.toFixed(2)}: only ${remaining.toFixed(2)} remains unallocated on credit note "${id}".`,
      );
    }

    await this.invoiceService.recordPayment(invoiceId, amount);

    const newAmountAllocated = Math.min(creditNote.amountAllocated + amount, creditNote.total);
    const status: CreditNote['status'] = newAmountAllocated >= creditNote.total - BALANCE_EPSILON ? 'allocated' : 'issued';

    return this.repository.update(id, {
      amountAllocated: newAmountAllocated,
      status,
      allocations: [
        ...creditNote.allocations,
        { invoiceId, amount, allocatedAt: new Date().toISOString() },
      ],
    });
  }

  /** Voids a draft credit note (soft delete — marks as void instead of removing). Issued credit notes are already posted and cannot be voided from here — see docs/LEDGER_ARCHITECTURE.md's reversal-only correction path. */
  async voidCreditNote(id: string): Promise<CreditNote> {
    const creditNote = await this.requireCreditNote(id);
    if (creditNote.status !== 'draft') {
      throw new Error(`Cannot void credit note "${id}": only a draft credit note can be voided directly (current status: ${creditNote.status}).`);
    }
    return this.repository.update(id, { status: 'void' });
  }

  /** Get credit notes for a specific customer. */
  async getCreditNotesByCustomer(customerId: string): Promise<CreditNote[]> {
    const all = await this.repository.getAll();
    return all.filter((cn) => cn.customerId === customerId);
  }

  /** Search credit notes by credit note number or customer ID. */
  async searchCreditNotes(query: string): Promise<CreditNote[]> {
    const all = await this.repository.getAll();
    const lowerQuery = query.toLowerCase();
    return all.filter(
      (cn) =>
        cn.creditNoteNumber.toLowerCase().includes(lowerQuery) || cn.customerId.toLowerCase().includes(lowerQuery),
    );
  }

  private async requireCreditNote(id: string): Promise<CreditNote> {
    const creditNote = await this.repository.getById(id);
    if (!creditNote) {
      throw new Error(`Credit note "${id}" not found`);
    }
    return creditNote;
  }
}
