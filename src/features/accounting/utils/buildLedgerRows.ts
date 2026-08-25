import type { Account, ID, JournalEntry } from '@/types';
import type { LedgerRow } from '../services';

/**
 * One posted ledger line, shaped for the v0 General Ledger table. Pure
 * reshaping only (docs/DO_NOT_BREAK.md's accounting-safety rule) — no
 * balance, no direction, no netting is computed here.
 */
export interface LedgerViewRow {
  id: string;
  entryId: ID;
  entryNumber: string;
  date: string;
  accountId: ID;
  accountCode: string;
  accountName: string;
  description?: string;
  /** Originating source (e.g. "manual", "invoice", "bill") — only known in
   * the flat, all-accounts view; undefined when built from a single
   * account's ledger (JournalEntryService.getAccountLedger() doesn't
   * carry it per row). */
  source?: string;
  debit: number;
  credit: number;
  /** Running balance in the account's normal-balance direction — only
   * known when the rows come from a single account's ledger
   * (JournalEntryService.getAccountLedger() already computed it;
   * undefined in the flat, all-accounts view where "a running balance"
   * isn't a single meaningful number across different accounts). */
  balance?: number;
}

/**
 * Flattens every posted journal entry's lines into one row per line,
 * newest first, joined against the chart of accounts for the code/name
 * v0's table wants. Every field is read straight off JournalEntry/
 * JournalLine/Account — no debit/credit netting or balance math happens
 * here, that stays exclusively in JournalEntryService.
 */
export function buildLedgerRows(entries: JournalEntry[], accounts: Account[]): LedgerViewRow[] {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const rows: LedgerViewRow[] = [];

  for (const entry of entries) {
    if (entry.status !== 'posted') continue;
    for (const line of entry.lines) {
      const account = accountById.get(line.accountId);
      rows.push({
        id: `${entry.id}_${line.id}`,
        entryId: entry.id,
        entryNumber: entry.entryNumber,
        date: entry.date,
        accountId: line.accountId,
        accountCode: account?.code ?? '—',
        accountName: account?.name ?? 'Unknown account',
        description: line.description ?? entry.memo,
        source: entry.source,
        debit: line.debit,
        credit: line.credit,
      });
    }
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Reshapes one account's already-computed running ledger (from
 * JournalEntryService.getAccountLedger(), running balance included) into
 * the same LedgerViewRow shape the flat table uses, so the General Ledger
 * page can swap data sources when the user narrows to a single account
 * without a second table component.
 */
export function buildAccountLedgerRows(account: Account, ledgerRows: LedgerRow[]): LedgerViewRow[] {
  return ledgerRows
    .map((row) => ({
      id: `${row.entryId}_${account.id}_${row.date}_${row.debit}_${row.credit}`,
      entryId: row.entryId,
      entryNumber: row.entryNumber,
      date: row.date,
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      description: row.memo,
      debit: row.debit,
      credit: row.credit,
      balance: row.runningBalance,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
