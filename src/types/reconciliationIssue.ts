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
