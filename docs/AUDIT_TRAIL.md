# Audit Trail

**Route:** `/admin/audit-trail` · **Nav:** Administration → Audit Trail
**Table:** `public.audit_log_entries` · **Migration:** `0072_audit_access_log_hardening`
**Permission:** `audit:read` (accountant / finance_manager / admin / superuser)

> A complete history of important **changes and accounting actions** — who
> changed, posted or updated what across the workspace.

This is **not** the Access Log. The Access Log (`audit_logs_access`,
`/admin/audit`) answers a different question — *who tried to reach a
protected area, and was it allowed or denied.* The two tables are not
merged. See the comparison table in `ADMINISTRATION.md`.

## Immutability

`audit_log_entries` is **append-only evidence**. Migration 0072 adds a
`BEFORE UPDATE OR DELETE` trigger (`reject_audit_mutation`) that raises
`42501` on *any* attempt to modify or delete a row — belt-and-braces over
the existing "no UPDATE/DELETE policy → denied" RLS default. Even a company
admin cannot rewrite history. Retention/purge, if ever required, is a
deliberate future migration run as the table owner, never an app action.

The `IAuditLogRepository` interface has no `update`/`delete` method at all —
editing a log entry is impossible for any caller by construction.

## What a row records

| field | |
|---|---|
| `user_id` | actor (`text` — accepts the `system` sentinel and Mock ids; see repo doc comment) |
| `module` | `accounting`, `sales`, `purchasing`, `banking`, `inventory`, `assets`, `payroll`, `tax`, `compliance`, `documents`, `admin`, … |
| `action` | `created` / `posted` / `reversed` / `permission_changed` / `document_uploaded` / … (`AuditAction`, non-exhaustive) |
| `record_type` + `record_id` | e.g. `JournalEntry` / a uuid — human-readable type shown, raw id in the detail panel |
| `previous_value` / `new_value` | jsonb before/after for meaningful mutable changes |
| `reason` | mandatory on the highest-risk overrides (reporting framework, SBC, tax-rate supersede) |
| `created_at` | server timestamp |

**Never captured:** passwords, auth tokens, invitation secrets, card
details. Redaction of sensitive payloads is the writer's responsibility
(e.g. supplier bank-detail changes record *that* details changed, not the
full account number).

## The page

- **KPI cards** (last 30 days, 4 count-only queries via
  `auditLogService.getKpis()`): Events · Financial postings · Security &
  admin · Reversals & corrections.
- **Server-side pagination** — `auditLogService.getPage({ page, pageSize:
  25, … })` → `{ rows, total }`. The browser never holds more than one
  page. Backed by the `(company_id, created_at desc)` /
  `(company_id, module)` / `(company_id, user_id)` indexes from 0072.
- **Filters** (all server-side): free text (matched against `record_id` +
  `reason`), module, user, from/to date. **Quick filters:** Today · 7 days
  · 30 days · Security & admin.
- **Event detail** — click a row to expand: actor, timestamp, module,
  action, record type, record reference (deep-links to the Journal Entry
  detail view where the type resolves to a real route — grepped, not
  guessed), reason, and the `Before` / `After` JSON.

## Coverage

Instrumentation exists in ~40 services (Sales, Purchases, Inventory,
Banking recon, GL periods, Tax rates, Compliance, Company, Roles…). Live
row volume is currently low because production data was seed-loaded
directly rather than through the services. **Closing the remaining write-
path gaps app-wide is Block G** — see the coverage matrix there. Company
Documents (Block B) is fully covered by a DB trigger.

## Architecture

```
AuditTrailPage → useAuditTrailPage (server paging/filter state)
  → auditLogService.getPage / .getKpis
    → SupabaseAuditLogRepository.getPage  (filter + range + count:'exact')
```

Shared label maps + `describeAuditEntry` / `resolveAuditRecordLink` live in
`src/features/admin/utils/auditLabels.ts`.
