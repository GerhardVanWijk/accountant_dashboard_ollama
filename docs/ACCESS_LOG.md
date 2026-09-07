# Access Log

**Route:** `/admin/audit` · **Nav:** Administration → Access Log
**Table:** `public.audit_logs_access` · **Migration:** `0072_audit_access_log_hardening`
**Permission:** `audit:read`; RLS SELECT = admin / accountant / manager (own company) or superuser

> Review **security-sensitive access and denied permission attempts**
> across your workspace.

Distinct from the Audit Trail (`audit_log_entries`, `/admin/audit-trail`,
"who changed a record"). The two are **not** merged.

| `audit_logs_access` answers | |
|---|---|
| Who tried to access something? | `actor_id` |
| What did they attempt? | `action` (`view` / `access_denied` / `suspended_access_attempt`) |
| Which protected area? | `table_name` (repurposed as the area/resource label) |
| Was it allowed or denied, and why? | `result` + `detail` |
| Which company context? | `company_id` |
| When? | `occurred_at` |

`result` ∈ `allowed` · `denied_permission` · `denied_rls`.

## How rows are written

One controlled path: the **`log_access_event(p_action, p_area, p_result,
p_detail, p_dedupe_window)`** SECURITY DEFINER RPC (migration 0072).

- Actor and company are derived **server-side** from the session — a
  client cannot forge them.
- **De-duplicated server-side**: the same actor hitting the same area with
  the same result inside the dedupe window is one row, not many. A page
  refresh or a component re-mount never adds a second row.

### Call sites

| Trigger | Helper | Window |
|---|---|---|
| A blocked `<PermissionRoute>` renders Access Denied | `auditLogAccessService.logDenied(area, { feature })` → `denied_permission` | 60 min |
| A user opens a security-sensitive page | `useLogSensitiveAccess(area)` → `logSensitiveView` → `allowed` | 24 h |

**Sensitive areas wired in Block C:** User management, Audit trail, Access
log, Accounting settings, Plan & billing. Payroll / Tax / Superuser console
and the rest are wired in **Block G** (`useLogSensitiveAccess` is the only
hook needed per page).

### What is deliberately NOT logged

Ordinary page reads and routine navigation. The brief is explicit: this is
not a navigation firehose. Only denied access + entry into sensitive areas
+ suspended-workspace attempts.

## Immutability

Same as the Audit Trail — a `BEFORE UPDATE OR DELETE` trigger
(`reject_audit_mutation`) makes `audit_logs_access` hard append-only.

## The page

- **KPI cards** (last 7 days): Denied attempts · Permission denials ·
  Sensitive-area access · Active users.
- **Table** (`AccessLogTable`): time, user, action, area/resource, result
  badge, reason. Row-expand shows the captured `detail` payload (never a
  sensitive value — `detail` only carries the feature key + action).
- **Filters:** area, result (`Allowed` / `Denied (any)` / `Permission
  denied` / `Blocked by policy`), plus free-text search.
- Server fetch is capped at 500 rows, newest first
  (`audit_logs_access_company_occurred_idx`).

## Best-effort scope

RLS denials in Postgres return zero rows silently — there is no
client-visible error to catch — so `denied_rls` rows are only ever written
at explicit app-level checkpoints, never as proof every actual denial was
captured. See `src/types/accessAudit.ts`.

## Sensitive-area instrumentation (Block G)

`useLogSensitiveAccess(area)` writes one `allowed` row when a genuinely
sensitive page mounts — server-deduped to one row per user per area per
24 h by `log_access_event`. Wired into:

Users & roles · Audit trail · Access log · Accounting settings · Plan &
billing · Notifications · Company documents · Payroll (Employees / Runs /
EMP201 / EMP501) · Income tax · Provisional tax · the Superuser console
(one entry per session).

Ordinary module pages (Sales, Purchasing, Banking, Inventory, GL, Reports,
Dashboard…) are **not** instrumented — the log stays useful.

`<PermissionRoute>` writes one `denied_permission` row (server-deduped to
one per user per area per hour) when a user hits a route their fine-grained
role lacks. Block G added gates on `/documents`, `/notifications`,
`/settings`, `/settings/accounting`, `/settings/subscription`, so a role
without the matching feature now produces a denied row instead of silently
seeing the page.

**Verified live:** a spike of ≥5 denied events for a company in 24 h also
raises a `security` notification (see `NOTIFICATIONS.md` C4).
