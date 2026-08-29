import type { BaseEntity, ID, ISODateString } from './common';

/**
 * Every distinct class of reconciliation problem the Difference Investigator
 * (src/features/reconciliationIntelligence/) can detect. Deliberately one
 * flat union rather than a category+subtype pair — each value already reads
 * as a specific, human-explainable cause (see
 * ReconciliationIssue.explanation), matching how the detector that produced
 * it is named (src/features/reconciliationIntelligence/detectors/).
 */
export type ReconciliationIssueType =
  | 'date_offset_timing'
  | 'amount_mismatch'
  | 'transposition_error'
  | 'duplicate_transaction'
  | 'missing_bank_side'
  | 'missing_ledger_side'
  | 'grouped_match'
  | 'combination_match'
  | 'wrong_sign'
  | 'wrong_bank_account'
  | 'vat_difference'
  | 'rounding_variance'
  | 'opening_balance_discrepancy'
  | 'edited_after_reconciliation';

export type ReconciliationIssueSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/**
 * 'open': just detected, nobody has looked at it yet.
 * 'reviewed': an accountant looked at it and agrees it's real, but hasn't
 * acted on it yet (e.g. "yes this is a timing difference, leave it").
 * 'dismissed': a human decided this is not the cause — requires a reason.
 * 'resolved': the underlying cause was actually corrected through a real
 * accounting flow (see ReconciliationIssue.resolutionReason for what/how).
 */
export type ReconciliationIssueStatus = 'open' | 'reviewed' | 'dismissed' | 'resolved';

/** One machine-readable reason feeding a confidence score — never a bare number with no explanation. */
export interface ReconciliationEvidence {
  label: string;
  detail?: string;
}

/** Where a candidate explanation's other side lives (see `ReconciliationEvidenceData.candidateSourceId`). */
export type ReconciliationEvidenceCandidateSourceType =
  | 'bank_transaction'
  | 'journal_entry'
  | 'statement_line';

/**
 * One weighted factor in the confidence calculation, kept as data so the UI
 * can render "62/100 — 3 of 6 factors met" and list the unmet ones, rather
 * than only a rendered sentence.
 */
export interface ReconciliationEvidenceFactor {
  key: string;
  label: string;
  /** Points this factor actually contributed. */
  points: number;
  /** Points this factor could contribute when fully met. */
  maxPoints: number;
  met: boolean;
  /** The measured value behind the verdict, e.g. `0.16` or `"2 days"`. */
  observedValue?: string | number | boolean;
}

/**
 * Structured counterpart to the prose `ReconciliationIssue.evidence[]` — the
 * raw numbers each detector computes (amount/date deltas, similarity scores,
 * the confidence factor breakdown), kept as queryable data instead of being
 * folded into a sentence and discarded. Added by migration 0020; every field
 * is optional because nothing populates it yet — the Difference Investigator
 * rewrite (P2) is what will.
 */
export interface ReconciliationEvidenceData {
  /** Which detector produced this issue (matches the detector's own name). */
  detectorType?: string;
  /** Version of that detector's weight/logic table, so historical issues stay interpretable. */
  detectorVersion?: string;
  /** Signed difference between the two amounts, in cents. */
  amountDifferenceCents?: number;
  /** Difference between the two dates, in days. */
  dateDifferenceDays?: number;
  /** Reference-string similarity, 0–1. */
  referenceSimilarity?: number;
  sameCounterparty?: boolean;
  sameDirection?: boolean;
  sameBankAccount?: boolean;
  candidateSourceType?: ReconciliationEvidenceCandidateSourceType;
  candidateSourceId?: ID;
  /** How much of the reconciliation's unexplained variance this candidate would account for, in cents. */
  varianceExplainedCents?: number;
  factors?: ReconciliationEvidenceFactor[];
  /**
   * Additive P2.1 fields — the raw values `renderExplanation()` needs to
   * regenerate the prose explanation from data rather than a hand-written
   * sentence (docs/BANK_STATEMENT_ARCHITECTURE_AUDIT.md "do not store only a
   * vague sentence"). All optional; only the detector that computed them sets them.
   */
  /** Confidence ceiling — sum of every factor's `maxPoints`, so the UI can show "62 / 100". */
  confidenceMax?: number;
  /** Signed bank-side amount, in cents (money in positive). */
  bankAmountCents?: number;
  /** Signed books-side amount, in cents. */
  booksAmountCents?: number;
  /** The transaction description / counterparty label the two sides share. */
  counterpartyLabel?: string;
  /** Earliest date any contributing item carries (ISO yyyy-mm-dd). */
  observedDateFrom?: ISODateString;
  /** Latest date any contributing item carries. */
  observedDateTo?: ISODateString;
  /**
   * True when this issue's `effectAmount` exactly equals the reconciliation's
   * then-unexplained variance (or, for combinations, the components sum to it
   * exactly) — the strongest "this IS the cause" signal, used to sort it into
   * the investigator's `exactCauses` section.
   */
  explainsVarianceExactly?: boolean;
  /**
   * The component amounts behind a `combination_match` / `rounding_variance`
   * arithmetic string, e.g. `[{ label: 'card machine rental fee, 2026-08-08', amountCents: -9500 }]`.
   */
  combinationTerms?: { label: string; amountCents: number }[];
  /** Sum of `combinationTerms` (== the variance a combination/rounding issue explains), in cents. */
  combinationTotalCents?: number;
  /** Age of the contributing item in days as of the statement date (missing_* detectors). */
  ageDays?: number;
  /** True when `ageDays` is past the detector's stale threshold — a genuine problem, not a fresh in-transit item. */
  isStale?: boolean;
  /** For `wrong_bank_account` — the name of the other bank account the matching item was found on. */
  otherAccountName?: string;
  /** For `wrong_sign` — the reconciliation swing, double the transaction magnitude, in cents. */
  swingCents?: number;
  /** For `vat_difference` — the VAT rate the gap is consistent with. */
  vatRatePercent?: number;
  /** For `grouped_match` — the single side's amount and how many entries on the other side sum to it. */
  groupSingleCents?: number;
  groupPartCount?: number;
}

