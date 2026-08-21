/**
 * Currency formatter for Banking's FinancialNumber displays. Combines the
 * codebase's two existing conventions: real currency symbol formatting
 * (src/utils/formatCurrency.ts's Intl approach, used by Customers) AND an
 * explicit +/- sign on every value (src/utils/formatFinancial.ts's
 * convention, used by Sales/Purchases and required by
 * docs/DO_NOT_BREAK.md's Financial UI Patterns checklist). `Intl`'s
 * `signDisplay: 'exceptZero'` gives both in one call.
 *
 * Feature-local (not touching either shared formatter) since ZAR is
 * Banking's presentation currency for this pass — every seeded BankAccount
 * bar one is ZAR (docs/SA_ACCOUNTING_MASTER_SPEC.md). A future multi-
 * currency pass would thread the account's real CurrencyCode through
 * instead of hardcoding ZAR here.
 */
export function formatZAR(value: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    signDisplay: 'exceptZero',
  }).format(value);
}
