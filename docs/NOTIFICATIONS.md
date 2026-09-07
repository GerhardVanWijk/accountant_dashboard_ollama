# Notifications (Administration module — Block D)

Migrations `0073_notifications` + `0073b_notifications_engine_reentrancy`.
Branch `administration-module-2026-09-06`. Applied to the live Vertex
production Supabase project; `main` untouched.

## What a notification is — and is not

A notification represents an **attention-worthy condition** in the
workspace:

> ACTION REQUIRED · RISK · DEADLINE · EXCEPTION · FAILURE · SECURITY ·
> MATERIAL VARIANCE

It is **NOT an accounting activity feed**. Routine bookkeeping — a bank
transaction, an invoice, a receipt, a journal posting, a stock movement, a
successful login, ordinary CRUD — never creates a notification. That
activity belongs in its own module and, where it matters, in the **Audit
trail** (`audit_log_entries`).

## Lifecycle — condition-driven, not event-driven

Every condition has a **stable `dedupe_key`**, unique per
`(company_id, dedupe_key)`:

| Transition | Effect |
|---|---|
| condition appears | a row **opens** (`status = 'open'`, `event_seq = 1`) |
| condition persists | the **same row** stays open; only `last_seen_at` moves. A page refresh or a re-evaluation never adds a duplicate. |
| condition clears | the row **auto-resolves** (`status = 'resolved'`, `resolution = 'condition_cleared'`) on the next evaluation |
| condition returns later | the row **re-opens** with `event_seq + 1` — a fresh lifecycle. A user who had read `event_seq` 1 sees it as unread again. |

`mark_notification_read` only clears the unread dot for one user at the
current `event_seq`. It does **not** resolve the condition — only the
engine does that, for everyone, when the condition itself is gone.

## The engine — `evaluate_company_notifications(p_company_id uuid default null)`

`SECURITY DEFINER`, `authenticated`-executable. With no argument it runs for
`get_my_company_id()`; a `p_company_id` argument is superuser-only (for a
future scheduled sweep). It builds the set of currently-active conditions,
upserts them, and auto-resolves any open notification whose `dedupe_key` is
not in that set. It **invents nothing** — a check with no qualifying rows
produces no notification.

The frontend calls it at most once per browser per **5 minutes**
(`NotificationService.evaluateIfDue`, localStorage-throttled), on the
notification bell mount and the Notifications page. Each check is a handful
of aggregate queries.

## Eligibility matrix

### Conditions that DO raise a notification

| # | `dedupe_key` prefix | Category | Source | Severity | Derived from |
|---|---|---|---|---|---|
| C1 | `document_expiry:<id>` | `document_expiry` | documents | `warning` ≤30d / `critical` past | `company_documents.expiry_date`, not archived |
| C2 | `bank_reconciliation:<company>` | `bank_reconciliation` | banking | `warning` / `critical` (any high/critical issue or ≥ R10 000 net) | `reconciliation_issues` `status='open'`, severity ≥ medium or |effect| ≥ R1 000 (aggregate) |
| C3 | `subscription_status:<company>` | `subscription` | subscription | `warning` (`past_due`) / `critical` (suspended/expired/cancelled/workspace suspended) | `subscriptions.status`, `companies.suspended_at` |
| C4 | `access_denied_spike:<company>:<utc-date>` | `security` | admin | `warning` (≥5) / `critical` (≥20) | `audit_logs_access` denied events in 24h |
| C5 | `period_open_overdue:<id>` | `deadline` | accounting | `warning` | `accounting_periods` `status='open'` and `end_date < today − 45` |
| C6 | `receivables_overdue:<company>` | `receivable_overdue` | sales | `warning` / `critical` (≥ R100 000 or ≥10 invoices) | `invoices` sent/partially_paid/overdue, `due_date < now − 60d`, outstanding > 0 (aggregate) |
| C7 | `inventory_negative_stock:<company>` | `inventory_integrity` | inventory | `critical` | `stock_balances.quantity_on_hand < 0` (aggregate) |
| C8 | `inventory_reorder:<company>` | `inventory_integrity` | inventory | `warning` | `products` tracked + active, `reorder_level > 0`, on-hand ≤ reorder (aggregate) |
| C9 | `budget_variance:<company>:<yyyy-mm>` | `budget_variance` | forecasting | `warning` | `financial_plan_lines` `plan_type='budget'` for the current month vs posted GL net movement, |actual − budget| ≥ max(R5 000, 15%). **Dormant until budgets are captured.** |

