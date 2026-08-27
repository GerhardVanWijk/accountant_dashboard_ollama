import type { CurrencyCode } from '@/types';

/**
 * Reporting currency for Banking's display formatting. Same
 * single-named-constant pattern as INVENTORY_CURRENCY
 * (src/features/inventory/constants.ts) — there is no global
 * company-settings/currency module yet, so this is one place to swap once
 * one exists, not a value scattered inline across components.
 */
export const BANKING_CURRENCY: CurrencyCode = 'ZAR';

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
