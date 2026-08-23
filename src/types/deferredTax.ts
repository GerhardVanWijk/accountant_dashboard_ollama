import type { BaseEntity, ID, ISODateString } from './common';

/**
 * South African deferred tax (SA_ACCOUNTING_MASTER_SPEC.md §50, §116 Phase
 * 12 "Advanced Accounting"). Deliberately NOT `accountingProfit x taxRate`
 * (the spec explicitly forbids that shortcut) — every item here is a real
 * temporary difference: the difference between an asset/liability's
 * carrying amount in the accounting records and its tax base.
 */

export type TemporaryDifferenceSource = 'fixed_asset' | 'other';

/**
 * 'taxable': carrying amount > tax base — will increase future taxable
 * profit when it reverses, so it ALWAYS gives rise to a Deferred Tax
 * Liability (no recognition threshold under IFRS, with narrow exceptions
 * not relevant to a single-entity SA company).
 * 'deductible': carrying amount < tax base — will decrease future taxable
 * profit when it reverses, giving rise to a Deferred Tax Asset ONLY IF
 * recognized (see `recognized` below).
 */
export type TemporaryDifferenceClassification = 'taxable' | 'deductible';

/**
 * One temporary difference feeding a DeferredTaxComputation. An item with
 * `source: 'fixed_asset'` is auto-suggested from the real Fixed Asset Tax
 * Register (`taxRegisterService.getTaxRegister()`'s own
 * `accountingCarryingValue`/`taxWrittenDownValue`) — the one source of
 * temporary differences this codebase can compute without guessing.
 * `source: 'other'` items (a provision, an assessed tax loss, anything else)
 * are entered manually — carryingAmount/taxBase supplied directly, same
 * "auto-suggest what's real, let the user add the rest" pattern
 * `TaxComputation.adjustments` already uses.
 */
export interface DeferredTaxTemporaryDifference {
  /** Client-side/editing key only — not a persisted entity id of its own, same convention as TaxAdjustment.id. */
  id: string;
  source: TemporaryDifferenceSource;
  /** FixedAsset.id when source === 'fixed_asset'. */
  sourceId?: ID;
  description: string;
  carryingAmount: number;
  taxBase: number;
  /** carryingAmount - taxBase. Positive => taxable temporary difference. Negative => deductible temporary difference. */
  temporaryDifference: number;
  classification: TemporaryDifferenceClassification;
  /**
   * Whether a Deferred Tax Asset is actually recognized for a 'deductible'
   * item — §50's recognition criteria ("probable that future taxable
   * profit will be available"), a forward-looking judgment this system
   * cannot make on its own (no profit forecast exists anywhere in this
   * codebase). Defaults to false (the conservative "don't recognize unless
   * confirmed" default, same principle billService.splitDeductibleVat()
   * applies to unresolvable VAT). Always false for a 'taxable' item — a
   * Deferred Tax Liability is never optional.
   */
  recognized: boolean;
  /** Required when `recognized` is manually set true. */
  recognitionReason?: string;
  /** abs(temporaryDifference) * the computation's taxRatePercent — this item's own contribution to the DTL/DTA. Zero for an unrecognized deductible item. */
  deferredTaxAmount: number;
}

export type DeferredTaxComputationStatus = 'draft' | 'posted';

/**
 * One company FinancialYear's deferred tax position as of a date —
 * draft-then-post lifecycle matching every other computation in this
 * codebase (TaxComputation/PayrollRun/DepreciationService's run). Unlike
 * TaxComputation (which posts the FULL current-year liability every time),
 * `postComputation()` posts only the MOVEMENT since the prior POSTED
 * computation for this company — deferred tax is a balance-sheet position
 * that accumulates, not a fresh annual charge (§50's "movements" /
 * "reconciliation" requirement).
 */
export interface DeferredTaxComputation extends BaseEntity {
  companyId: ID;
  financialYearId: ID;
  /** Denormalized at creation time for display, e.g. "FY2026" — mirrors TaxComputation.financialYearLabel. */
  financialYearLabel: string;
  asOfDate: ISODateString;
  status: DeferredTaxComputationStatus;
  /** The flat corporate rate applied to every item (snapshot from IncomeTaxYearConfig at creation time). Deliberately NOT the SBC progressive brackets — see `deferredTaxCalculations.ts`'s doc comment for why applying one flat rate to every temporary difference is a documented simplification, not an oversight. */
  taxRatePercent: number;
  taxConfigId: ID;
  taxConfigTaxYearLabel: string;
  items: DeferredTaxTemporaryDifference[];
  /** Sum of every 'taxable' item's deferredTaxAmount. */
  totalDeferredTaxLiability: number;
  /** Sum of every RECOGNIZED 'deductible' item's deferredTaxAmount only. */
  totalDeferredTaxAsset: number;
  /** totalDeferredTaxLiability - totalDeferredTaxAsset. Positive = net liability position. */
  netDeferredTaxLiability: number;
  /** The prior POSTED computation's netDeferredTaxLiability this one was measured against — undefined if this is the company's first. */
  priorNetDeferredTaxLiability?: number;
  /** netDeferredTaxLiability - (priorNetDeferredTaxLiability ?? 0) — what postComputation() actually posts to the GL. Present once posted (or previewable beforehand via previewMovement()). */
  movementAmount?: number;
  /** Set only once postComputation() succeeds AND movementAmount is non-zero — a computation with no real movement still moves to 'posted', mirroring TaxComputation's zero-liability convention. */
  journalEntryId?: ID;
  postedAt?: ISODateString;
  postedByUserId?: ID;
}
