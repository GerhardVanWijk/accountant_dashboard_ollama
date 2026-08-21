import type { BankAccount, DebitCredit, ID, JournalEntry, TaxRate } from '@/types';
import type { NewJournalLineInput } from '@/features/accounting/services';
import { seedTaxRates } from '@/mock-data/taxRates';
import { VAT_INPUT_ACCOUNT_ID, VAT_OUTPUT_ACCOUNT_ID } from '../constants';
import type { IBankAccountRepository } from '../repositories/IBankAccountRepository';
import type { IBankTransactionRepository } from '../repositories/IBankTransactionRepository';
import type { BankTransactionAllocation, BankTransactionWithAllocations, MatchCandidate, ParsedStatementLine } from '../types';
import { computeAllocationTax, isTaxSeparatelyPosted } from '../utils/taxCalculations';
import { findMatchCandidates } from '../utils/matching';

/**
 * Minimal surface of JournalEntryService that BankTransactionService
 * depends on — an interface, not the concrete class, so this service stays
 * unit-testable with a stub and never needs to reach into
 * src/features/accounting internals beyond its published service API
 * (@/features/accounting/services), per this dispatch's scope boundary.
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

function generateAllocationId(): string {
  return `btxa_${Math.random().toString(36).slice(2, 10)}`;
}

/** Caller-supplied shape for one split-allocation line before tax is computed. */
export interface AllocationInput {
  glAccountId: ID;
  description?: string;
  netAmount: number;
  taxRateId?: ID;
}

export interface CreateDirectTransactionInput {
  bankAccountId: ID;
  date: string;
  description: string;
  reference?: string;
  /** Gross amount, inclusive of VAT. */
  amount: number;
  /** 'debit' = a receipt (money in). 'credit' = a payment (money out). */
  direction: DebitCredit;
  allocations: AllocationInput[];
  /** Defaults to true — set false to record the transaction without attempting a GL post. */
  postToLedger?: boolean;
  postedByUserId?: ID;
}

export interface CreateTransferInput {
  fromBankAccountId: ID;
  toBankAccountId: ID;
  date: string;
  amount: number;
  description?: string;
  reference?: string;
  postedByUserId?: ID;
}

export interface TransferResult {
  outLeg: BankTransactionWithAllocations;
  inLeg: BankTransactionWithAllocations;
  journalEntryId?: ID;
}

/**
 * Bank transaction business logic: Direct Payments/Receipts with split
 * allocation + per-line VAT, inter-account transfers (debit destination /
 * credit source, never a duplicate revenue/expense line), statement
 * import, and smart matching. GL posting is wired end-to-end via the
 * injected JournalPoster (journalEntryService.postJournalEntry) — see
 * docs/LEDGER_ARCHITECTURE.md: this is the "real work" GL-integration path
 * the dispatch brief called out, not the billService.ts-style TODO
 * fallback, because the mechanical mapping (bank line + allocation lines +
 * one aggregated VAT line) is a fixed shape this module can build safely.
 */
export class BankTransactionService {
  constructor(
    private readonly bankTransactionRepository: IBankTransactionRepository,
    private readonly bankAccountRepository: IBankAccountRepository,
    private readonly journalEntryService: JournalPoster,
    private readonly taxRates: TaxRate[] = seedTaxRates,
  ) {}

  async getTransactions(bankAccountId?: ID): Promise<BankTransactionWithAllocations[]> {
    return bankAccountId
      ? this.bankTransactionRepository.getByAccount(bankAccountId)
      : this.bankTransactionRepository.getAll();
  }

  async getTransaction(id: ID): Promise<BankTransactionWithAllocations | undefined> {
    return this.bankTransactionRepository.getById(id);
  }

  private buildAllocations(inputs: AllocationInput[]): BankTransactionAllocation[] {
    return inputs.map((input) => {
      const taxRate = input.taxRateId ? this.taxRates.find((r) => r.id === input.taxRateId) : undefined;
      return {
        id: generateAllocationId(),
        glAccountId: input.glAccountId,
        description: input.description,
        netAmount: input.netAmount,
        taxRateId: input.taxRateId,
        taxAmount: computeAllocationTax(input.netAmount, taxRate),
      };
    });
  }

  /**
   * Sum of (netAmount + taxAmount) across every allocation must equal the
   * transaction's gross amount — enforced here (service layer), not left
   * to a UI-only check.
   */
  private validateAllocations(amount: number, allocations: BankTransactionAllocation[]): void {
    if (allocations.length === 0) {
      throw new Error('At least one allocation line is required.');
    }
    let total = 0;
    allocations.forEach((a, i) => {
      if (!a.glAccountId) throw new Error(`Allocation line ${i + 1} is missing a GL account.`);
      if (a.netAmount <= 0) throw new Error(`Allocation line ${i + 1}: amount must be greater than zero.`);
      total += a.netAmount + a.taxAmount;
    });
    if (Math.abs(total - amount) > 0.01) {
      throw new Error(
        `Allocation lines total ${total.toFixed(2)} but the transaction amount is ${amount.toFixed(2)}.`,
      );
    }
  }

