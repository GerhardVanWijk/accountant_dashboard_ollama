import type { AuditLogEntry, Profile } from '@/types';

/** Human labels for `AuditLogEntry.action`. Unknown actions fall back to the raw string. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  created: 'Created',
  edited: 'Edited',
  posted: 'Posted',
  approved: 'Approved',
  reversed: 'Reversed',
  cancelled: 'Cancelled',
  deleted: 'Deleted',
  period_closed: 'Period closed',
  period_reopened: 'Period reopened',
  financial_year_closed: 'Financial year closed',
  reporting_framework_changed: 'Reporting framework changed',
  bank_reconciled: 'Bank reconciled',
  tax_return_prepared: 'Tax return prepared',
  tax_return_finalised: 'Tax return finalised',
  tax_rate_superseded: 'Tax rate superseded',
  permission_changed: 'Permission changed',
  public_interest_score_calculated: 'Public interest score calculated',
  reconciliation_issue_reviewed: 'Reconciliation issue reviewed',
  reconciliation_issue_dismissed: 'Reconciliation issue dismissed',
  reconciliation_issue_resolved: 'Reconciliation issue resolved',
  stock_adjusted: 'Stock adjusted',
  stock_written_off: 'Stock written off',
  stock_take_posted: 'Stock take posted',
  opening_stock_set: 'Opening stock set',
  cost_price_changed: 'Cost price changed',
  inventory_account_mapping_changed: 'Inventory account mapping changed',
  stock_import_committed: 'Stock import committed',
  supplier_return_posted: 'Supplier return posted',
  sales_order_closed: 'Sales order closed',
  delivery_note_created: 'Delivery note created',
  delivery_note_updated: 'Delivery note updated',
  delivery_note_posted: 'Delivery note posted',
  delivery_note_cancelled: 'Delivery note cancelled',
  return_note_created: 'Return note created',
  return_note_updated: 'Return note updated',
  return_note_posted: 'Return note posted',
  return_note_cancelled: 'Return note cancelled',
  data_imported: 'Data imported',
  document_uploaded: 'Document uploaded',
  document_archived: 'Document archived',
  document_restored: 'Document restored',
  document_metadata_changed: 'Document details changed',
  document_deleted: 'Document deleted',
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

/** Modules that write to the audit trail, for the filter dropdown. */
export const AUDIT_MODULES: readonly string[] = [
  'accounting',
  'sales',
  'purchasing',
  'purchases',
  'banking',
  'inventory',
  'assets',
  'payroll',
  'tax',
  'compliance',
  'reconciliationIntelligence',
  'documents',
  'subscriptions',
  'admin',
];

export function auditModuleLabel(module: string): string {
  if (module === 'reconciliationIntelligence') return 'Reconciliation';
  if (module === 'admin') return 'Users & security';
  return module.charAt(0).toUpperCase() + module.slice(1);
}

/** "Financial posting" actions — one of the quick filters. */
export const FINANCIAL_POSTING_ACTIONS = new Set([
  'posted',
  'bank_reconciled',
  'stock_take_posted',
  'supplier_return_posted',
  'delivery_note_posted',
  'return_note_posted',
  'tax_return_finalised',
  'period_closed',
  'financial_year_closed',
]);

export const REVERSAL_ACTIONS = new Set(['reversed', 'cancelled', 'delivery_note_cancelled', 'return_note_cancelled']);

/** A short, human summary of what an entry recorded — never a fabricated narrative. */
export function describeAuditEntry(entry: AuditLogEntry): string {
  if (entry.reason) return entry.reason;
  const after = entry.newValue && typeof entry.newValue === 'object' ? Object.keys(entry.newValue as object) : [];
  if (after.length > 0) return `Changed ${after.join(', ')}`;
  return `${entry.recordType} ${entry.recordId}`;
}

/** Only record types with a real deep-linkable detail view (grepped, not guessed). */
const RECORD_TYPE_ROUTES: Record<string, string> = {
  JournalEntry: '/accounting/journals',
};

export function resolveAuditRecordLink(recordType: string, recordId: string): string | null {
  const base = RECORD_TYPE_ROUTES[recordType];
  if (!base || !recordId) return null;
  return `${base}?record=${recordId}`;
}

export function auditActorName(userId: string, profilesById: Map<string, Profile>): string {
  if (userId === 'system') return 'System';
  const profile = profilesById.get(userId);
  if (!profile) return userId;
  return [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email || userId;
}
