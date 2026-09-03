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
 * Inventory (acc_1200), Accounts Payable (acc_2000) and Customer Deposits
 * (acc_2600, added Increment 4A) are tracked as working-capital movements
 * in Operating activities, per the dispatch spec.
 * Any OTHER current asset/liability account that moves cash indirectly
 * (VAT Payable, PAYE/UIF/SDL Payable, Provisional Tax Payable, loan
 * accounts, etc.) is NOT tracked here — if a real trial balance posts cash
 * movements through one of those untracked accounts, the reconciliation
 * check below will show a variance, which is a real signal that the
 * statement's classification is incomplete for that data set, not a bug in
 * the math. Extending working-capital coverage to every current
 * asset/liability account is future scope, not attempted here.
 */

/**
 * Chart of Accounts codes this statement classifies — matched by `code`,
 * not a fixed id (account ids are real Supabase-generated uuids, not the
 * old Mock-era `'acc_XXXX'` literal). `resolveAccountIdsByCode()` below
 * turns these into real ids from the `accounts` list this module always
 * has in scope, before filtering any journal line.
 */
const CASH_AND_BANK_ACCOUNT_CODE = '1000';
const ACCOUNTS_RECEIVABLE_ACCOUNT_CODE = '1100';
const INVENTORY_ACCOUNT_CODE = '1200';
const FIXED_ASSETS_ACCOUNT_CODE = '1500';
const ACCOUNTS_PAYABLE_ACCOUNT_CODE = '2000';
/** Customer money received before it is earned/applied — a contract liability (Increment 4A). Credit-normal; an increase is a source of cash. */
const CUSTOMER_DEPOSITS_ACCOUNT_CODE = '2600';
const OWNERS_EQUITY_ACCOUNT_CODE = '3000';
const GAIN_ON_DISPOSAL_ACCOUNT_CODE = '4200';
const DEPRECIATION_EXPENSE_ACCOUNT_CODE = '5200';
const LOSS_ON_DISPOSAL_ACCOUNT_CODE = '5300';
const DIVIDENDS_PAYABLE_ACCOUNT_CODE = '2500';
/**
 * Dividends Tax Payable (Withholding) — NOT one of the fixed account
 * codes the dispatch spec listed, but read directly from the real
 * DividendDeclarationService.pay() posting
 * (src/features/tax/dividendsTax/services/dividendDeclarationService.ts):
 * that entry debits Dividends Payable for the FULL GROSS dividend, credits
 * Cash and Bank for only the net-of-withholding amount, and credits this
 * account for the withheld portion — i.e. the withheld amount is not yet
 * real cash out. Netting it out of the Dividends Payable debit is required
 * for the reconciliation check to hold; see computeCashFlowStatement()'s
 * financing section below for the derivation.
 */
const DIVIDENDS_TAX_PAYABLE_ACCOUNT_CODE = '2510';

/**
 * Resolves every code above to a real account id from the `accounts` list
 * already in scope — a code with no matching account resolves to
 * `undefined`, and every movement helper below treats "no id" as a zero
 * contribution (same "missing account surfaces as a variance, not a
 * crash" philosophy this file's own doc comment already describes for
 * untracked working-capital accounts).
 */
function resolveAccountIdsByCode(accounts: Account[]) {
  const byCode = new Map(accounts.map((a) => [a.code, a.id]));
  return {
    cashAndBank: byCode.get(CASH_AND_BANK_ACCOUNT_CODE),
    accountsReceivable: byCode.get(ACCOUNTS_RECEIVABLE_ACCOUNT_CODE),
    inventory: byCode.get(INVENTORY_ACCOUNT_CODE),
    fixedAssets: byCode.get(FIXED_ASSETS_ACCOUNT_CODE),
    accountsPayable: byCode.get(ACCOUNTS_PAYABLE_ACCOUNT_CODE),
    customerDeposits: byCode.get(CUSTOMER_DEPOSITS_ACCOUNT_CODE),
    ownersEquity: byCode.get(OWNERS_EQUITY_ACCOUNT_CODE),
    gainOnDisposal: byCode.get(GAIN_ON_DISPOSAL_ACCOUNT_CODE),
    depreciationExpense: byCode.get(DEPRECIATION_EXPENSE_ACCOUNT_CODE),
    lossOnDisposal: byCode.get(LOSS_ON_DISPOSAL_ACCOUNT_CODE),
    dividendsPayable: byCode.get(DIVIDENDS_PAYABLE_ACCOUNT_CODE),
    dividendsTaxPayable: byCode.get(DIVIDENDS_TAX_PAYABLE_ACCOUNT_CODE),
  };
}

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

/** Sum of (debit - credit) across every line touching accountId, in the given entries. Positive = net debit movement. `undefined` (no matching account) contributes zero. */
function netDebitMovement(entries: JournalEntry[], accountId: ID | undefined): number {
  if (!accountId) return 0;
  let total = 0;
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.accountId === accountId) total += line.debit - line.credit;
    }
  }
  return total;
}