  /**
   * Builds and posts the balanced journal entry for one bank
   * receipt/payment: one line for the bank's own GL account, one line per
   * allocation, and (if any allocation carries deductible/output VAT) one
   * aggregated VAT control-account line. Throws — and posts nothing — if
   * the entry would not balance or the accounting period is closed;
   * callers must not create the BankTransaction record until this
   * succeeds, so a failed post never leaves an orphaned unposted row.
   */
  private async postAllocationsToLedger(
    account: BankAccount,
    params: { date: string; description: string; amount: number; direction: DebitCredit },
    allocations: BankTransactionAllocation[],
    postedByUserId?: ID,
  ): Promise<JournalEntry> {
    const lines: NewJournalLineInput[] = [
      {
        accountId: account.glAccountId,
        description: params.description,
        debit: params.direction === 'debit' ? params.amount : 0,
        credit: params.direction === 'credit' ? params.amount : 0,
      },
    ];

    let vatTotal = 0;
    for (const alloc of allocations) {
      lines.push({
        accountId: alloc.glAccountId,
        description: alloc.description,
        debit: params.direction === 'credit' ? alloc.netAmount : 0,
        credit: params.direction === 'debit' ? alloc.netAmount : 0,
      });
      const taxRate = this.taxRates.find((r) => r.id === alloc.taxRateId);
      if (isTaxSeparatelyPosted(taxRate)) {
        vatTotal += alloc.taxAmount;
      }
    }

    if (vatTotal > 0) {
      const vatAccountId = params.direction === 'debit' ? VAT_OUTPUT_ACCOUNT_ID : VAT_INPUT_ACCOUNT_ID;
      lines.push({
        accountId: vatAccountId,
        description: 'VAT',
        debit: params.direction === 'credit' ? vatTotal : 0,
        credit: params.direction === 'debit' ? vatTotal : 0,
      });
    }

    return this.journalEntryService.postJournalEntry({
      date: params.date,
      memo: params.description,
      source: 'bank_transaction',
      postedByUserId,
      lines,
    });
  }

  /**
   * Records a Direct Payment or Direct Receipt with split allocation
   * across GL accounts and per-line VAT, posting a balanced journal entry
   * by default.
   */
  async createDirectTransaction(input: CreateDirectTransactionInput): Promise<BankTransactionWithAllocations> {
    if (input.amount <= 0) throw new Error('Transaction amount must be greater than zero.');

    const account = await this.bankAccountRepository.getById(input.bankAccountId);
    if (!account) throw new Error(`Bank account "${input.bankAccountId}" not found.`);

    const allocations = this.buildAllocations(input.allocations);
    this.validateAllocations(input.amount, allocations);

    let journalEntryId: ID | undefined;
    if (input.postToLedger !== false) {
      const entry = await this.postAllocationsToLedger(
        account,
        { date: input.date, description: input.description, amount: input.amount, direction: input.direction },
        allocations,
        input.postedByUserId,
      );
      journalEntryId = entry.id;
    }

    return this.bankTransactionRepository.create({
      id: '',
      bankAccountId: input.bankAccountId,
      date: input.date,
      description: input.description,
      reference: input.reference,
      amount: input.amount,
      direction: input.direction,
      status: 'matched',
      source: 'manual',
      allocations,
      journalEntryId,
      createdAt: '',
      updatedAt: '',
    });
  }

  /**
   * Allocates (or re-allocates) an existing unallocated transaction — e.g.
   * an imported statement line with no GL split yet — and posts it to the
   * ledger. Refuses once the transaction has already been reconciled.
   */
  async allocateTransaction(
    id: ID,
    allocationInputs: AllocationInput[],
    options?: { postToLedger?: boolean; postedByUserId?: ID },
  ): Promise<BankTransactionWithAllocations> {
    const txn = await this.bankTransactionRepository.getById(id);
    if (!txn) throw new Error(`Bank transaction "${id}" not found.`);
    if (txn.status === 'reconciled') {
      throw new Error('Cannot re-allocate a transaction that has already been reconciled.');
    }

    const allocations = this.buildAllocations(allocationInputs);
    this.validateAllocations(txn.amount, allocations);

    let journalEntryId = txn.journalEntryId;
    if (options?.postToLedger !== false) {
      const account = await this.bankAccountRepository.getById(txn.bankAccountId);
      if (!account) throw new Error(`Bank account "${txn.bankAccountId}" not found.`);
      const entry = await this.postAllocationsToLedger(
        account,
        { date: txn.date, description: txn.description, amount: txn.amount, direction: txn.direction },
        allocations,
        options?.postedByUserId,
      );
      journalEntryId = entry.id;
    }

    return this.bankTransactionRepository.update(id, {
      allocations,
      journalEntryId,
      status: 'matched',
    });
  }

