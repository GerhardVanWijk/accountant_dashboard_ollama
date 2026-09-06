# Vertex Platform Administration Console

**Migration:** `0070_superuser_platform_console` (+ `0070b`, `0070c`).
**Branch:** `superuser-platform-console-2026-09-06`. **Route:** `/admin/superuser/*`
(RouteGuard confines a `profile.role === 'superuser'` account here — it has no company and
nothing else in the app would render for it).

The console replaces the old single-screen Superuser Dashboard. It is the operational surface
for the **owner / platform superuser** of Vertex: strong control over Vertex *customers*
without turning into an unrestricted accounting-data browser.

---

## 1. Privacy boundary — the whole point

A superuser administers the **platform**, not customer books. Ordinary console screens show
**account administration** and **configuration health** only. They never show, and there is no
code path to:

- bank transactions / balances, customer invoices, supplier bills, payments
- payroll, tax computations, journal detail, GL balances, financial statements
- document attachments
- customer PII beyond what account administration needs (member emails, names)

The DB enforces this: the console's cross-company reads use the existing **superuser RLS
policies** (companies, profiles, subscriptions, subscription_events, company_invitations, and
the new `audit_log_entries_select_superuser`). Config health comes from
`platform_admin_client_setup()`, which returns **counts and booleans only** — account count,
financial-year presence, period count, whether an active admin exists. It cannot return a
figure.

**Future support access** to accounting data, if ever needed, must be built separately as an
explicit *Request / Enter support access* mode: reason required, time-limited session, visible
banner, audit event on entry and exit. It is **not** implemented in this block and no screen
here approximates it.

---

## 2. Information architecture

Left sidebar — **Vertex Platform Admin** — separate from the tenant accounting nav:

