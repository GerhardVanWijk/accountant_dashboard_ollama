import type { BaseEntity, ID } from './common';

/**
 * docs/SA_ACCOUNTING_MASTER_SPEC.md §37. Not exhaustive of every possible
 * future action — extend as real workflows (approvals, bank reconciliation,
 * tax return preparation) get built.
 */
export type AuditAction =
  | 'created'
  | 'edited'
  | 'posted'
  | 'approved'
  | 'reversed'
  | 'cancelled'
  | 'deleted'
  | 'period_closed'
  | 'period_reopened'
  | 'financial_year_closed'
  | 'reporting_framework_changed'
  | 'bank_reconciled'
  | 'tax_return_prepared'
  | 'tax_return_finalised'
  | 'tax_rate_superseded'
  | 'permission_changed'
  | 'public_interest_score_calculated'
  | 'reconciliation_issue_reviewed'
  | 'reconciliation_issue_dismissed'
  | 'reconciliation_issue_resolved'
  // Inventory Accounting Module (docs/INVENTORY_ACCOUNTING.md § Audit).
  | 'stock_adjusted'
  | 'stock_written_off'
  | 'stock_take_posted'
  | 'opening_stock_set'
  | 'cost_price_changed'
  | 'inventory_account_mapping_changed'
  | 'stock_import_committed'
  | 'supplier_return_posted';

/**
 * One append-only audit log row. `userId` is supplied by the caller — this
 * codebase does not yet have a real authenticated-user session
 * (src/stores/authStore.ts is a boolean stub), so callers pass whatever
 * actor identity they have; there is no automatic "current user" lookup to
 * fall back to yet (docs/SA_SPEC_GAP_ANALYSIS.md). IP/session metadata
 * (§37) is not captured for the same reason — this is a browser SPA with no
 * server-side session today.
 */
export interface AuditLogEntry extends BaseEntity {
  userId: ID;
  action: AuditAction;
  /** e.g. "accounting", "sales", "admin". */
  module: string;
  /** e.g. "JournalEntry", "AccountingPeriod", "Company". */
  recordType: string;
  recordId: ID;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
}
