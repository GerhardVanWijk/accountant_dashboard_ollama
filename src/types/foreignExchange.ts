import type { BaseEntity, CurrencyCode, ISODateString } from './common';

/**
 * Foreign Exchange domain types (SA_ACCOUNTING_MASTER_SPEC.md §33
 * "FOREIGN CURRENCY").
 *
 * SCOPE BOUNDARY — read before wiring anything else into this: this file
 * defines only the exchange-RATE record and the pure gain/loss math built
 * on top of it (src/features/foreignExchange/services/fxCalculations.ts).
 * No type in this codebase's Customer, Supplier, BankAccount, Invoice, or
 * Bill carries a transaction currency distinct from the company's
 * functional currency (ZAR) today, so there is nothing yet for an
 * ExchangeRate to actually apply to on a real posted document — no
 * foreign-currency customers/suppliers/bank accounts/invoices exist in
 * this codebase, and nothing here posts to the GL. That is deliberate,
 * bounded scope for this pass, not an oversight — building real
 * foreign-currency Customers/Suppliers/Invoices/Bills/BankAccounts is a
 * separate, larger cross-cutting change touching Sales/Purchases/Banking
 * broadly. See exchangeRateService.ts's doc comment and
 * docs/SA_SPEC_GAP_ANALYSIS.md's Phase 12 entry for the full picture.
 */
export interface ExchangeRate extends BaseEntity {
  /** The foreign currency being converted FROM, e.g. 'USD'. */
  fromCurrency: CurrencyCode;
  /**
   * The currency being converted TO — in practice this app's functional
   * currency, 'ZAR', but kept general rather than hardcoded so this type
   * isn't blocked on a future multi-functional-currency setup.
   */
  toCurrency: CurrencyCode;
  /** Units of toCurrency per 1 unit of fromCurrency. */
  rate: number;
  /**
   * The specific date this rate applies to — a point-in-time market rate,
   * not an effective-dated [effectiveFrom, effectiveTo] range like
   * `TaxRate` (src/types/tax.ts). A wrong entry should, as a matter of
   * process, be superseded by a new rate for the same date rather than
   * edited in place — see exchangeRateService.ts's doc comment for why
   * the repository nonetheless permits update/delete.
   */
  rateDate: ISODateString;
  /**
   * ALWAYS manually entered — no live FX feed is wired into this
   * codebase. Every rate's source must say so explicitly
   * (SA_ACCOUNTING_MASTER_SPEC.md §110/§111 — no unsupported claims;
   * requires professional review before relying on this for a real
   * filing).
   */
  sourceReference: string;
}
