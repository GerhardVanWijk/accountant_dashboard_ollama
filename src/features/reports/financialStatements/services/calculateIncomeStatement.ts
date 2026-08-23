import type { Account, ID, JournalEntry } from '@/types';

/**
 * Chart of Accounts codes that get their own dedicated line on the Income
 * Statement rather than being folded into a category total — matched by
 * `code`, not a fixed id (account ids are real Supabase-generated uuids,
 * not the old Mock-era `'acc_XXXX'` literal). Mirrors the
 * DEFAULT_CONTRA_ACCOUNT_CODE pattern in
 * src/features/employees/components/PostPayrollRunForm.tsx.
 */
export const COST_OF_GOODS_SOLD_ACCOUNT_CODE = '5000';
/** New in Phase 9 Wave 1 — the corporate income tax charge (§51/§52). */
export const INCOME_TAX_EXPENSE_ACCOUNT_CODE = '5500';

export interface StatementAccountLine {
  accountId: ID;
  code: string;
  name: string;
  /**
   * Always expressed as a positive "normal" amount for the category it's
   * shown under — credit-debit for a revenue line, debit-credit for an
   * expense line — never a raw signed debitVector.
   */
  amount: number;
}

export interface IncomeStatement {
  startDate: string;
  endDate: string;
  revenueLines: StatementAccountLine[];
  revenueTotal: number;
  costOfGoodsSoldLines: StatementAccountLine[];
  costOfGoodsSoldTotal: number;
  grossProfit: number;
  operatingExpenseLines: StatementAccountLine[];
  operatingExpenseTotal: number;
  profitBeforeTax: number;
  incomeTaxExpenseLines: StatementAccountLine[];
  incomeTaxExpenseTotal: number;
  netProfitAfterTax: number;
}

/** First 10 chars of an ISO date(-time) string — lexical compare == chronological compare, same trick calculateMonthlyFinancials.ts uses for month keys. */
function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function sumLines(lines: StatementAccountLine[]): number {
  return lines.reduce((total, line) => total + line.amount, 0);
}

function sortByCode(a: StatementAccountLine, b: StatementAccountLine): number {
  return a.code.localeCompare(b.code);
}

/**
 * Classified Profit & Loss (Income Statement) for a date range —
 * SA_ACCOUNTING_MASTER_SPEC.md §42.
 *
 * Sums each account's NET movement over posted JournalEntry lines dated
 * within [startDate, endDate] (inclusive, by calendar day). A reversal
 * entry is itself `status: 'posted'` with debit/credit swapped from the
 * original (docs/LEDGER_ARCHITECTURE.md), so summing every posted line
 * nets a reversed transaction back out to zero automatically — same
 * principle calculateMonthlyFinancials.ts already relies on; reversals are
 * never special-cased here.
 *
 * Structure: Revenue -> Cost of Goods Sold (acc_5000) -> Gross Profit ->
 * Operating Expenses (every other expense account) -> Profit Before Tax ->
 * Income Tax Expense (acc_5500) -> Net Profit After Tax. Every account
 * that moved in the period gets its own line under its category header —
 * this is not a flat revenue-minus-expenses number.
 */
export function calculateIncomeStatement(
  entries: JournalEntry[],
  accounts: Account[],
  startDate: string,
  endDate: string,
): IncomeStatement {
  const start = dateOnly(startDate);
  const end = dateOnly(endDate);

  // Positive = net credit movement (revenue direction); expense lines flip
  // sign below when building rows. Mirrors the debitVector()/netByAccount
  // approach in journalEntryService.computeTrialBalance(), just credit-first
  // since revenue is the category we read off directly.
  const netByAccount = new Map<ID, number>();

  for (const entry of entries) {
    if (entry.status !== 'posted') continue;
    const entryDate = dateOnly(entry.date);
    if (entryDate < start || entryDate > end) continue;

    for (const line of entry.lines) {
      const current = netByAccount.get(line.accountId) ?? 0;
      netByAccount.set(line.accountId, current + (line.credit - line.debit));
    }
  }

  const revenueLines: StatementAccountLine[] = [];
  const costOfGoodsSoldLines: StatementAccountLine[] = [];
  const operatingExpenseLines: StatementAccountLine[] = [];
  const incomeTaxExpenseLines: StatementAccountLine[] = [];

  for (const account of accounts) {
    const net = netByAccount.get(account.id) ?? 0;
    if (net === 0) continue;

    if (account.type === 'revenue') {
      revenueLines.push({ accountId: account.id, code: account.code, name: account.name, amount: net });
    } else if (account.type === 'expense') {
      const amount = -net; // debit - credit, the expense's own normal direction
      const line = { accountId: account.id, code: account.code, name: account.name, amount };
      if (account.code === COST_OF_GOODS_SOLD_ACCOUNT_CODE) {
        costOfGoodsSoldLines.push(line);
      } else if (account.code === INCOME_TAX_EXPENSE_ACCOUNT_CODE) {
        incomeTaxExpenseLines.push(line);
      } else {
        operatingExpenseLines.push(line);
      }
    }
  }

  revenueLines.sort(sortByCode);
  costOfGoodsSoldLines.sort(sortByCode);
  operatingExpenseLines.sort(sortByCode);
  incomeTaxExpenseLines.sort(sortByCode);

  const revenueTotal = sumLines(revenueLines);
  const costOfGoodsSoldTotal = sumLines(costOfGoodsSoldLines);
  const grossProfit = revenueTotal - costOfGoodsSoldTotal;
  const operatingExpenseTotal = sumLines(operatingExpenseLines);
  const profitBeforeTax = grossProfit - operatingExpenseTotal;
  const incomeTaxExpenseTotal = sumLines(incomeTaxExpenseLines);
  const netProfitAfterTax = profitBeforeTax - incomeTaxExpenseTotal;

  return {
    startDate,
    endDate,
    revenueLines,
    revenueTotal,
    costOfGoodsSoldLines,
    costOfGoodsSoldTotal,
    grossProfit,
    operatingExpenseLines,
    operatingExpenseTotal,
    profitBeforeTax,
    incomeTaxExpenseLines,
    incomeTaxExpenseTotal,
    netProfitAfterTax,
  };
}