| Section | What it is |
|---|---|
| **Overview** | KPI cards + subscription mix. Real derivable data only. |
| **Clients** | Every company: name, trading name, type, plan, subscription status, users, created, access status. Search (name / trading name), filters (All / Active / Suspended / Starter / Growth / Premium / Unmanaged). Row → Client Detail. |
| **Subscriptions** | Plan + management view across all clients (All / Managed / Manual / Unmanaged). |
| **Users** | Cross-company member directory (read + link to the client's Users tab). |
| **Invitations** | Every company invitation, filterable by status; revoke pending ones. |
| **Security & Audit** | Real administrative/security events across all companies. |
| **Platform** | Only metrics Vertex can derive. No fabricated infrastructure numbers. |

### Client Detail (`/admin/superuser/clients/:companyId`)

Header: company name, type, plan badge, access-status badge. Actions: *Manage subscription*
(→ Subscription tab), *View security audit* (→ Security tab), *Suspend access / Reactivate*
(right-aligned, away from the routine actions; suspend requires a reason and a confirm).

Tabs: **Overview** (company info + account-setup health) · **Subscription** · **Users** ·
**Invitations** · **Security** (company-scoped audit) · **Platform info** (IDs, timestamps,
"infrastructure usage lives in the hosting dashboards").

---

## 3. Client status (suspension)

`companies.is_active` already existed; `0070` adds `suspended_at` / `suspended_by` /
`suspension_reason` and makes suspension *enforced*:

> **`get_my_company_id()` now returns `NULL` for a member of a company whose `is_active =
> false`.** Every company-scoped RLS clause (`company_id = (select get_my_company_id())`) then
> denies — reads and writes both. A superuser is scoped by `get_my_role()`, so platform
> administration is unaffected.

The suspended member's client detects the state via `my_workspace_suspended()` and RouteGuard
shows a dedicated **"This workspace is suspended"** screen (no accounting data was deleted).

`set_company_suspended(company_id, suspend, reason)` — **superuser-only, audited** (`platform`
module, `audit_log_entries`). It does **not** delete data, users, journals or documents, does
**not** touch the GL or inventory, and does **not** cancel any Paystack subscription.
Confirmation copy: *"Suspending this client blocks user access to the Vertex workspace.
Accounting records will be preserved."*

---

## 4. Manual subscription override

`0070` adds superuser-only, audited RPCs on top of the `0068` subscription model:

- `superuser_set_subscription_plan(company_id, plan_code, status)` — assign / upgrade /
  downgrade. Creates or updates the `subscriptions` row, writes a `subscription_events` row
  **and** an `audit_log_entries` row.
- `superuser_set_subscription_status(company_id, status)` — suspend / reactivate / cancel the
  subscription.

Every manually-administered subscription is marked **`provider = 'manual'`**. This keeps three
states permanently distinguishable, per commercial-readiness (`docs/SUBSCRIPTIONS.md` §18):

| State | Meaning |
|---|---|
| **Unmanaged** | No `subscriptions` row. Grandfathered — full module access. |
| **Manual / superuser override** | `provider = 'manual'`. A superuser set the plan. Not a payment. |
| **Provider managed** | `provider = 'paystack'` (future). Driven by the Paystack webhook. |

Before a plan change the UI shows current plan → new plan, the modules **being added** and
**becoming unavailable**, and the confirmation: *"Changing this subscription changes which
Vertex modules this company can access. Historical accounting information will not be deleted."*
A downgrade never deletes accounting data — the modules' data is retained and reappears if the
plan is restored (`docs/PLAN_ENTITLEMENTS.md`).

**No payment, "paid", revenue, MRR or "last payment" is shown anywhere** — Paystack is not
connected. The Overview page has a "Billing (coming soon)" placeholder for the future
Payments / Invoices / Failed payments / Renewals surface; it displays no records.

---

## 5. User & role administration

A superuser has no company, so the ordinary `profiles` / `user_roles` policies (admin +
own-company) don't apply. `0070` gives audited RPCs:

| RPC | Guardrails |
|---|---|
| `superuser_set_member_access(user_id, profile_role?, is_active?)` | Can't touch a superuser account, can't act on self, can't grant superuser, can't strand a company's only active admin. |
| `superuser_remove_member_from_company(user_id)` | Detaches the profile (`company_id → NULL`, `role → viewer`) and removes its company `user_roles`. Refuses the last active admin. Account is kept. |
| `superuser_assign_role` / `superuser_unassign_role` | Fine-grained system/company roles. The `0065` `user_roles_company_integrity` trigger still applies. |
| `superuser_create_company_invitation` / `superuser_revoke_company_invitation` | Same token security as `0069` (hash-only, single-use, 7-day, email-bound), scoped to the named company. |

The **User Detail** view surfaces the member's access level, account status, and system-role
assignments. Effective-permission grouping (Sales / Purchasing / Inventory / …) is a **PARTIAL**
in this block — role badges + the client's Users tab are shipped; the grouped permission
explorer is a follow-up.

All guards use `public.get_my_role() IS DISTINCT FROM 'superuser'` (not `<>`) — a `NULL` role
(a suspended actor, or a profile mid-provision) is **blocked**, never a silent bypass.

**Add user** (Client Detail → Users → *Add user*): Option A — existing Vertex user by exact
email → `add_existing_user_to_company` (0065, superuser-capable). Option B — invite a new user
→ `superuser_create_company_invitation`. Vertex has no email delivery, so the dialog says
*"Invitation created. Copy this secure single-use link and send it to the user."* — never
"Invitation email sent". The raw token is shown **once**; only its SHA-256 hash is stored, so
it cannot be retrieved later — the UI reflects that. An expired invitation is replaced by
creating a new one (never re-using a token).

---

## 6. Roles — the Bookkeeper decision

**Vertex had no Bookkeeper system role, and Bookkeeper was never silently mapped to
Accountant.** `0070` adds `bookkeeper` as a **fine-grained system role** (`roles` +
`role_permissions`, 54 grants) — the coarse `profile_role` enum is **unchanged**
(`viewer / operator / accountant / manager / admin / superuser`).

Bookkeeper = day-to-day operational bookkeeping: customers, suppliers, sales & invoicing,
purchases, banking **incl. reconciliation**, VAT **preparation**, fixed-asset capture, stock
counts, GL read, reports. It is deliberately **denied**: `user_management` (security
administration), `audit:read`, `financial_periods:manage` (period close), `tax:post` (final
submission), and the senior/destructive inventory actions (`delete` / `account_map` /
`cost_edit`). The migration's own observability block fails if any of those are granted.

**Recommended eventual role hierarchy** (not all implemented): Viewer · Sales · Stock
Controller · **Bookkeeper** · Accountant · Finance Manager · Admin · Superuser.

---

## 7. Security & audit

`0070` adds `audit_log_entries_select_superuser` (`USING public.get_my_role() = 'superuser'`)
alongside the unchanged company-scoped read policy. The **Security & Audit** screen reads real
administrative events across companies — user added / suspended / reactivated, invitation
created / accepted / revoked, role changed, subscription changed, company created / suspended —
enriched client-side with company name and actor email. Filter by action and free-text.
Security cards (suspended users, suspended clients, pending / expired invitations) come from
`platform_admin_metrics()`; only metrics backed by real data are shown.

The Client Detail **Security** tab is the same data filtered to that one company.

---

## 8. Server-side authorization

Every console operation is enforced in the database, never by hidden buttons or route checks:

- **Reads** — superuser RLS policies + `SECURITY DEFINER` functions that each re-check
  `get_my_role()`.
- **Writes** — `SECURITY DEFINER` RPCs (`set_company_suspended`, the `superuser_*` family),
  each of which raises `42501` unless `get_my_role() IS DISTINCT FROM 'superuser'` is false.
  `EXECUTE` is revoked from `anon`; granted to `authenticated` (the same pattern as the `0069`
  invitation RPCs — the internal check is the real gate). A company **Admin cannot call any of
  them** (they'd fail the role check).

Verified live, rollback-wrapped: suspend / reactivate, `get_my_company_id()` → NULL for a
suspended member, the demo company unaffected, plan override + events + audit, member
administration, and every non-superuser rejection. Security advisors: **0 ERROR** (the new
functions add the same `authenticated_security_definer_function_executable` **WARN** the
existing invitation/onboarding RPCs already carry — expected, guarded internally).

---

## 9. Accounting safety

These are platform-admin operations. Changing a subscription / plan / access level / user
status **never** mutates an accounting record. After `0070`: Trial Balance difference
`R0.00`, GL 1200 = physical inventory (`R1,478,853.74`), 247 journal entries, 343 stock
movements — **byte-identical** to the pre-migration baseline. The migration writes no journal
rows and no destructive statement against any accounting / document table.

---

## 10. What is PARTIAL / deferred

- **Effective-permissions explorer** on the User Detail view (grouped Sales / Purchasing / …).
  Role badges + the Users tab ship now.
- **Support-access mode** (§1) — designed above, not built.
- **Billing surface** (Payments / Invoices / Failed payments / Renewals) — layout placeholder
  only, waiting on real Paystack payment data.
- Per-company **custom** fine-grained roles are not listed in the superuser role pickers (the
  `roles` RLS shows a superuser only system roles); system roles + `bookkeeper` cover the
  console's needs.
