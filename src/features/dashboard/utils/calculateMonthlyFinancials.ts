import type { Account, JournalEntry } from '@/types';

/** Fixed GL account id (src/mock-data/accounts.ts) — the single Cash and Bank control account every posting module credits/debits. */
const CASH_AND_BANK_ACCOUNT_ID = 'acc_1000';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface MonthlyFinancials {
  /** ISO month key, e.g. "2026-08". */
  month: string;
  /** Short chart-axis label, e.g. "Aug". */
  label: string;
  revenue: number;
  expenses: number;
  /** Cash received this month (debit movement on the Cash and Bank control account). */
  cashIn: number;
  /** Cash paid out this month (credit movement on the Cash and Bank control account). */
  cashOut: number;
}

function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function labelFor(monthKey: string): string {
  const month = Number(monthKey.slice(5, 7));
  return MONTH_LABELS[month - 1] ?? monthKey;
}

/** The `count` month keys ending at `asOf` (inclusive), oldest first — e.g. trailingMonthKeys(new Date('2026-08-15'), 3) -> ['2026-06','2026-07','2026-08']. */
export function trailingMonthKeys(asOf: Date, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

/**
 * Real monthly Revenue/Expenses/Cash In/Cash Out, computed from posted
 * JournalEntry lines — replaces the dashboard's former mock time series
 * (docs/KNOWN_ISSUES.md: "Dashboard financials are fully mocked"). Per
 * docs/DO_NOT_BREAK.md this math happens here, never inline in JSX or a
 * hook — `calculateDashboardKpis()`/`calculateCashFlowSeries()` consume
 * this function's output unchanged, their own shape never depended on the
 * mock source, only on this `MonthlyFinancials[]` shape.
 *
 * - Revenue/Expenses sum each month's NET movement on revenue-/expense-type
 *   accounts (via the Chart of Accounts, not a hardcoded id list) — a
 *   credit note, which debits Sales Revenue, correctly reduces that
 *   month's revenue rather than needing special-casing.
 * - Cash In/Out sum debit/credit movement on the single Cash and Bank
 *   control account (`acc_1000`) — this captures every real cash movement
 *   already posted to the GL (invoice receipts, bill payments, opening
 *   balances) from one source of truth, rather than separately pulling in
 *   Banking's BankTransaction records and risking the two disagreeing.
 *
 * A reversal entry is itself `status: 'posted'` (docs/LEDGER_ARCHITECTURE.md
 * — the original is never mutated, a reversal is a new offsetting entry),
 * so including every `status === 'posted'` entry here nets a reversed
 * transaction back out to zero automatically, the same way it already does
 * for the Trial Balance.
 */
export function calculateMonthlyFinancials(
  entries: JournalEntry[],
  accounts: Account[],
  monthKeys: string[],
): MonthlyFinancials[] {
  const accountType = new Map(accounts.map((a) => [a.id, a.type]));
  const totals = new Map<string, { revenue: number; expenses: number; cashIn: number; cashOut: number }>();
  for (const key of monthKeys) {
    totals.set(key, { revenue: 0, expenses: 0, cashIn: 0, cashOut: 0 });
  }

  for (const entry of entries) {
    if (entry.status !== 'posted') continue;
    const bucket = totals.get(monthKeyOf(entry.date));
    if (!bucket) continue; // outside the requested window

    for (const line of entry.lines) {
      const type = accountType.get(line.accountId);
      if (type === 'revenue') {
        bucket.revenue += line.credit - line.debit;
      } else if (type === 'expense') {
        bucket.expenses += line.debit - line.credit;
      }
      if (line.accountId === CASH_AND_BANK_ACCOUNT_ID) {
        bucket.cashIn += line.debit;
        bucket.cashOut += line.credit;
      }
    }
  }

  return monthKeys.map((key) => ({
    month: key,
    label: labelFor(key),
    ...totals.get(key)!,
  }));
}
