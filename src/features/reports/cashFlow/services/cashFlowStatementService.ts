import type { Account, AssetDisposal, ID, JournalEntry } from '@/types';
import { journalEntryService } from '@/features/accounting/services';
import { accountService } from '@/features/accounting/services';
import { assetDisposalService } from '@/features/assets/services';

/**
 * Statement of Cash Flows — INDIRECT method only (SA_ACCOUNTING_MASTER_SPEC.md
 * §42). Reads real posted GL data through the accounting/assets services;
 * never re-implements posting logic and never mutates anything (report-only
 * module).
 *
 * Explicitly OUT OF SCOPE (per dispatch): comparative/YoY columns, cash flow
 * forecasting, a direct-method presentation. Indirect only.
 *
 * SCOPE NOTE on working capital: only Accounts Receivable (acc_1100),
 * Inventory (acc_1200) and Accounts Payable (acc_2000) are tracked as
 * working-capital movements in Operating activities, per the dispatch spec.
 * Any OTHER current asset/liability account that moves cash indirectly
 * (VAT Payable, PAYE/UIF/SDL Payable, Provisional Tax Payable, loan
 * accounts, etc.) is NOT tracked here — if a real trial balance posts cash
 * movements through one of those untracked accounts, the reconciliation
 * check below will show a variance, which is a real signal that the
 * statement's classification is incomplete for that data set, not a bug in
 * the math. Extending working-capital coverage to every current
 * asset/liability account is future scope, not attempted here.
 */

/** Fixed GL account ids (src/mock-data/accounts.ts) this statement classifies. */
const CASH_AND_BANK_ACCOUNT_ID = 'acc_1000';
const ACCOUNTS_RECEIVABLE_ACCOUNT_ID = 'acc_1100';
const INVENTORY_ACCOUNT_ID = 'acc_1200';
const FIXED_ASSETS_ACCOUNT_ID = 'acc_1500';
const ACCOUNTS_PAYABLE_ACCOUNT_ID = 'acc_2000';
const OWNERS_EQUITY_ACCOUNT_ID = 'acc_3000';
const GAIN_ON_DISPOSAL_ACCOUNT_ID = 'acc_4200';
const DEPRECIATION_EXPENSE_ACCOUNT_ID = 'acc_5200';
const LOSS_ON_DISPOSAL_ACCOUNT_ID = 'acc_5300';
const DIVIDENDS_PAYABLE_ACCOUNT_ID = 'acc_2500';
/**
 * Dividends Tax Payable (Withholding) — NOT one of the fixed account ids
 * the dispatch spec listed, but read directly from the real
 * DividendDeclarationService.pay() posting
 * (src/features/tax/dividendsTax/services/dividendDeclarationService.ts):
 * that entry debits Dividends Payable for the FULL GROSS dividend, credits
 * Cash and Bank for only the net-of-withholding amount, and credits this
 * account for the withheld portion — i.e. the withheld amount is not yet
 * real cash out. Netting it out of the acc_2500 debit is required for the
 * reconciliation check to hold; see computeCashFlowStatement()'s financing
 * section below for the derivation.
 */
const DIVIDENDS_TAX_PAYABLE_ACCOUNT_ID = 'acc_2510';

/** Half a cent — same rounding tolerance used across the ledger (journalEntryService.ts). */
const EPSILON = 0.005;

export interface CashFlowPeriod {
  /** ISO date/date-time, inclusive. */
  start: string;
  /** ISO date/date-time, inclusive. */
  end: string;
}

export interface CashFlowLineItem {
  label: string;
  amount: number;
}

export interface CashFlowSection {
  items: CashFlowLineItem[];
  total: number;
}

