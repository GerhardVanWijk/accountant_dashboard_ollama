import type { BaseEntity, ID, ISODateString } from './common';

/**
 * docs/SA_ACCOUNTING_MASTER_SPEC.md §35/§68. 'open': normal users can post.
 * 'soft_closed'/'closed'/'locked': normal users cannot — this codebase does
 * not yet model a real permissions/role system (docs/SA_SPEC_GAP_ANALYSIS.md),
 * so today ALL non-'open' statuses block JournalEntryService.postJournalEntry()
 * equally; the spec's distinction between who may post into a soft-closed
 * period vs. a fully closed one is a permissions-layer refinement for when
 * real roles/approvals (§38/§39) exist, not implemented here.
 */
export type AccountingPeriodStatus = 'open' | 'soft_closed' | 'closed' | 'locked';

/**
 * A single accounting period (typically one calendar month) within a
 * FinancialYear. JournalEntryService.postJournalEntry() looks up the period
 * containing the entry's date and refuses to post unless status is 'open'
 * (docs/LEDGER_ARCHITECTURE.md). Reopening a closed/locked period is done via
 * AccountingPeriodService.reopenPeriod(), which requires a reason and writes
 * an AuditLogEntry — never a silent status flip.
 */
export interface AccountingPeriod extends BaseEntity {
  companyId: ID;
  financialYearId: ID;
  /** e.g. "2026-08". */
  name: string;
  startDate: ISODateString;
  endDate: ISODateString;
  status: AccountingPeriodStatus;
}
