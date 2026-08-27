/**
 * Single source of truth for how a status reads across the app.
 *
 * Every status string used by the data layer maps to one of four tones, so the
 * same state always looks the same whichever module renders it.
 *
 * Ported verbatim from accounting-v0-frontend/components/app/status-badge.tsx,
 * with one deliberate deviation from a literal copy: v0's own class names
 * (bg-positive/15, text-warning, etc.) are bare Tailwind keys that in v0's
 * own project resolve to its oklch design tokens. In THIS app those exact
 * bare names were already claimed, before the v0 port, by an unrelated
 * pre-existing color system (financial P&L RGB-triplet colors for
 * positive/negative, general pastel UI accents for warning/info) —
 * tailwind.config.js's own "v0's general-status colors" comment documents
 * this collision and exposes v0's actual tokens under a separate status-*
 * namespace specifically to avoid it. Every tone below uses that
 * namespace, so a status badge here renders the same colors v0 designed
 * for it — not the older, unrelated ones the bare names collide with.
 */

import { Badge } from '@/components/ui/shadcn/badge';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'positive' | 'warning' | 'critical' | 'info';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  positive: 'bg-status-positive/15 text-status-positive',
  warning: 'bg-status-warning/15 text-status-warning',
  critical: 'bg-status-negative/15 text-status-negative',
  info: 'bg-status-info/15 text-status-info',
};

