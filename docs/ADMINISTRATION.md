# Administration module

The Administration section of Vertex — the pages under the sidebar's
**Administration** group plus the top-navbar notification bell.

| Page | Route | Status | Doc |
|---|---|---|---|
| Users & Roles | `/admin/users` | shipped (pre-existing) | — |
| Audit Trail | `/admin/audit-trail` | **shipped (Block C)** | `AUDIT_TRAIL.md` |
| Access Log | `/admin/audit` | **shipped (Block C)** | `ACCESS_LOG.md` |
| Documents | `/documents` | **shipped (Block B)** | `COMPANY_DOCUMENTS.md` |
| Notifications | `/notifications` + navbar bell | Block D | `NOTIFICATIONS.md` |
| Settings | `/settings` | Block E | — |
| Accounting Settings | `/settings/accounting` | Block E | — |
| Plan & Billing | `/settings/subscription` | Block E | `SUBSCRIPTIONS.md` |
| Help Centre | `/help` | Block F | `HELP_CENTRE.md` |

## The three "who did what" surfaces — keep them distinct

| | **Audit Trail** | **Access Log** | **Notifications** |
|---|---|---|---|
| Question | Who *changed, posted or updated* an important record? | Who *tried to access* a protected area, and was it allowed or denied? | What does *this user* need to *act on*? |
| Table | `audit_log_entries` | `audit_logs_access` | `notifications` + `user_notification_state` |
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
- **D — Notification engine + navbar bell:** pending.
- **E — Settings / Accounting Settings / Plan & Billing:** pending.
- **F — Help Centre:** pending.
- **G — Permissions + app-wide audit/notification instrumentation + QA:**
  pending. Migration `0074` adds `documents` / `notifications` /
  `settings` / `accounting_settings` / `billing` permission features.

Branch: `administration-module-2026-09-06`. `main` untouched.