export interface CashFlowStatement {
  period: CashFlowPeriod;
  /** Independently computed bottom line for the period — Revenue minus ALL Expenses (including Income Tax Expense), not imported from the Income Statement feature. */
  netProfit: number;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  /** operating.total + investing.total + financing.total */
  netCashMovement: number;
  /** Net debit/credit movement on Cash and Bank (acc_1000) for the same period, computed independently of the three sections above. */
  actualCashMovement: number;
  /** netCashMovement - actualCashMovement; should be ~0 when the classification above is complete. */
  variance: number;
  /** true when |variance| <= EPSILON. */
  reconciles: boolean;
}

function isPosted(entry: JournalEntry): boolean {
  return entry.status === 'posted';
}

function inPeriod(entry: JournalEntry, period: CashFlowPeriod): boolean {
  return isPosted(entry) && entry.date >= period.start && entry.date <= period.end;
}

/** Sum of (debit - credit) across every line touching accountId, in the given entries. Positive = net debit movement. */
function netDebitMovement(entries: JournalEntry[], accountId: ID): number {
  let total = 0;
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.accountId === accountId) total += line.debit - line.credit;
    }
  }
  return total;
}

/** Sum of debit lines only touching accountId (ignores any credit lines on the same account). */
function sumDebitLinesOnly(entries: JournalEntry[], accountId: ID): number {
  let total = 0;
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.accountId === accountId) total += line.debit;
    }
  }
  return total;
}

/** Sum of credit lines only touching accountId (ignores any debit lines on the same account). */
function sumCreditLinesOnly(entries: JournalEntry[], accountId: ID): number {
  let total = 0;
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.accountId === accountId) total += line.credit;
    }
  }
  return total;
}

/**
 * Pure computation — no I/O — so it's independently unit-testable against
 * hand-built JournalEntry/Account/AssetDisposal fixtures.
 */
