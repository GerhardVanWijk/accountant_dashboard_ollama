import type { BaseEntity, ID, ISODateString } from './common';

/**
 * Capital Gains Tax (SA_ACCOUNTING_MASTER_SPEC.md §55) — a read-only TAX
 * computation/reconciliation layer on top of the fixed-asset disposal
 * ledger (src/features/assets/services/assetDisposalService.ts). This
 * module posts nothing to the GL: the ACCOUNTING gain/loss on a disposal
 * is already posted by assetDisposalService to acc_4200/acc_5300. §55's
 * whole point is to separate that ACCOUNTING PROFIT from the TAXABLE
 * CAPITAL GAIN computed here, so the two are never conflated.
 *
 * Every rate/threshold below is a mock-data-configured, effective-dated
 * figure (src/mock-data/capitalGainsTaxConfig.ts) with a required
 * `sourceReference` — never hardcoded in a service or component
 * (docs/DO_NOT_BREAK.md "Tax & Accounting Logic"), per §110/§111's
 * "no unsupported claims" / "professional review required" rules.
 */

/**
 * Broad SARS CGT treatment bucket a company's SALegalEntityType maps to.
 * 'natural_person_like' also covers `sole_proprietor` and `partnership` —
 * a partnership itself is not really the CGT taxpayer (gains flow through
 * to the individual partners), but that flow-through isn't modeled in
 * this single-entity-scope app, so a partnership is treated as a natural
 * person for inclusion-rate/annual-exclusion purposes here. This is a
 * documented simplification, not a SARS rule — flagged in
 * CapitalGainsPeriodReport.simplificationNotes.
 */
export type CgtEntityTypeBucket = 'natural_person_like' | 'company' | 'trust';

/**
 * SARS CGT inclusion rate for a broad entity-type bucket, effective-dated
 * like TaxRate (src/types/taxRate.ts) but using the lighter
 * create-only-per-period pattern of PayrollTaxYearConfig
 * (src/types/payroll.ts) rather than TaxRate's full supersede()-with-
 * audit-trail engine — a SARS inclusion rate changes by legislative
 * amendment, not by an accountant's own business decision.
 *
 * `entityTypeBucket === 'trust'` always uses the standard rate — the
 * "special trust" 40% sub-case (SARS's own inclusion-rate page) is NOT
 * modeled: no special-trust flag exists on Company. Flagged as a
 * simplification wherever a trust's report is shown.
 */
export interface CgtInclusionRateConfig extends BaseEntity {
  entityTypeBucket: CgtEntityTypeBucket;
  inclusionRatePercent: number;
  effectiveFrom: ISODateString;
  /** undefined = still the current rate for this bucket. */
  effectiveTo?: ISODateString;
  sourceReference: string;
}

/**
 * SARS CGT annual exclusion (natural-person-like entities only — SARS's
 * own page gives companies/trusts no annual exclusion at all, so no
 * config record should ever be created for those buckets). Applied ONCE
 * against the aggregate NET capital gain for a chosen period, not
 * per-disposal.
 */
export interface CgtAnnualExclusionConfig extends BaseEntity {
  amount: number;
  effectiveFrom: ISODateString;
  effectiveTo?: ISODateString;
  sourceReference: string;
}

/**
 * User-entered selling-costs override for one AssetDisposal, kept purely
 * additive in this feature's own domain rather than touching
 * AssetDisposal (src/types/fixedAsset.ts, owned by the Assets bee).
 * Absence of a record for a disposalId means sellingCosts defaults to 0 —
 * this app does not capture selling costs anywhere else on a disposal.
 */
export interface CgtDisposalAdjustment extends BaseEntity {
  disposalId: ID;
  sellingCosts: number;
}

/**
 * One disposal's accounting-vs-tax reconciliation row. Shows the
 * ACCOUNTING figures (proceeds, carrying value, accounting gain/loss —
 * straight from AssetDisposal) side by side with the TAX figures (base
 * cost, selling costs, capital gain/loss) so the §55 distinction is
 * visually obvious, which is the entire point of this module.
 */
export interface CgtDisposalComputation {
  disposalId: ID;
  assetId: ID;
  assetNumber: string;
  assetName: string;
  disposalDate: ISODateString;
  proceeds: number;
  /** carryingValueAtDisposal, from AssetDisposal — the accounting books' view. */
  accountingCarryingValue: number;
  /** AssetDisposal.gainLoss (proceeds - carryingValueAtDisposal) — NOT the taxable figure. */
  accountingGainLoss: number;
  /**
   * The disposed FixedAsset's original `cost` (src/types/fixedAsset.ts).
   * Does NOT include any capital-improvement addition to base cost — this
   * app has no capital-improvement tracking on FixedAsset. That is a
   * documented simplification (see CapitalGainsPeriodReport.simplificationNotes),
   * not a fabricated number.
   */
  baseCost: number;
  /** User-entered override via CgtDisposalAdjustment, defaults to 0. */
  sellingCosts: number;
  /** proceeds - baseCost - sellingCosts. Positive = capital gain, negative = capital loss. */
  capitalGainLoss: number;
}

/**
 * Full CGT reconciliation for one chosen period and the company's
 * current legalEntityType. Nothing here is posted to the GL — purely a
 * computed report (CapitalGainsService.getPeriodReport()).
 */
export interface CapitalGainsPeriodReport {
  periodStart: ISODateString;
  periodEnd: ISODateString;
  entityTypeBucket: CgtEntityTypeBucket;
  disposals: CgtDisposalComputation[];
  /**
   * Disposals in the period whose asset could not be looked up (e.g. a
   * deleted/missing FixedAsset record) — excluded from every total below
   * rather than silently guessing a base cost, same "flag, don't drop
   * silently" precedent as vatReportService's unresolvedLineCount.
   */
  unresolvedDisposalCount: number;
  /** Sum of capitalGainLoss across every resolved disposal in the period. */
  netCapitalGainLoss: number;
  inclusionRatePercent: number;
  /** undefined only when no CgtInclusionRateConfig covers this bucket/date — flagged via configWarnings. */
  inclusionRateSourceReference?: string;
  /** Only true for entityTypeBucket === 'natural_person_like'. */
  annualExclusionEligible: boolean;
  /** The configured annual exclusion amount available for the period (0 when not eligible or not configured). */
  annualExclusionAvailable: number;
  /** How much of annualExclusionAvailable actually offset the net gain (capped at the gain; never applied to a loss). */
  annualExclusionApplied: number;
  annualExclusionSourceReference?: string;
  /** max(0, netCapitalGainLoss - annualExclusionApplied) * inclusionRatePercent / 100. Never negative. */
  taxableCapitalGain: number;
  /**
   * abs(netCapitalGainLoss) when the aggregate position for the period is
   * a net loss, else 0 — surfaced for the user to see, NOT carried forward
   * into a future period's computation. Full assessed-capital-loss
   * carryforward tracking is an open gap (see simplificationNotes).
   */
  netCapitalLossForPeriod: number;
  /** Documented §55 simplifications and open gaps this report does not model — always non-empty. */
  simplificationNotes: string[];
  /** Configuration problems found while building this report (e.g. missing rate/exclusion config for the date) — requires professional/accounting review before relying on the figures above. */
  configWarnings: string[];
}