Targeting:
- **C2, C7, C8** require the `inventory` / `banking` plan entitlement.
- **C2, C5, C6, C9** are shown to admin / accountant / manager (C5 also
  needs `financial_periods:manage`).
- **C3, C4** are shown to admins only.
- **C1, C7, C8** are shown to every member of the company.

### Events that are explicitly **NO NOTIFICATION**

| Event | Where it lives instead |
|---|---|
| A normal bank transaction / statement import | Banking module; Audit trail if allocated |
| A normal invoice / credit note / customer receipt | Sales module; Audit trail (`posted`) |
| A normal supplier bill / payment | Purchasing module; Audit trail |
| A normal journal posting | GL; Audit trail (`posted`) |
| A normal stock movement (sale, receipt, transfer) | Inventory module; Audit trail |
| A successful login | Not recorded as a notification anywhere |
| Ordinary CRUD on a master record (customer, product…) | The module; Audit trail where the record is important |
| A financial period being closed / reopened on time | Audit trail (`period_closed` / `period_reopened`) |
| A VAT return prepared / finalised | Tax module; Audit trail |
| A single reconciliation issue below the materiality bar | Bank reconciliation review screen |

**Verified live (2026-09-07, rollback-wrapped):** inserting a normal posted
journal entry and a normal bank transaction for a company and running the
engine → `opened: 0, resolved: 0`. Inserting a company document with a past
`expiry_date` → one `critical` `document_expiry` notification opened.

## Tables

- **`notifications`** — one row per `(company_id, dedupe_key)`. No client
  write policy at all; only the engine (SECURITY DEFINER) writes. One
  SELECT-only RLS policy: `notification_visible(company_id, target_roles,
  target_permission, target_entitlement)` enforces company + role +
  fine-grained-permission + plan-entitlement targeting.
- **`notification_reads`** — `(notification_id, user_id, read_event_seq)`.
  A notification is unread for a user when no read row has
  `read_event_seq >= notifications.event_seq`.
- **`notification_mutes`** — `(user_id, category)`. Only the four
  non-critical categories may be muted (`notification_muteable_category`):
  `inventory_integrity`, `budget_variance`, `receivable_overdue`,
  `document_expiry`. A `critical`-severity item is shown even in a muted
  category. Security, subscription, bank-reconciliation and tax-deadline
  categories cannot be muted.

## RPCs (all `SECURITY DEFINER`, `authenticated` only, `anon` revoked)

| RPC | Purpose |
|---|---|
| `evaluate_company_notifications(uuid default null)` | run the engine |
| `notification_feed(p_include_resolved bool, p_limit int)` | visible, targeting- and mute-filtered feed + `is_unread` |
| `notification_unread_count()` | attention-worthy unread count for the bell badge |
| `mark_notification_read(uuid)` | one item, this user, current `event_seq` (no-op cross-company) |
| `mark_all_notifications_read()` | all visible open items for this user |
| `set_notification_category_muted(text, bool)` | mute/unmute a non-critical category (rejects the rest) |

## UI

- **Navbar bell** (`src/components/app/notification-menu.tsx`) — the single
  bell in the app, mounted once in `AppTopbar`. Unread attention count (red
  when a critical item is unread, otherwise brand-coloured; `9+` cap).
  Popover: highest-priority first, title, short description, severity,
  relative time, "open related item", "mark read", "mark all read", "view
  all". No flashing or pulsing.
- **`/notifications`** — full page: open/unread/critical counts, category
  filter, open ↔ resolved toggle, mark-all-read, `useLogSensitiveAccess`.
- **Settings → Notifications** — mute the four non-critical categories.

## Cross-company isolation (verified live)

Company B's admin sees zero of company A's notifications and zero of A's
`notification_reads`; `mark_notification_read` on one of A's notifications
writes nothing (the `notification_visible` check fails → the RPC returns
early).