/** Sum of debit lines only touching accountId (ignores any credit lines on the same account). `undefined` contributes zero. */
function sumDebitLinesOnly(entries: JournalEntry[], accountId: ID | undefined): number {
  if (!accountId) return 0;
  let total = 0;
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.accountId === accountId) total += line.debit;
    }
  }
  return total;
}

/** Sum of credit lines only touching accountId (ignores any debit lines on the same account). `undefined` contributes zero. */
function sumCreditLinesOnly(entries: JournalEntry[], accountId: ID | undefined): number {
  if (!accountId) return 0;
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
  const ids = resolveAccountIdsByCode(accounts);

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
  const depreciation = netDebitMovement(periodEntries, ids.depreciationExpense);
  const lossOnDisposal = netDebitMovement(periodEntries, ids.lossOnDisposal);
  // Gain on Disposal is credit-normal (revenue-like); a positive "gain" figure is a net CREDIT movement.
  const gainOnDisposal = -netDebitMovement(periodEntries, ids.gainOnDisposal);

  // Accounts Receivable/Inventory are debit-normal assets: a positive netDebitMovement is a real increase (cash used).
  const arChange = netDebitMovement(periodEntries, ids.accountsReceivable);
  const inventoryChange = netDebitMovement(periodEntries, ids.inventory);
  // Accounts Payable is credit-normal: a positive increase in the payable is a net CREDIT movement.
  const apChange = -netDebitMovement(periodEntries, ids.accountsPayable);
  // Customer Deposits (2600) is credit-normal, same treatment as AP: an
  // increase in the deposit liability (a customer pays us in advance) is a
  // source of cash; applying a deposit to an invoice (DR 2600 / CR 1100)
  // nets to zero here against the matching AR movement.
  const customerDepositsChange = -netDebitMovement(periodEntries, ids.customerDeposits);

  const operatingItems: CashFlowLineItem[] = [
    { label: 'Net Profit', amount: netProfit },
    { label: 'Add: Depreciation', amount: depreciation },
    { label: 'Add: Loss on Disposal of Assets', amount: lossOnDisposal },
    { label: 'Less: Gain on Disposal of Assets', amount: -gainOnDisposal },
    { label: 'Increase / (Decrease) in Accounts Receivable', amount: -arChange },
    { label: 'Increase / (Decrease) in Inventory', amount: -inventoryChange },
    { label: 'Increase / (Decrease) in Accounts Payable', amount: apChange },
    { label: 'Increase / (Decrease) in Customer Deposits', amount: customerDepositsChange },
  ];
  const operatingTotal = operatingItems.reduce((sum, item) => sum + item.amount, 0);

  // --- Investing activities ---
  // Debits alone on Fixed Assets are always genuine acquisitions (a disposal only ever credits it — see assetDisposalService.disposeAsset()).
  const acquisitions = sumDebitLinesOnly(periodEntries, ids.fixedAssets);
  const periodDisposals = disposals.filter((d) => d.disposalDate >= period.start && d.disposalDate <= period.end);
  const disposalProceeds = periodDisposals.reduce((sum, d) => sum + d.proceeds, 0);

  const investingItems: CashFlowLineItem[] = [
    { label: 'Purchase of Fixed Assets', amount: -acquisitions },
    { label: 'Proceeds from Disposal of Fixed Assets', amount: disposalProceeds },
  ];
  const investingTotal = investingItems.reduce((sum, item) => sum + item.amount, 0);

  // --- Financing activities ---
  // Owner's Equity is credit-normal: a net credit movement (contribution) is positive cash in; a net debit movement (drawing) is cash out.
  const equityMovement = -netDebitMovement(periodEntries, ids.ownersEquity);

  // Dividends: DividendDeclarationService.pay() debits Dividends Payable for
  // the FULL GROSS amount but only credits Cash for the net-of-withholding
  // amount (the rest is credited to Dividends Tax Payable, not yet real
  // cash). Netting the Dividends Tax Payable credit back out of the
  // Dividends Payable debit isolates the actual cash paid to shareholders
  // at pay() time. A later remitToSars() debits Dividends Tax Payable
  // directly against Cash — that IS real cash out, shown as its own line,
  // and captured by adding back any Dividends Tax Payable debit movement.
  const dividendsPaidToShareholders =
    sumDebitLinesOnly(periodEntries, ids.dividendsPayable) - sumCreditLinesOnly(periodEntries, ids.dividendsTaxPayable);
  const dividendsTaxRemitted = sumDebitLinesOnly(periodEntries, ids.dividendsTaxPayable);

  const financingItems: CashFlowLineItem[] = [
    { label: "Owner's Equity Movement (Contributions / Drawings)", amount: equityMovement },
    { label: 'Dividends Paid to Shareholders', amount: -dividendsPaidToShareholders },
    { label: 'Dividends Tax Remitted to SARS', amount: -dividendsTaxRemitted },
  ];
  const financingTotal = financingItems.reduce((sum, item) => sum + item.amount, 0);

  const netCashMovement = operatingTotal + investingTotal + financingTotal;
  const actualCashMovement = netDebitMovement(periodEntries, ids.cashAndBank);
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
