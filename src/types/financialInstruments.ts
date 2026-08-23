import type { BaseEntity, ID, ISODateString } from './common';

/**
 * IFRS 9 / Financial Instruments (SA_ACCOUNTING_MASTER_SPEC.md §46, §116
 * Phase 12 "Advanced Accounting"). This codebase only models one financial
 * instrument concretely — trade receivables (Accounts Receivable) — so this
 * is scoped to the simplified "provision matrix" approach IFRS 9 explicitly
 * permits for trade receivables with no significant financing component:
 * group receivables by how overdue they are, apply an expected loss rate
 * per group. Loans/investments/other financial assets are NOT modeled
 * anywhere in this codebase (no such module exists) — not attempted here.
 */

/** Matches the aging-bucket convention every other aging view in this codebase already uses (Customer/Supplier Aging Reports, `AgingBuckets`). */
export type AgingBucketKey = 'current' | 'days30' | 'days60' | 'days90Plus';

/**
 * One aging bucket's contribution to an ExpectedCreditLossComputation.
 * `grossReceivable` is computed automatically from real posted Invoice data
 * (the same Customer Aging Report calculation every other aging view uses —
 * never re-derived a second way). `lossRatePercent` is ALWAYS a manual
 * input — this codebase has no historical default-rate data to derive it
 * from, and guessing one would violate §110 ("no unsupported claims").
 * Defaults to 0% (no loss assumed until the accountant enters a rate), the
 * conservative "don't recognize what hasn't been confirmed" default this
 * codebase already applies to Deferred Tax Asset recognition and SBC
 * eligibility.
 */
export interface EclBucketLine {
  bucket: AgingBucketKey;
  grossReceivable: number;
  lossRatePercent: number;
  /** grossReceivable * lossRatePercent / 100. */
  expectedCreditLoss: number;
}

export type EclComputationStatus = 'draft' | 'posted';

/**
 * One company FinancialYear's Expected Credit Loss provision on trade
 * receivables, as of the financial year end — draft-then-post lifecycle
 * matching every other Phase 9/12 computation in this codebase
 * (TaxComputation/DeferredTaxComputation). `postComputation()` posts only
 * the MOVEMENT since the prior POSTED computation for this company (the
 * provision is a balance-sheet position that accumulates, exactly the same
 * shape as DeferredTaxComputation's movement-only posting) — never the
 * full provision balance again.
 */
export interface EclComputation extends BaseEntity {
  companyId: ID;
  financialYearId: ID;
  /** Denormalized at creation time for display, e.g. "FY2026". */
  financialYearLabel: string;
  asOfDate: ISODateString;
  status: EclComputationStatus;
  buckets: EclBucketLine[];
  totalGrossReceivable: number;
  totalExpectedCreditLoss: number;
  /** The prior POSTED computation's totalExpectedCreditLoss this one was measured against — undefined if this is the company's first. */
  priorTotalExpectedCreditLoss?: number;
  /** totalExpectedCreditLoss - (priorTotalExpectedCreditLoss ?? 0) — what postComputation() actually posts to the GL. */
  movementAmount?: number;
  /** Set only once postComputation() succeeds AND movementAmount is non-zero — mirrors DeferredTaxComputation's "undefined means nothing was posted" convention. */
  journalEntryId?: ID;
  postedAt?: ISODateString;
  postedByUserId?: ID;
}
