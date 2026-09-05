import type { Account, AccountType, FinancialPlanLine, ID, JournalEntry } from '@/types';

/** "YYYY-MM" — lexical compare == chronological compare, same trick calculateMonthlyFinancials.ts uses. */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export interface MonthDescriptor {
  year: number;
  month: number;
  key: string;
  /** e.g. "Jan 2026". */
  label: string;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The trailing `count` calendar months ending at (and including) the month
 * of `referenceDate`, oldest first. Can span a calendar-year boundary — a
 * rolling window, not a fixed financial year, matching the "6 months / 12
 * months" filter the brief asks for rather than a fixed-year picker.
 */
export function trailingMonths(referenceDate: Date, count: number): MonthDescriptor[] {
  const months: MonthDescriptor[] = [];
  const refYear = referenceDate.getUTCFullYear();
  const refMonth = referenceDate.getUTCMonth() + 1; // 1-12
  for (let i = count - 1; i >= 0; i--) {
    const totalMonths = refYear * 12 + (refMonth - 1) - i;
    const year = Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    months.push({ year, month, key: monthKey(year, month), label: `${MONTH_LABELS[month - 1]} ${year}` });
  }
  return months;
}

/**
 * Every posted journal line, netted per account per calendar month,
 * expressed in the account's own NORMAL direction (positive = "more of
 * what this account normally accumulates") — directly comparable to a
 * `FinancialPlanLine.amount` with no sign flip. This is "Actual": computed
 * live from the SAME ledger every other financial report reads, never a
 * second stored copy (migration 0060's own design note).
 */
export function computeActualByAccountMonth(entries: JournalEntry[], accounts: Account[]): Map<ID, Map<string, number>> {
  const normalBalanceByAccount = new Map(accounts.map((a) => [a.id, a.normalBalance]));
  const result = new Map<ID, Map<string, number>>();

  for (const entry of entries) {
    if (entry.status !== 'posted') continue;
    const d = new Date(entry.date);
    if (Number.isNaN(d.getTime())) continue;
    const key = monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);

    for (const line of entry.lines) {
      const normal = normalBalanceByAccount.get(line.accountId);
      if (!normal) continue; // account not found / inactive — skip rather than guess
      const delta = normal === 'debit' ? line.debit - line.credit : line.credit - line.debit;
      if (delta === 0) continue;
      let byMonth = result.get(line.accountId);
      if (!byMonth) {
        byMonth = new Map();
        result.set(line.accountId, byMonth);
      }
      byMonth.set(key, (byMonth.get(key) ?? 0) + delta);
    }
  }
  return result;
}

function sumPlanLines(lines: FinancialPlanLine[], accountId: ID, months: MonthDescriptor[]): number {
  const keys = new Set(months.map((m) => m.key));
  return lines
    .filter((l) => l.accountId === accountId && keys.has(monthKey(l.periodYear, l.periodMonth)))
    .reduce((sum, l) => sum + l.amount, 0);
}

function sumActual(actualByMonth: Map<string, number> | undefined, months: MonthDescriptor[]): number {
  if (!actualByMonth) return 0;
  return months.reduce((sum, m) => sum + (actualByMonth.get(m.key) ?? 0), 0);
}

/**
 * Favourable/unfavourable is only a meaningful P&L concept for revenue and
 * expense accounts — more revenue than planned is favourable, more expense
 * than planned is unfavourable. For asset/liability/equity accounts there
 * is no universally "good" direction (more debt could be fine or alarming
 * depending on why), so this deliberately returns `null` — the UI shows the
 * variance without a favourable/unfavourable badge for those, rather than
 * inventing a judgement call this app has no basis for making.
 */
export function isVarianceFavourable(accountType: AccountType, variance: number): boolean | null {
  if (variance === 0) return null;
  if (accountType === 'revenue') return variance > 0;
  if (accountType === 'expense') return variance < 0;
  return null;
}

export type VarianceBaseline = 'budget' | 'forecast';

export interface ForecastAccountRow {
  accountId: ID;
  code: string;
  name: string;
  accountType: AccountType;
  budget: number;
  forecast: number;
  actual: number;
  /** actual - baseline (budget or forecast, per `VarianceBaseline`). */
  variance: number;
  /** null when the baseline is exactly zero — a percentage would be meaningless (divide by zero). */
  variancePercent: number | null;
  favourable: boolean | null;
}

/**
 * One row per GL account that has ANY budget, forecast, or actual activity
 * in the selected month range — accounts untouched by all three are
 * omitted, same "only show what moved" convention `calculateIncomeStatement`
 * already uses.
 */
export function computeForecastRows(params: {
  accounts: Account[];
  budgetLines: FinancialPlanLine[];
  forecastLines: FinancialPlanLine[];
  actualByAccountMonth: Map<ID, Map<string, number>>;
  months: MonthDescriptor[];
  varianceBaseline: VarianceBaseline;
}): ForecastAccountRow[] {
  const { accounts, budgetLines, forecastLines, actualByAccountMonth, months, varianceBaseline } = params;
  const rows: ForecastAccountRow[] = [];

  for (const account of accounts) {
    const budget = sumPlanLines(budgetLines, account.id, months);
    const forecast = sumPlanLines(forecastLines, account.id, months);
    const actual = sumActual(actualByAccountMonth.get(account.id), months);
    if (budget === 0 && forecast === 0 && actual === 0) continue;

    const baseline = varianceBaseline === 'budget' ? budget : forecast;
    const variance = actual - baseline;
    const variancePercent = baseline !== 0 ? (variance / Math.abs(baseline)) * 100 : null;

    rows.push({
      accountId: account.id,
      code: account.code,
      name: account.name,
      accountType: account.type,
      budget,
      forecast,
      actual,
      variance,
      variancePercent,
      favourable: isVarianceFavourable(account.type, variance),
    });
  }

  return rows.sort((a, b) => a.code.localeCompare(b.code));
}

