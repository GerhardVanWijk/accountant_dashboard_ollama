import type { CurrencyCode, ID, JournalEntry, JournalLine } from '@/types';
import type { IJournalEntryRepository } from '../repositories/IJournalEntryRepository';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { IAccountingPeriodRepository } from '../repositories/IAccountingPeriodRepository';
import type { AuditLogService } from '@/services/auditLogService';
import { findPeriodForDate } from '../utils/periodLookup';

/**
 * Used to attribute a posting when no real authenticated user is available.
 * This codebase has no real login session yet (src/stores/authStore.ts is a
 * boolean stub) — see docs/SA_SPEC_GAP_ANALYSIS.md. Real per-user
 * attribution (docs/SA_ACCOUNTING_MASTER_SPEC.md §4: "user who created it",
 * "user who posted it") requires the Admin/Auth module's real login system,
 * which doesn't exist yet. Callers that DO have a real user id should
 * always pass it via NewJournalEntryInput.postedByUserId.
 */
export const SYSTEM_USER_ID = 'system';

/** Input for a new journal line before an id is assigned by postJournalEntry(). */
export type NewJournalLineInput = Omit<JournalLine, 'id'> & { id?: ID };

export interface NewJournalEntryInput {
  date: string;
  memo?: string;
  /** Originating source, e.g. "manual", "invoice", "bill", "payment". */
  source: string;
  lines: NewJournalLineInput[];
  /** Falls back to SYSTEM_USER_ID — see its doc comment. */
  postedByUserId?: ID;
  /** Falls back to the service's configured defaultCurrency — see JournalEntry.currency's doc comment. */
  currency?: CurrencyCode;
}

export interface JournalValidationResult {
  valid: boolean;
  errors: string[];
}

export interface TrialBalanceRow {
  accountId: ID;
  code: string;
  name: string;
  debit: number;
  credit: number;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebits: number;
  totalCredits: number;
  balanced: boolean;
}

export interface LedgerRow {
  entryId: ID;
  entryNumber: string;
  date: string;
  memo?: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

/** Half a cent — tolerance for floating-point rounding, not a real imbalance. */
const BALANCE_EPSILON = 0.005;

/**
 * A single JournalLine's debit/credit pair collapsed to one signed number —
 * the "debits and credits as vectors" model (magnitude + direction) rather
 * than two columns to juggle: positive = net debit direction, negative =
 * net credit direction. Every transaction's lines sum to zero by
 * construction once validateLines() has accepted them. To turn this into a
 * user-facing "account went up/down" figure, multiply by the account's
 * normal-balance direction (+1 for a debit-normal account, -1 for a
 * credit-normal one) — see getAccountLedger()/computeTrialBalance() below,
 * and docs/LEDGER_ARCHITECTURE.md § Debits and credits as vectors.
 */
function debitVector(line: Pick<JournalLine, 'debit' | 'credit'>): number {
  return line.debit - line.credit;
}

/**
 * The double-entry posting engine. This is the ONLY place in the codebase
 * allowed to decide whether a set of ledger lines is balanced — Sales,
 * Purchases, and Banking services call postJournalEntry() when they wire
 * up GL integration rather than re-implementing the debit=credit check
 * themselves. See docs/LEDGER_ARCHITECTURE.md.
 */
export class JournalEntryService {
  constructor(
    private readonly journalRepository: IJournalEntryRepository,
    private readonly accountRepository: IAccountRepository,
    private readonly periodRepository: IAccountingPeriodRepository,
    private readonly auditLog: AuditLogService,
    /**
     * The currency a new entry is posted in when the caller doesn't
     * specify one — 'ZAR' since every Company/TaxRate in this codebase is
     * modeled for South Africa (see JournalEntry.currency's doc comment).
     * Optional constructor param, backward-compatible with every existing
     * `new JournalEntryService(...)` call site/test.
     */
    private readonly defaultCurrency: CurrencyCode = 'ZAR',
  ) {}

  async getEntries(): Promise<JournalEntry[]> {
    return this.journalRepository.getAll();
  }

  async getEntry(id: ID): Promise<JournalEntry | undefined> {
    return this.journalRepository.getById(id);
  }

