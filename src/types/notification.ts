/**
 * Global Notifications (Administration module, Block D — migration 0073).
 *
 * A notification represents an ATTENTION-WORTHY condition — ACTION
 * REQUIRED / RISK / DEADLINE / EXCEPTION / FAILURE / SECURITY / MATERIAL
 * VARIANCE — NOT a routine accounting event. It has a condition-driven
 * lifecycle: it opens when the condition appears, stays open (same row)
 * while it persists, auto-resolves when it clears, and re-opens with a
 * higher `eventSeq` if it returns.
 */

export type NotificationSeverity = 'critical' | 'warning' | 'info';

export type NotificationStatus = 'open' | 'resolved';

export type NotificationCategory =
  | 'document_expiry'
  | 'bank_reconciliation'
  | 'subscription'
  | 'security'
  | 'deadline'
  | 'tax_deadline'
  | 'receivable_overdue'
  | 'inventory_integrity'
  | 'budget_variance'
  | 'workflow_failure';

export interface Notification {
  id: string;
  companyId: string;
  dedupeKey: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  sourceModule: string;
  title: string;
  body?: string;
  actionUrl?: string;
  sourceRecordType?: string;
  sourceRecordId?: string;
  status: NotificationStatus;
  eventSeq: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt?: string;
  metadata: Record<string, unknown>;
  /** Unread for the current user at the current `eventSeq`. */
  isUnread: boolean;
}

/** Categories a user is allowed to mute (mirror of `notification_muteable_category` in 0073). */
export const MUTEABLE_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  'inventory_integrity',
  'budget_variance',
  'receivable_overdue',
  'document_expiry',
];

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  document_expiry: 'Document expiry',
  bank_reconciliation: 'Bank reconciliation',
  subscription: 'Subscription & workspace',
  security: 'Security',
  deadline: 'Deadlines',
  tax_deadline: 'Tax deadlines',
  receivable_overdue: 'Overdue receivables',
  inventory_integrity: 'Inventory integrity',
  budget_variance: 'Budget variance',
  workflow_failure: 'Workflow failures',
};

export interface NotificationEvaluationResult {
  company: string | null;
  opened: number;
  resolved: number;
  active: number;
}