export interface ForecastMonthlyPoint {
  key: string;
  label: string;
  budget: number;
  forecast: number;
  actual: number;
}

/**
 * The overall "Net Result" (revenue − expense) trend, Budget vs Forecast vs
 * Actual, one point per month — the general-purpose monthly chart. Revenue
 * and expense are both stored/summed in their own normal (positive)
 * direction, so Net = revenue − expense is the correct P&L combination
 * (mirrors `calculateIncomeStatement`'s own revenue-minus-expense shape).
 */
export function computeNetResultMonthlySeries(params: {
  accounts: Account[];
  budgetLines: FinancialPlanLine[];
  forecastLines: FinancialPlanLine[];
  actualByAccountMonth: Map<ID, Map<string, number>>;
  months: MonthDescriptor[];
}): ForecastMonthlyPoint[] {
  const { accounts, budgetLines, forecastLines, actualByAccountMonth, months } = params;
  const revenueIds = new Set(accounts.filter((a) => a.type === 'revenue').map((a) => a.id));
  const expenseIds = new Set(accounts.filter((a) => a.type === 'expense').map((a) => a.id));

  function netFor(lines: FinancialPlanLine[], month: MonthDescriptor): number {
    let net = 0;
    for (const l of lines) {
      if (monthKey(l.periodYear, l.periodMonth) !== month.key) continue;
      if (revenueIds.has(l.accountId)) net += l.amount;
      else if (expenseIds.has(l.accountId)) net -= l.amount;
    }
    return net;
  }

  return months.map((month) => {
    let actualNet = 0;
    for (const [accountId, byMonth] of actualByAccountMonth) {
      const v = byMonth.get(month.key);
      if (!v) continue;
      if (revenueIds.has(accountId)) actualNet += v;
      else if (expenseIds.has(accountId)) actualNet -= v;
    }
    return {
      key: month.key,
      label: month.label,
      budget: netFor(budgetLines, month),
      forecast: netFor(forecastLines, month),
      actual: actualNet,
    };
  });
}

/** One account's own Budget/Forecast/Actual trend by month — used by the drill-down/trend view for a single selected account. */
export function computeAccountMonthlySeries(params: {
  accountId: ID;
  budgetLines: FinancialPlanLine[];
  forecastLines: FinancialPlanLine[];
  actualByAccountMonth: Map<ID, Map<string, number>>;
  months: MonthDescriptor[];
}): ForecastMonthlyPoint[] {
  const { accountId, budgetLines, forecastLines, actualByAccountMonth, months } = params;
  const actualByMonth = actualByAccountMonth.get(accountId);
  return months.map((month) => ({
    key: month.key,
    label: month.label,
    budget: budgetLines.filter((l) => l.accountId === accountId && monthKey(l.periodYear, l.periodMonth) === month.key).reduce((s, l) => s + l.amount, 0),
    forecast: forecastLines.filter((l) => l.accountId === accountId && monthKey(l.periodYear, l.periodMonth) === month.key).reduce((s, l) => s + l.amount, 0),
    actual: actualByMonth?.get(month.key) ?? 0,
  }));
}

/** Deterministic evidence for the journal-entry lines behind one account's Actual in the selected range — no fabricated explanation. */
export interface VarianceEvidence {
  entryCount: number;
  /** The single largest-magnitude entry's normal-direction contribution. */
  largestEntry?: { entryId: ID; entryNumber: string; amount: number; date: string; source: string };
  /** Contribution grouped by `JournalEntry.source` (e.g. "invoice", "bill", "manual"), largest first. */
  bySource: { source: string; amount: number; count: number }[];
}

export function computeVarianceEvidence(entries: JournalEntry[], accounts: Account[], accountId: ID, months: MonthDescriptor[]): VarianceEvidence {
  const account = accounts.find((a) => a.id === accountId);
  const keys = new Set(months.map((m) => m.key));
  const contributions: { entry: JournalEntry; amount: number }[] = [];

  for (const entry of entries) {
    if (entry.status !== 'posted') continue;
    const d = new Date(entry.date);
    if (Number.isNaN(d.getTime())) continue;
    if (!keys.has(monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1))) continue;
    for (const line of entry.lines) {
      if (line.accountId !== accountId) continue;
      const normal = account?.normalBalance;
      const amount = normal === 'credit' ? line.credit - line.debit : line.debit - line.credit;
      if (amount !== 0) contributions.push({ entry, amount });
    }
  }

  const bySourceMap = new Map<string, { amount: number; count: number }>();
  for (const { entry, amount } of contributions) {
    const existing = bySourceMap.get(entry.source) ?? { amount: 0, count: 0 };
    bySourceMap.set(entry.source, { amount: existing.amount + amount, count: existing.count + 1 });
  }
  const bySource = Array.from(bySourceMap.entries())
    .map(([source, v]) => ({ source, ...v }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  const largest = contributions.slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];

  return {
    entryCount: contributions.length,
    largestEntry: largest
      ? { entryId: largest.entry.id, entryNumber: largest.entry.entryNumber, amount: largest.amount, date: largest.entry.date, source: largest.entry.source }
      : undefined,
    bySource,
  };
}