/**
 * A single, ranked, traceable explanation for some or all of a bank
 * reconciliation's unexplained difference — the core output of the
 * Difference Investigator (docs/reconciliation intelligence spec). Never
 * created to "make the variance zero" by itself: every issue is a
 * *candidate explanation*, surfaced with evidence, left for a human (or an
 * explicit resolution action that goes through a real accounting flow) to
 * confirm. IReconciliationIssueRepository is a normal mutable CRUD
 * repository (status transitions are a real lifecycle, not append-only
 * history) — every status change is additionally written to the shared
 * AuditLogService (src/services/auditLogService.ts), which is where the
 * durable audit trail actually lives, mirroring how FixedAsset/PayrollRun
 * status changes are tracked.
 */
export interface ReconciliationIssue extends BaseEntity {
  bankAccountId: ID;
  /** The statement date the investigation run that produced this issue was scoped to. */
  statementDate: ISODateString;
  issueType: ReconciliationIssueType;
  severity: ReconciliationIssueSeverity;
  /** 0-100. Always backed by `evidence` below — never a number with no stated reasons. */
  confidence: number;
  /** The Rand amount this issue explains — some or all of the reconciliation's unexplained difference. */
  effectAmount: number;
  affectedDateFrom?: ISODateString;
  affectedDateTo?: ISODateString;
  relatedBankTransactionIds: ID[];
  relatedJournalEntryIds: ID[];
  relatedSourceDocumentIds: ID[];
  /** Human-readable, e.g. "Bank fee recorded as R47.50 in the books but imported as R47.66 from the bank." */
  explanation: string;
  evidence: ReconciliationEvidence[];
  /**
   * Structured evidence backing `evidence[]` above — see
   * `ReconciliationEvidenceData`. Optional: unset on every issue created
   * before the P2 investigator rewrite.
   */
  evidenceData?: ReconciliationEvidenceData;
  /**
   * Deterministic idempotency key (`detectorType` + sorted related ids +
   * `statementDate::date`) used to supersede a prior run's issue instead of
   * piling up duplicates. Optional until P2 populates it.
   */
  dedupeKey?: string;
  /** Human-readable next step, e.g. "Correct the bank charge allocation" — never an instruction to silently plug the difference. */
  suggestedResolution: string;
  /**
   * True only for issue types where a resolution action exists that goes
   * through a real, already-audited accounting flow with no risk of
   * silently rewriting posted history (e.g. marking a genuine timing
   * difference as expected). False for anything that would require
   * judgment a human must make (amount mismatches, wrong-sign entries,
   * VAT differences) — never a shortcut to auto-zero a variance.
   */
  autoResolutionSafe: boolean;
  status: ReconciliationIssueStatus;
  resolutionActorUserId?: ID;
  resolutionDate?: ISODateString;
  /** Required when status is 'dismissed' or 'resolved' — why, not just that it changed. */
  resolutionReason?: string;
}