export function computeCashFlowStatement(
  entries: JournalEntry[],
  accounts: Account[],
  disposals: AssetDisposal[],
  period: CashFlowPeriod,
): CashFlowStatement {
  const periodEntries = entries.filter((e) => inPeriod(e, period));
  const accountType = new Map(accounts.map((a) => [a.id, a.type]));

  // --- Net Profit: own single-pass bottom line, not imported from the ---
  // --- Income Statement feature (parallel dispatch, may not exist yet). ---
  let netProfit = 0;
  for (const entry of periodEntries) {
    for (const line of entry.lines) {
      const type = accountType.get(line.accountId);
      if (type === 'revenue') netProfit += line.credit - line.debit;
      else if (type === 'expense') netProfit -= line.debit - line.credit;
    }
  }

  // --- Operating activities ---
  const depreciation = netDebitMovement(periodEntries, DEPRECIATION_EXPENSE_ACCOUNT_ID);
  const lossOnDisposal = netDebitMovement(periodEntries, LOSS_ON_DISPOSAL_ACCOUNT_ID);
  // acc_4200 is credit-normal (revenue-like); a positive "gain" figure is a net CREDIT movement.
  const gainOnDisposal = -netDebitMovement(periodEntries, GAIN_ON_DISPOSAL_ACCOUNT_ID);

  // acc_1100/acc_1200 are debit-normal assets: a positive netDebitMovement is a real increase (cash used).
  const arChange = netDebitMovement(periodEntries, ACCOUNTS_RECEIVABLE_ACCOUNT_ID);
  const inventoryChange = netDebitMovement(periodEntries, INVENTORY_ACCOUNT_ID);
  // acc_2000 is credit-normal: a positive increase in the payable is a net CREDIT movement.
  const apChange = -netDebitMovement(periodEntries, ACCOUNTS_PAYABLE_ACCOUNT_ID);

  const operatingItems: CashFlowLineItem[] = [
    { label: 'Net Profit', amount: netProfit },
    { label: 'Add: Depreciation', amount: depreciation },
    { label: 'Add: Loss on Disposal of Assets', amount: lossOnDisposal },
    { label: 'Less: Gain on Disposal of Assets', amount: -gainOnDisposal },
    { label: 'Increase / (Decrease) in Accounts Receivable', amount: -arChange },
    { label: 'Increase / (Decrease) in Inventory', amount: -inventoryChange },
    { label: 'Increase / (Decrease) in Accounts Payable', amount: apChange },
  ];
  const operatingTotal = operatingItems.reduce((sum, item) => sum + item.amount, 0);

  // --- Investing activities ---
  // Debits alone on acc_1500 are always genuine acquisitions (a disposal only ever credits it — see assetDisposalService.disposeAsset()).
  const acquisitions = sumDebitLinesOnly(periodEntries, FIXED_ASSETS_ACCOUNT_ID);
  const periodDisposals = disposals.filter((d) => d.disposalDate >= period.start && d.disposalDate <= period.end);
  const disposalProceeds = periodDisposals.reduce((sum, d) => sum + d.proceeds, 0);

  const investingItems: CashFlowLineItem[] = [
    { label: 'Purchase of Fixed Assets', amount: -acquisitions },
    { label: 'Proceeds from Disposal of Fixed Assets', amount: disposalProceeds },
  ];
  const investingTotal = investingItems.reduce((sum, item) => sum + item.amount, 0);

  // --- Financing activities ---
  // acc_3000 is credit-normal: a net credit movement (contribution) is positive cash in; a net debit movement (drawing) is cash out.
  const equityMovement = -netDebitMovement(periodEntries, OWNERS_EQUITY_ACCOUNT_ID);

  // Dividends: DividendDeclarationService.pay() debits Dividends Payable for
  // the FULL GROSS amount but only credits Cash for the net-of-withholding
  // amount (the rest is credited to Dividends Tax Payable, not yet real
  // cash). Netting the acc_2510 credit back out of the acc_2500 debit
  // isolates the actual cash paid to shareholders at pay() time. A later
  // remitToSars() debits acc_2510 directly against Cash — that IS real cash
  // out, shown as its own line, and captured by adding back any acc_2510
  // debit movement.
  const dividendsPaidToShareholders =
    sumDebitLinesOnly(periodEntries, DIVIDENDS_PAYABLE_ACCOUNT_ID) -
    sumCreditLinesOnly(periodEntries, DIVIDENDS_TAX_PAYABLE_ACCOUNT_ID);
  const dividendsTaxRemitted = sumDebitLinesOnly(periodEntries, DIVIDENDS_TAX_PAYABLE_ACCOUNT_ID);

  const financingItems: CashFlowLineItem[] = [
    { label: "Owner's Equity Movement (Contributions / Drawings)", amount: equityMovement },
    { label: 'Dividends Paid to Shareholders', amount: -dividendsPaidToShareholders },
    { label: 'Dividends Tax Remitted to SARS', amount: -dividendsTaxRemitted },
  ];
  const financingTotal = financingItems.reduce((sum, item) => sum + item.amount, 0);

  const netCashMovement = operatingTotal + investingTotal + financingTotal;
  const actualCashMovement = netDebitMovement(periodEntries, CASH_AND_BANK_ACCOUNT_ID);
  const variance = netCashMovement - actualCashMovement;

  return {
    period,
    netProfit,
    operating: { items: operatingItems, total: operatingTotal },
    investing: { items: investingItems, total: investingTotal },
    financing: { items: financingItems, total: financingTotal },
    netCashMovement,
    actualCashMovement,
    variance,
    reconciles: Math.abs(variance) <= EPSILON,
  };
}

/**
 * I/O wrapper: pulls real posted entries/accounts/disposals through the
 * existing accounting/assets services (never a second data-access layer,
 * per docs/DO_NOT_BREAK.md) and hands them to the pure computation above.
 */
export async function getCashFlowStatement(period: CashFlowPeriod): Promise<CashFlowStatement> {
  const [entries, accounts, disposals] = await Promise.all([
    journalEntryService.getEntries(),
    accountService.getAccounts(),
    assetDisposalService.getDisposals(),
  ]);
  return computeCashFlowStatement(entries, accounts, disposals, period);
}
