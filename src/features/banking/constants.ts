import type { CurrencyCode, ID } from '@/types';

/**
 * Reporting currency for Banking's display formatting. Same
 * single-named-constant pattern as INVENTORY_CURRENCY
 * (src/features/inventory/constants.ts) — there is no global
 * company-settings/currency module yet, so this is one place to swap once
 * one exists, not a value scattered inline across components.
 */
export const BANKING_CURRENCY: CurrencyCode = 'ZAR';

/**
 * Chart of Accounts ids for VAT control accounts (src/mock-data/accounts.ts,
 * owned by the Accounting module). Receipts post VAT to the Output account,
 * payments post VAT to the Input account — see
 * src/features/banking/utils/taxCalculations.ts. Named constants rather than
 * magic strings scattered across services/components, per
 * docs/DO_NOT_BREAK.md "Tax & Accounting Logic".
 */
export const VAT_OUTPUT_ACCOUNT_ID: ID = 'acc_2100';
export const VAT_INPUT_ACCOUNT_ID: ID = 'acc_2110';

/** Common SA retail/business banks, for the Bank Name select. "Other" allows a free-text entry. */
export const SA_BANKS: readonly string[] = [
  'FNB',
  'Standard Bank',
  'Absa',
  'Nedbank',
  'Capitec',
  'Investec',
  'Bidvest Bank',
  'TymeBank',
  'Discovery Bank',
  'Bank Zero',
  'Other',
];

/** BankAccountType -> display label, SA terminology (docs/SA_ACCOUNTING_MASTER_SPEC.md). */
export const BANK_ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: 'Current Account',
  savings: 'Savings Account',
  credit_card: 'Credit Card',
  cash: 'Petty Cash',
  money_market: 'Money Market Account',
  foreign_currency: 'Foreign Currency Account',
};
