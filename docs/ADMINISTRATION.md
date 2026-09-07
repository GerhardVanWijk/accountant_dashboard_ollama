# Administration module

The Administration section of Vertex — the pages under the sidebar's
**Administration** group plus the top-navbar notification bell.

| Page | Route | Status | Doc |
|---|---|---|---|
| Users & Roles | `/admin/users` | shipped (pre-existing) | — |
| Audit Trail | `/admin/audit-trail` | **shipped (Block C)** | `AUDIT_TRAIL.md` |
| Access Log | `/admin/audit` | **shipped (Block C)** | `ACCESS_LOG.md` |
| Documents | `/documents` | **shipped (Block B)** | `COMPANY_DOCUMENTS.md` |
| Notifications | `/notifications` + navbar bell | **shipped (Block D)** | `NOTIFICATIONS.md` |
| Settings | `/settings` | **shipped (Block E)** | — |
| Accounting Settings | `/settings/accounting` | **shipped (Block E)** | `NOTIFICATIONS.md` §E / this file |
| Plan & Billing | `/settings/subscription` | **shipped (Block E)** | `SUBSCRIPTIONS.md` |
| Help Centre | `/help` + `/help/:articleId` | **shipped (Block F)** | `HELP_CENTRE.md` |

## The three "who did what" surfaces — keep them distinct

| | **Audit Trail** | **Access Log** | **Notifications** |
|---|---|---|---|
| Question | Who *changed, posted or updated* an important record? | Who *tried to access* a protected area, and was it allowed or denied? | What does *this user* need to *act on*? |
| Table | `audit_log_entries` | `audit_logs_access` | `notifications` + `notification_reads` + `notification_mutes` |
| Nature | Append-only business-change evidence | Best-effort security/authorization checkpoints | Actionable, deduplicated, auto-resolving alerts |
| Not | a security log; a notification feed | a record of every field change | an activity feed of routine operations |

These are **not** merged. `audit_log_entries` and `audit_logs_access`
record genuinely different things and stay separate tables.

## Block delivery status

- **A — Inspection + matrices:** done. See the Phase 0 report and the
  matrices in `AUDIT_TRAIL.md` / `ACCESS_LOG.md` / `NOTIFICATIONS.md`.
- **B — Company Documents + private Storage:** **done** (migration 0071).
  See `COMPANY_DOCUMENTS.md`.
- **C — Audit Trail + Access Log:** **done** (migration 0072). Audit
  immutability triggers + query indexes + `log_access_event` RPC + widened
  access-log read. Audit Trail page: server pagination + filters + KPIs +
  before/after event detail. Access Log: `log_access_event` wired into
  `<PermissionRoute>` denials + `useLogSensitiveAccess` on the
  Administration sensitive pages; KPIs + result badges. See
  `AUDIT_TRAIL.md` / `ACCESS_LOG.md`.
- **D — Notification engine + navbar bell:** **done** (migrations `0073` +
  `0073b`). `notifications` / `notification_reads` / `notification_mutes`
  tables; `evaluate_company_notifications()` deterministic condition engine
  (9 checks over real data); `notification_feed` / `notification_unread_count`
  / `mark_notification_read` / `mark_all_notifications_read` /
  `set_notification_category_muted` RPCs; RLS with company + role +
  permission + entitlement targeting; navbar bell + `/notifications` page +
  Settings → Notifications preferences. See `NOTIFICATIONS.md`.
- **E — Settings / Accounting Settings / Plan & Billing:** **done**
  (migration `0074`). Settings gains a Notifications tab. Accounting
  Settings is a real configuration view (live company config the engine
  reads + category account mappings), not a link hub; a `companies`
  trigger audits every high-risk accounting-config change with before/after
  values. Plan & Billing shows billing interval, current period, management
  state and explicit in-plan / not-in-plan module lists — still no
  fabricated payment history/cards/invoices.
- **F — Help Centre:** **done**. 44 articles across 13 categories
  (feature guides + 14 real troubleshooting cases), ranked search over
  title/keyword/summary/body, `/help/:articleId` article pages, contextual
  `<HelpLink>` on Bank reconciliation / Journal entries / Stock operations
  / VAT / Forecasting / Users & roles / Company documents. See
  `HELP_CENTRE.md`.
- **G — Permissions + app-wide instrumentation + QA:** **done**
  (migrations `0075` + `0075b`). Adds `documents` / `notifications` /
  `settings` / `accounting_settings` / `billing` permission features + 33
  role grants + `<PermissionRoute>` gates on the five routes; `user_roles`
  and `profiles` audit triggers (role_assigned / role_unassigned /
  user_access_changed); `useLogSensitiveAccess` wired into Payroll, Income
  tax, Provisional tax, the Superuser console and Company documents.
  Cross-company isolation, the notification noise test, document-security
  and access-log final checks all verified live — see `SECURITY.md` §
  "Administration module verification".

Migrations `0073`, `0073b`, `0074`, `0075`, `0075b` applied to the live
Vertex production Supabase project (preflight → apply → rollback-wrapped
verify), same process as `0071`/`0072`. Branch:
`administration-module-2026-09-06`. `main` untouched, NOT deployed.