/** Maps every status value in the data layer to a tone and a display label. */
const statusMap: Record<string, { tone: Tone; label: string }> = {
  /* Documents and transactions */
  draft: { tone: 'neutral', label: 'Draft' },
  sent: { tone: 'info', label: 'Sent' },
  viewed: { tone: 'info', label: 'Viewed' },
  paid: { tone: 'positive', label: 'Paid' },
  'partially-paid': { tone: 'warning', label: 'Part paid' },
  /** Real Invoice/CreditNote statuses (src/types/invoice.ts,
   * src/types/creditNote.ts) use underscores, not v0's own hyphenated
   * mock set — both spellings are kept so this stays a drop-in for either. */
  partially_paid: { tone: 'warning', label: 'Part paid' },
  /** Real BillStatus (src/types/bill.ts) — not part of v0's own status set (M8). */
  awaiting_payment: { tone: 'info', label: 'Awaiting payment' },
  /** Real PurchaseOrderStatus (src/types/purchaseOrder.ts) — not part of v0's own status set (M8). */
  partially_received: { tone: 'warning', label: 'Partially received' },
  received: { tone: 'positive', label: 'Received' },
  overdue: { tone: 'critical', label: 'Overdue' },
  disputed: { tone: 'critical', label: 'Disputed' },
  'written-off': { tone: 'neutral', label: 'Written off' },
  issued: { tone: 'info', label: 'Issued' },
  applied: { tone: 'positive', label: 'Applied' },
  /** Real CreditNote status once its full value has been applied to invoice(s) — v0's own set calls this "applied" instead. */
  allocated: { tone: 'positive', label: 'Allocated' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
  /** Real Invoice/CreditNote terminal status — v0's own set uses "cancelled" instead. */
  void: { tone: 'neutral', label: 'Void' },

  /* Payments */
  cleared: { tone: 'positive', label: 'Cleared' },
  pending: { tone: 'warning', label: 'Pending' },
  unallocated: { tone: 'warning', label: 'Unallocated' },
  /** Derived, presentation-only state for a CustomerReceipt — the real
   * domain (src/types/customerReceipt.ts) has no status field at all, only
   * `unallocatedAmount`; the UI compares it to `amount` to pick one of
   * these three labels rather than inventing a stored status. */
  'partially-allocated': { tone: 'warning', label: 'Partially allocated' },
  reversed: { tone: 'neutral', label: 'Reversed' },

  /* Journals */
  posted: { tone: 'positive', label: 'Posted' },
  'awaiting-review': { tone: 'warning', label: 'Awaiting review' },

  /* Expenses */
  'awaiting-approval': { tone: 'warning', label: 'Awaiting approval' },
  approved: { tone: 'positive', label: 'Approved' },
  rejected: { tone: 'critical', label: 'Rejected' },

  /* Reconciliation */
  matched: { tone: 'positive', label: 'Matched' },
  unmatched: { tone: 'critical', label: 'Unmatched' },
  'needs-review': { tone: 'warning', label: 'Needs review' },
  balanced: { tone: 'positive', label: 'Balanced' },
  'in-progress': { tone: 'warning', label: 'In progress' },
  'not-started': { tone: 'neutral', label: 'Not started' },
  /** Real BankTransactionStatus (src/types/bankTransaction.ts) — v0's own
   * set only has matched/unmatched/needs-review; the real domain's third
   * state is "cleared by a finalized BankReconciliation", not v0's
   * "needs-review". */
  unreconciled: { tone: 'neutral', label: 'Unreconciled' },
  reconciled: { tone: 'positive', label: 'Reconciled' },

  /* Parties, users, companies */
  active: { tone: 'positive', label: 'Active' },
  'on-hold': { tone: 'warning', label: 'On hold' },
  inactive: { tone: 'neutral', label: 'Inactive' },
  dormant: { tone: 'neutral', label: 'Dormant' },
  /** Real EmployeeStatus (src/types/employee.ts) — v0's own party status set has no equivalent (M13). */
  terminated: { tone: 'critical', label: 'Terminated' },
  archived: { tone: 'neutral', label: 'Archived' },
  invited: { tone: 'info', label: 'Invited' },
  suspended: { tone: 'critical', label: 'Suspended' },

  /* Assets and inventory */
  'in-use': { tone: 'positive', label: 'In use' },
  'in-storage': { tone: 'neutral', label: 'In storage' },
  'under-repair': { tone: 'warning', label: 'Under repair' },
  disposed: { tone: 'neutral', label: 'Disposed' },
  /** Real FixedAssetStatus (src/types/fixedAsset.ts) — v0's own asset status set has no equivalent to "fully depreciated but still on the register" (M8). */
  fully_depreciated: { tone: 'warning', label: 'Fully depreciated' },
  'in-stock': { tone: 'positive', label: 'In stock' },
  'low-stock': { tone: 'warning', label: 'Low stock' },
  'out-of-stock': { tone: 'critical', label: 'Out of stock' },
  discontinued: { tone: 'neutral', label: 'Discontinued' },

  /* Tax and compliance */
  open: { tone: 'info', label: 'Open' },
  submitted: { tone: 'positive', label: 'Submitted' },
  filed: { tone: 'positive', label: 'Filed' },
  assessed: { tone: 'positive', label: 'Assessed' },
  compliant: { tone: 'positive', label: 'Compliant' },
  'due-soon': { tone: 'warning', label: 'Due soon' },
  complete: { tone: 'positive', label: 'Complete' },
  /** Real DividendDeclarationStatus (src/types/dividendsTax.ts) — v0's own set has no dividends-tax lifecycle at all. `paid` and `draft` above are already the right tone/label for this status set too. */
  declared: { tone: 'info', label: 'Declared' },
  remitted: { tone: 'positive', label: 'Remitted' },

  /* Periods */
  current: { tone: 'info', label: 'Current' },
  closed: { tone: 'neutral', label: 'Closed' },
  locked: { tone: 'neutral', label: 'Locked' },
  /** Real AccountingPeriodStatus (src/types/accountingPeriod.ts) — not part
   * of v0's own status set, which only has current/open/closed/locked. */
  soft_closed: { tone: 'warning', label: 'Soft closed' },

  /* Documents */
  processed: { tone: 'positive', label: 'Processed' },
  'pending-review': { tone: 'warning', label: 'Pending review' },

  /* Sales: Quotes and Sales Orders (M13) — `draft`/`sent`/`cancelled` above
   * already cover the statuses these share with Invoices; `pending` above
   * already covers QuoteStatus's SalesOrder counterpart. */
  accepted: { tone: 'positive', label: 'Accepted' },
  declined: { tone: 'critical', label: 'Declined' },
  expired: { tone: 'neutral', label: 'Expired' },
  confirmed: { tone: 'info', label: 'Confirmed' },
  fulfilled: { tone: 'positive', label: 'Fulfilled' },
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const entry = statusMap[status] ?? { tone: 'neutral' as Tone, label: status };

  return (
    <Badge className={cn(toneClass[entry.tone], className)}>{entry.label}</Badge>
  );
}
