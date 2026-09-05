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
  | 'supplier_return_posted'
  // Sales fulfilment (Phase 5B) — the business abandoned a Sales Order's
  // un-invoiced remainder ("Close remaining"). Not the same as 'cancelled'
  // (which is the whole order, before any invoicing).
  | 'sales_order_closed'
  // Phase 5C — Delivery Notes (docs/DELIVERY_NOTES_DESIGN.md § "Audit").
  | 'delivery_note_created'
  | 'delivery_note_updated'
  | 'delivery_note_posted'
  | 'delivery_note_cancelled'
  // Phase 5D — Return Notes (docs/RETURN_NOTES_DESIGN.md § "Audit").
  | 'return_note_created'
  | 'return_note_updated'
  | 'return_note_posted'
  | 'return_note_cancelled'
  // Shared Import Framework (Phase 6, docs/IMPORT_EXPORT_ARCHITECTURE.md).
  // One summary row per completed import run (recordType 'ImportBatch',
  // recordId a synthetic `import_<timestamp>` — there is no single existing
  // record an import batch is "about"), in addition to whatever per-record
  // action (e.g. 'created', 'stock_import_committed') the import's own
  // create/update calls already log.
  | 'data_imported';

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
