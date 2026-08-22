import type { Account, ID, JournalEntry } from '@/types';
import { calculateIncomeStatement, type StatementAccountLine } from './calculateIncomeStatement';

/** Fixed GL account ids (src/mock-data/accounts.ts) — see that file's Phase 9 note. */
export const OWNERS_EQUITY_ACCOUNT_ID = 'acc_3000';
export const RETAINED_EARNINGS_ACCOUNT_ID = 'acc_3900';

/** Half a cent — same float tolerance journalEntryService.computeTrialBalance() uses. */
const BALANCE_EPSILON = 0.005;

export interface BalanceSheet {
  asOfDate: string;
  financialYearStartDate: string;
  /** Every current_asset/non_current_asset account with a nonzero balance, gross of contra-assets. */
  assetLines: StatementAccountLine[];
  /** Contra-asset accounts (e.g. Accumulated Depreciation) — subtracted from gross assets, not added. */
  contraAssetLines: StatementAccountLine[];
  totalAssets: number;
  liabilityLines: StatementAccountLine[];
  totalLiabilities: number;
  ownersEquity: number;
  retainedEarnings: number;
  /**
   * Net Profit After Tax for the period from the start of the relevant
   * FinancialYear up to asOfDate — see this module's doc comment for why
   * this line exists at all.
   */
  currentYearEarnings: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  /** True when totalAssets === totalLiabilities + totalEquity (within BALANCE_EPSILON). Should always hold by construction. */
  isBalanced: boolean;
  /** totalAssets - totalLiabilitiesAndEquity. Non-zero here is a real bug, not a rounding quirk to hide. */
  difference: number;
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * A single account's balance as of a date, using only posted entries dated
 * on/before it, expressed in the account's own normal-balance direction —
 * same convention as journalEntryService.getAccountLedger()'s running
 * balance, just evaluated once at a cutoff instead of row-by-row.
 */
function accountBalanceAsOf(
  accountId: ID,
  entries: JournalEntry[],
  asOfDate: string,
  normalBalance: 'debit' | 'credit',
): number {
  const asOf = dateOnly(asOfDate);
  let debit = 0;
  let credit = 0;

  for (const entry of entries) {
    if (entry.status !== 'posted') continue;
    if (dateOnly(entry.date) > asOf) continue;

    for (const line of entry.lines) {
      if (line.accountId !== accountId) continue;
      debit += line.debit;
      credit += line.credit;
    }
  }

  return normalBalance === 'debit' ? debit - credit : credit - debit;
}

function sumLines(lines: StatementAccountLine[]): number {
  return lines.reduce((total, line) => total + line.amount, 0);
}

function sortByCode(a: StatementAccountLine, b: StatementAccountLine): number {
  return a.code.localeCompare(b.code);
}

/**
 * Statement of Financial Position (Balance Sheet) as of a date —
 * SA_ACCOUNTING_MASTER_SPEC.md §42.
 *
 * - Assets = every `current_asset` + `non_current_asset` type='asset'
 *   account's balance as of asOfDate, MINUS `contra_asset` accounts (e.g.
 *   Accumulated Depreciation nets against Fixed Assets).
 * - Liabilities = every type='liability' account's balance as of asOfDate
 *   (covers `current_liability` and any `non_current_liability` that may
 *   exist in future — no seeded liability is non-current today, but this
 *   doesn't hardcode that assumption).
 * - Equity = Owner's Equity (acc_3000) + Retained Earnings (acc_3900)
 *   balances as of asOfDate, PLUS a "Current Year Earnings" line.
 *
 * This app has no year-end closing journal that sweeps net income into
 * Retained Earnings (see financialYearService's doc comment), so a real
 * Balance Sheet must show the current year's profit/loss as a separate
 * equity line rather than assuming it's already folded into acc_3900 —
 * standard practice, not a hack. It falls directly out of the double-entry
 * trial-balance identity: every revenue/expense account nets to zero in
 * equity's own ledger, so their net effect has to appear *somewhere* in
 * equity for Assets = Liabilities + Equity to hold, and this is that
 * somewhere. Reuses calculateIncomeStatement() (financialYearStartDate ->
 * asOfDate) rather than reimplementing the P&L math a second way.
 *
 * `isBalanced`/`difference` are computed, never assumed — if a real posted
 * dataset ever fails this identity, that is a genuine bug in the math (or
 * in data that bypassed postJournalEntry()'s validation), not something to
 * paper over.
 */
export function calculateBalanceSheet(
  entries: JournalEntry[],
  accounts: Account[],
  asOfDate: string,
  financialYearStartDate: string,
): BalanceSheet {
  const assetLines: StatementAccountLine[] = [];
  const contraAssetLines: StatementAccountLine[] = [];
  const liabilityLines: StatementAccountLine[] = [];

  for (const account of accounts) {
    if (account.type === 'asset') {
      const balance = accountBalanceAsOf(account.id, entries, asOfDate, account.normalBalance);
      if (balance === 0) continue;
      const line: StatementAccountLine = { accountId: account.id, code: account.code, name: account.name, amount: balance };
      if (account.subType === 'contra_asset') {
        contraAssetLines.push(line);
      } else {
        assetLines.push(line);
      }
    } else if (account.type === 'liability') {
      const balance = accountBalanceAsOf(account.id, entries, asOfDate, account.normalBalance);
      if (balance === 0) continue;
      liabilityLines.push({ accountId: account.id, code: account.code, name: account.name, amount: balance });
    }
  }

  assetLines.sort(sortByCode);
  contraAssetLines.sort(sortByCode);
  liabilityLines.sort(sortByCode);

  const grossAssets = sumLines(assetLines);
  const contraAssetTotal = sumLines(contraAssetLines);
  const totalAssets = grossAssets - contraAssetTotal;
  const totalLiabilities = sumLines(liabilityLines);

  const ownersEquityAccount = accounts.find((a) => a.id === OWNERS_EQUITY_ACCOUNT_ID);
  const retainedEarningsAccount = accounts.find((a) => a.id === RETAINED_EARNINGS_ACCOUNT_ID);

  const ownersEquity = ownersEquityAccount
    ? accountBalanceAsOf(OWNERS_EQUITY_ACCOUNT_ID, entries, asOfDate, ownersEquityAccount.normalBalance)
    : 0;
  const retainedEarnings = retainedEarningsAccount
    ? accountBalanceAsOf(RETAINED_EARNINGS_ACCOUNT_ID, entries, asOfDate, retainedEarningsAccount.normalBalance)
    : 0;

  const currentYearEarnings = calculateIncomeStatement(entries, accounts, financialYearStartDate, asOfDate).netProfitAfterTax;

  const totalEquity = ownersEquity + retainedEarnings + currentYearEarnings;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const difference = totalAssets - totalLiabilitiesAndEquity;

  return {
    asOfDate,
    financialYearStartDate,
    assetLines,
    contraAssetLines,
    totalAssets,
    liabilityLines,
    totalLiabilities,
    ownersEquity,
    retainedEarnings,
    currentYearEarnings,
    totalEquity,
    totalLiabilitiesAndEquity,
    isBalanced: Math.abs(difference) <= BALANCE_EPSILON,
    difference,
  };
}