  /**
   * Records an inter-account transfer as two linked BankTransaction legs
   * (debit destination / credit source) and — when the two accounts post
   * to different GL control accounts — a single balanced journal entry
   * moving funds between them. No revenue/expense line is ever created for
   * a transfer, per this dispatch's brief.
   */
  async createTransfer(input: CreateTransferInput): Promise<TransferResult> {
    if (input.fromBankAccountId === input.toBankAccountId) {
      throw new Error('Transfer source and destination accounts must be different.');
    }
    if (input.amount <= 0) throw new Error('Transfer amount must be greater than zero.');

    const fromAccount = await this.bankAccountRepository.getById(input.fromBankAccountId);
    const toAccount = await this.bankAccountRepository.getById(input.toBankAccountId);
    if (!fromAccount) throw new Error(`Bank account "${input.fromBankAccountId}" not found.`);
    if (!toAccount) throw new Error(`Bank account "${input.toBankAccountId}" not found.`);

    const description = input.description ?? `Transfer: ${fromAccount.name} -> ${toAccount.name}`;

    let journalEntryId: ID | undefined;
    // Only post at the GL level if the two bank accounts actually map to
    // different GL accounts — otherwise a debit and credit to the SAME
    // account would net to nothing meaningful to post.
    if (fromAccount.glAccountId !== toAccount.glAccountId) {
      const entry = await this.journalEntryService.postJournalEntry({
        date: input.date,
        memo: description,
        source: 'bank_transfer',
        postedByUserId: input.postedByUserId,
        lines: [
          {
            accountId: toAccount.glAccountId,
            description: `Transfer in from ${fromAccount.name}`,
            debit: input.amount,
            credit: 0,
          },
          {
            accountId: fromAccount.glAccountId,
            description: `Transfer out to ${toAccount.name}`,
            debit: 0,
            credit: input.amount,
          },
        ],
      });
      journalEntryId = entry.id;
    }

    const reference = input.reference ?? `XFER-${Date.now()}`;

    const outLeg = await this.bankTransactionRepository.create({
      id: '',
      bankAccountId: fromAccount.id,
      date: input.date,
      description: `Transfer to ${toAccount.name}`,
      reference,
      amount: input.amount,
      direction: 'credit',
      status: 'unreconciled',
      source: 'transfer',
      allocations: [],
      journalEntryId,
      createdAt: '',
      updatedAt: '',
    });
    const inLeg = await this.bankTransactionRepository.create({
      id: '',
      bankAccountId: toAccount.id,
      date: input.date,
      description: `Transfer from ${fromAccount.name}`,
      reference,
      amount: input.amount,
      direction: 'debit',
      status: 'unreconciled',
      source: 'transfer',
      allocations: [],
      journalEntryId,
      createdAt: '',
      updatedAt: '',
    });

    const linkedOut = await this.bankTransactionRepository.update(outLeg.id, { transferPairId: inLeg.id });
    const linkedIn = await this.bankTransactionRepository.update(inLeg.id, { transferPairId: outLeg.id });

    return { outLeg: linkedOut, inLeg: linkedIn, journalEntryId };
  }

  /** Refuses to delete a transaction already cleared by a finalized reconciliation. Deletes both legs of a transfer together. */
  async deleteTransaction(id: ID): Promise<void> {
    const txn = await this.bankTransactionRepository.getById(id);
    if (!txn) throw new Error(`Bank transaction "${id}" not found.`);
    if (txn.status === 'reconciled') {
      throw new Error('Cannot delete a transaction that has already been reconciled.');
    }
    if (txn.transferPairId) {
      const pair = await this.bankTransactionRepository.getById(txn.transferPairId);
      if (pair && pair.status !== 'reconciled') {
        await this.bankTransactionRepository.delete(txn.transferPairId);
      }
    }
    await this.bankTransactionRepository.delete(id);
  }

  /**
   * Imports parsed statement lines as new unreconciled transactions with no
   * allocation yet (they need a GL split before they can post/clear).
   * Lines whose reference already exists for this account are skipped —
   * cheap de-duplication for a re-imported/overlapping statement file.
   */
  async importStatementLines(
    bankAccountId: ID,
    lines: ParsedStatementLine[],
  ): Promise<BankTransactionWithAllocations[]> {
    const account = await this.bankAccountRepository.getById(bankAccountId);
    if (!account) throw new Error(`Bank account "${bankAccountId}" not found.`);

    const existing = await this.bankTransactionRepository.getByAccount(bankAccountId);
    const existingRefs = new Set(existing.map((t) => t.reference).filter((r): r is string => Boolean(r)));

    const created: BankTransactionWithAllocations[] = [];
    for (const line of lines) {
      if (line.reference && existingRefs.has(line.reference)) continue;
      const record = await this.bankTransactionRepository.create({
        id: '',
        bankAccountId,
        date: line.date,
        description: line.description,
        reference: line.reference,
        amount: line.amount,
        direction: line.direction,
        status: 'unreconciled',
        source: 'import',
        allocations: [],
        createdAt: '',
        updatedAt: '',
      });
      created.push(record);
    }
    return created;
  }

  /** Smart-matching suggestions for one imported statement line against already-recorded transactions on the same account. */
  async findMatchesForLine(bankAccountId: ID, line: ParsedStatementLine): Promise<MatchCandidate[]> {
    const existing = await this.bankTransactionRepository.getByAccount(bankAccountId);
    return findMatchCandidates(
      line,
      existing.filter((t) => t.source !== 'import'),
    );
  }
}
