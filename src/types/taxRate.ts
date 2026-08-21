import type { BaseEntity, ISODateString } from './common';

export type TaxAppliesTo = 'sales' | 'purchases' | 'both';

/**
 * The VAT treatment a rate represents — SA_ACCOUNTING_MASTER_SPEC.md §12's
 * list of configurable VAT tax codes. Distinct from `code` (a short
 * mnemonic like "STD") — `treatment` is what the accounting/reporting
 * layer branches on (e.g. VAT201 box mapping), `code` is what a human
 * picks from a dropdown.
 */
export type VatTreatment =
  | 'standard_rated'
  | 'zero_rated'
  | 'exempt'
  | 'out_of_scope'
  | 'capital_goods'
  | 'import_vat'
  | 'reverse_charge'
  | 'non_deductible';

/**
 * A single effective-dated VAT rate version (SA_ACCOUNTING_MASTER_SPEC.md
 * §9/§82/§113: "rates and thresholds must never be scattered throughout
 * source code" — every rate must carry its own effective window and
 * source reference, not be a bare percentage).
 *
 * IMMUTABLE ONCE POSTED AGAINST: a `TaxRate` record is never edited in
 * place once any document line item references it — see
 * `TaxRateService.supersede()`, which creates a NEW record (with a new
 * `effectiveFrom`) and closes the old one's `effectiveTo`, rather than
 * changing `rate` on the existing row. This is what makes §83 possible
 * ("a 2026 transaction must remain calculated according to the rules
 * applicable to that transaction" even after the rate later changes) —
 * `DocumentLineItem.taxRateId` points at one specific historical version,
 * not a mutable "current rate for this code".
 *
 * `code` groups versions of "the same" rate across time (e.g. every
 * version of the standard rate shares `code: 'STD'`) — use
 * `TaxRateService.getEffectiveRate(code, asOf)` to resolve which version
 * applied on a given date, and `TaxRateService.getCurrentRate(code)` for
 * new transactions today.
 */
export interface TaxRate extends BaseEntity {
  /** Groups versions of the same conceptual rate across time, e.g. "STD". */
  code: string;
  name: string;
  treatment: VatTreatment;
  /** Percentage value, e.g. 15 for 15%. */
  rate: number;
  appliesTo: TaxAppliesTo;
  effectiveFrom: ISODateString;
  /** Open-ended (still current) when omitted. */
  effectiveTo?: ISODateString;
  /** ISO 3166-1 alpha-2, e.g. "ZA". This codebase only models South Africa today. */
  jurisdiction: string;
  /**
   * Legal/authoritative reference for this rate — SA_ACCOUNTING_MASTER_SPEC.md
   * §109/§110: every rate must be traceable to a source, and anything not
   * independently verified must say so rather than being presented as
   * confirmed. See docs/SA_SPEC_GAP_ANALYSIS.md for this project's actual
   * verification status.
   */
  sourceReference: string;
  isActive: boolean;
}