  /**
   * Validates the double-entry invariant without touching the repository —
   * safe to call from a form to show "this won't post" before the user
   * commits: at least two lines, every line has exactly one non-zero side,
   * every accountId is real, and sum(debit) === sum(credit).
   */
  async validateLines(lines: NewJournalLineInput[]): Promise<JournalValidationResult> {
    const errors: string[] = [];

    if (lines.length < 2) {
      errors.push('A journal entry needs at least two lines.');
    }

    const accounts = await this.accountRepository.getAll();
    const accountIds = new Set(accounts.map((a) => a.id));

    let totalDebit = 0;
    let totalCredit = 0;

    lines.forEach((line, index) => {
      const debit = line.debit ?? 0;
      const credit = line.credit ?? 0;

      if (!accountIds.has(line.accountId)) {
        errors.push(`Line ${index + 1}: account "${line.accountId}" does not exist.`);
      }
      if (debit < 0 || credit < 0) {
        errors.push(`Line ${index + 1}: debit/credit amounts cannot be negative.`);
      }
      if (debit > 0 && credit > 0) {
        errors.push(`Line ${index + 1}: a single line cannot carry both a debit and a credit.`);
      }
      if (debit === 0 && credit === 0) {
        errors.push(`Line ${index + 1}: a line must have either a debit or a credit amount.`);
      }

      totalDebit += debit;
      totalCredit += credit;
    });

    if (Math.abs(totalDebit - totalCredit) > BALANCE_EPSILON) {
      errors.push(
        `Entry is not balanced: total debits ${totalDebit.toFixed(2)} !== total credits ${totalCredit.toFixed(2)}.`,
      );
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Posts a new, immutable journal entry. Throws if the lines don't
   * satisfy the double-entry invariant, OR if the entry's date falls
   * outside an 'open' accounting period (docs/SA_ACCOUNTING_MASTER_SPEC.md
   * §35/§72 — normal users must not post into a closed period; there's no
   * period-status exception here because this app has no real
   * roles/approvals to distinguish "normal user" from "authorized
   * override" yet, see docs/SA_SPEC_GAP_ANALYSIS.md). There is no "post as
   * draft and fix later" path — the repository has no update(), so callers
   * that want a review step should call validateLines() first and only
   * call postJournalEntry() once the user confirms. Writes a 'posted'
   * audit log entry on success.
   */
  async postJournalEntry(input: NewJournalEntryInput): Promise<JournalEntry> {
    const validation = await this.validateLines(input.lines);
    if (!validation.valid) {
      throw new Error(`Cannot post unbalanced journal entry: ${validation.errors.join(' ')}`);
    }

    const periods = await this.periodRepository.getAll();
    const period = findPeriodForDate(periods, input.date);
    if (!period) {
      throw new Error(`Cannot post: no accounting period is defined for ${input.date}.`);
    }
    if (period.status !== 'open') {
      throw new Error(
        `Cannot post: accounting period "${period.name}" is ${period.status}, not open.`,
      );
    }

    const entryNumber = await this.nextEntryNumber();
    const now = new Date().toISOString();
    const userId = input.postedByUserId ?? SYSTEM_USER_ID;

    const entry = await this.journalRepository.create({
      id: '',
      entryNumber,
      date: input.date,
      memo: input.memo,
      source: input.source,
      status: 'posted',
      postedAt: now,
      currency: input.currency ?? this.defaultCurrency,
      lines: input.lines.map((line, index) => ({
        id: line.id || `${entryNumber}_${index}`,
        accountId: line.accountId,
        description: line.description,
        debit: line.debit ?? 0,
        credit: line.credit ?? 0,
      })),
      createdAt: now,
      updatedAt: now,
    });

    await this.auditLog.log({
      userId,
      action: 'posted',
      module: 'accounting',
      recordType: 'JournalEntry',
      recordId: entry.id,
      newValue: entry,
    });

    return entry;
  }

  /**
   * Reverses a posted entry by posting a NEW entry with every line's
   * debit/credit swapped — the original row is never touched. This is the
   * only supported correction path: ledger history always shows both the
   * mistake and the fix, never just the fix (tamper-evident audit trail).
   * The reversal is dated "now", so it's still subject to the same
   * open-period check as any other post (via the entryNumber/period logic
   * below — a reversal cannot backdate around a closed period any more
   * than a normal post can).
   */
  async reverseJournalEntry(entryId: ID, userId: ID = SYSTEM_USER_ID, memo?: string): Promise<JournalEntry> {
    const original = await this.journalRepository.getById(entryId);
    if (!original) {
      throw new Error(`Cannot reverse: journal entry "${entryId}" not found.`);
    }
    if (original.status !== 'posted') {
      throw new Error(`Cannot reverse entry "${entryId}": only posted entries can be reversed.`);
    }
    if (await this.isReversed(entryId)) {
      throw new Error(`Journal entry "${entryId}" has already been reversed.`);
    }

    const now = new Date().toISOString();
    const periods = await this.periodRepository.getAll();
    const period = findPeriodForDate(periods, now);
    if (!period || period.status !== 'open') {
      throw new Error(
        `Cannot reverse: no open accounting period covers ${now} (found: ${period?.status ?? 'none'}).`,
      );
    }

    const entryNumber = await this.nextEntryNumber();

    const reversal = await this.journalRepository.create({
      id: '',
      entryNumber,
      date: now,
      memo: memo ?? `Reversal of ${original.entryNumber}`,
      source: 'reversal',
      status: 'posted',
      postedAt: now,
      currency: original.currency ?? this.defaultCurrency,
      reversalOfEntryId: original.id,
      lines: original.lines.map((line, index) => ({
        id: `${entryNumber}_${index}`,
        accountId: line.accountId,
        description: line.description,
        debit: line.credit,
        credit: line.debit,
      })),
      createdAt: now,
      updatedAt: now,
    });

    await this.auditLog.log({
      userId,
      action: 'reversed',
      module: 'accounting',
      recordType: 'JournalEntry',
      recordId: original.id,
      previousValue: { status: 'posted' },
      newValue: { reversalEntryId: reversal.id },
    });

    return reversal;
  }

  /** True if some other posted entry reverses this one. */
  async isReversed(entryId: ID): Promise<boolean> {
    const entries = await this.journalRepository.getAll();
    return entries.some((e) => e.reversalOfEntryId === entryId);
  }

  /**
   * Per-account running ledger: every posted line touching accountId,
   * ordered by date, with a running balance computed in the account's
   * normal-balance direction (a debit-normal account's balance increases
   * on debits; a credit-normal account's balance increases on credits).
   */
  async getAccountLedger(accountId: ID): Promise<LedgerRow[]> {
    const account = await this.accountRepository.getById(accountId);
    if (!account) {
      throw new Error(`Account "${accountId}" not found.`);
    }
    const entries = await this.postedEntriesSortedByDate();
    const direction = account.normalBalance === 'debit' ? 1 : -1;

    let runningBalance = 0;
    const rows: LedgerRow[] = [];
    for (const entry of entries) {
      for (const line of entry.lines) {
        if (line.accountId !== accountId) continue;
        runningBalance += direction * debitVector(line);
        rows.push({
          entryId: entry.id,
          entryNumber: entry.entryNumber,
          date: entry.date,
          memo: line.description ?? entry.memo,
          debit: line.debit,
          credit: line.credit,
          runningBalance,
        });
      }
    }
    return rows;
  }

  /**
   * Trial balance: net balance per account across every posted entry,
   * shown on whichever side matches the account's normal balance.
   * `balanced` mirrors the fundamental accounting identity — if this is
   * ever false, something bypassed postJournalEntry()'s validation (or
   * seed data was hand-edited incorrectly); that's a bug to fix, not a
   * state reporting should silently accept.
   */
  async computeTrialBalance(): Promise<TrialBalance> {
    const accounts = await this.accountRepository.getAll();
    const entries = await this.postedEntriesSortedByDate();

    // Positive = net debit, negative = net credit (see debitVector() above).
    const netByAccount = new Map<ID, number>();
    for (const entry of entries) {
      for (const line of entry.lines) {
        const current = netByAccount.get(line.accountId) ?? 0;
        netByAccount.set(line.accountId, current + debitVector(line));
      }
    }

    const rows: TrialBalanceRow[] = [];
    let totalDebits = 0;
    let totalCredits = 0;

    for (const account of accounts) {
      const net = netByAccount.get(account.id) ?? 0;
      if (net === 0) continue;
      const debit = net > 0 ? net : 0;
      const credit = net < 0 ? -net : 0;
      rows.push({ accountId: account.id, code: account.code, name: account.name, debit, credit });
      totalDebits += debit;
      totalCredits += credit;
    }

    return {
      rows,
      totalDebits,
      totalCredits,
      balanced: Math.abs(totalDebits - totalCredits) <= BALANCE_EPSILON,
    };
  }

  private async postedEntriesSortedByDate(): Promise<JournalEntry[]> {
    const entries = await this.journalRepository.getAll();
    return entries.filter((e) => e.status === 'posted').sort((a, b) => a.date.localeCompare(b.date));
  }

  private async nextEntryNumber(): Promise<string> {
    const entries = await this.journalRepository.getAll();
    return `JE-${String(entries.length + 1).padStart(4, '0')}`;
  }
}
