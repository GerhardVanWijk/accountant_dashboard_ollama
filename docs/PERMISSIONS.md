# Permissions & Authorization

This app has **two separate authorization layers**. They serve different
purposes, they are not merged, and only one of them is a real security
boundary. Read this before adding a new gate.

## Layer 1 — `Profile.role` (coarse, RLS-enforced, the real boundary)

`profiles.role` (`ProfileRole`: `admin | accountant | manager | operator |
viewer | superuser`) is what every one of this app's ~45 company-scoped
Supabase tables actually checks in Row-Level Security policies via
`get_my_company_id()` and role-comparison functions. **This is the only
layer that is enforced at the database.** If a policy allows a role to
read/write a table, that role can do it — full stop, regardless of
anything the UI shows or hides.

- `admin` and `superuser` currently have broad/unrestricted access within
  their scope (a company for `admin`, cross-company admin functions for
  `superuser`).
- The other roles (`accountant`, `manager`, `operator`, `viewer`) carry
  whatever RLS grants that specific role on that specific table — this
  predates Phase T and is unchanged by M11.

## Layer 2 — fine-grained `Permission` / `Role` / `RolePermission` /
`UserRoleAssignment` (Phase T, app-level, UI-only)

A second, additive catalog layered on top, introduced in Phase T
(migration 0010) for finer UI feature-gating than the six `ProfileRole`
values allow:

```
Permission        { id, feature, action, description }
Role              { id, companyId?, name, isCustom }   -- companyId undefined = system role, shared by every tenant
RolePermission    { roleId, permissionId, granted }
UserRoleAssignment{ userId, roleId, companyId, assignedAt, assignedBy }
```

**As of M11, the real permission catalog covers exactly eight features:**
`customer_management`, `dashboard`, `gl`, `inventory`, `invoicing`,
`payroll`, `reports`, `supplier_management` — each with some subset of
`create` / `read` / `update` / `delete` / `export` actions. **No other
feature has a matching permission row** — there is no `banking`, `tax`,
`purchases`, `assets`, `compliance`, `foreign_exchange`, `leases`,
`related_parties`, or `financial_periods` entry in `public.permissions`.
This is a real gap, not an oversight of this phase — see "Ungated areas"
below.

**Six system roles are seeded**: `accountant`, `employee`,
`finance_manager`, `sales_manager`, `stock_controller`, `viewer` — each
with a fixed, pre-granted permission set (query
`role_permissions`/`roles`/`permissions` directly to see the current
matrix; it's data, not code, so it can change without a deploy).
Companies can also create their own custom roles (`isCustom: true`) via
the Users & Roles admin page (`/admin/users`, M10/M11) and toggle
individual permission grants on them.

### `usePermission()` / `usePermissionStore` / `<PermissionsLoader/>`

- `<PermissionsLoader/>` (mounted once in `AppLayout`) loads the signed-in
  user's **union of granted permissions across every fine-grained role
  assigned to them in the current company** into `usePermissionStore`.
- `usePermission(feature, action?)` reads that store.
- **This is UI-only.** It decides what renders — a nav item, a button, an
  entire route's content. It does **not** call into Supabase, and by
  itself it changes nothing about what the same user's browser could do
  by calling the underlying service/repository directly. RLS (Layer 1) is
  still what actually stops that.

### `useCanAccess()` — the composition rule M11 introduced

`src/features/auth/hooks/useCanAccess.ts` is what every gate in this app
actually calls, not `usePermission()` directly:

```ts
function useCanAccess(feature, action) {
  if (profile.role === 'admin' || profile.role === 'superuser') return true;
  return usePermission(feature, action);
}
```

**Why an unconditional bypass for `admin`/`superuser`:** those two roles
already have full RLS access to everything in their scope (Layer 1). A UI
block on top of that would not be security — it would be theater, since
the same action is one direct Supabase call away regardless. It would also
create a real, immediate lockout: as of M11, the live `user_roles` table
has **zero rows** — no account, including the one real admin, has ever
been assigned a fine-grained role. Strict fail-closed gating (`usePermission()`
alone) would hide the Users & Roles admin page — where fine-grained roles
get assigned — from the only person who could ever assign one. `admin`/
`superuser` bypass avoids that dead end. Fine-grained gating becomes
meaningful the moment an admin assigns a non-admin user a role, which is
the realistic use case this catalog exists for.

## What M11 actually gates

### Route-level (`<PermissionRoute feature="..." action="...">`, `src/app/router.tsx`)

Wraps a route's element and renders `<AccessDenied/>` instead when
`useCanAccess()` returns false. **Only wraps routes with a genuine
matching permission** — see `src/features/auth/permissionRouteMap.ts` for
the exact list (Dashboard, Customers, Suppliers, Invoices, Products,
Warehouses, the four Payroll pages, the four Accounting pages mapped to
`gl`, the six Reports pages, and `/admin/users`). Every other route in
this app is **not** route-gated — there is no matching permission to gate
it with, and inventing one was explicitly out of scope for M11.

This sits **on top of**, not instead of, `<RouteGuard/>` — authentication
(signed in, has a company, superuser confinement) is still `RouteGuard`'s
job. `PermissionRoute` only adds a second, narrower check once that has
already passed.

### Navigation visibility (`useVisibleNavGroups()`, `src/features/auth/hooks/`)

The sidebar (`AppSidebar`) and global search (`GlobalSearch`) both render
from `useVisibleNavGroups()` instead of the raw `navGroups` list — a nav
item mapped to a permission the user lacks is filtered out; a group left
with zero visible items is dropped. Items with no permission mapping
always stay visible (nothing to check them against).

### Action-level (representative high-risk actions, per module)

Gated via the same `useCanAccess()` hook, hiding (not just disabling) the
control when the check fails, so an unauthorized user never sees a
destructive button at all:

| Module | Gated actions | Permission |
|---|---|---|
| Customers | New customer, Edit, Inactivate/Activate | `customer_management:create/update` |
| Suppliers | Add supplier, Edit, Hold/Status toggle | `supplier_management:create/update` |
| Invoices | New invoice, Edit, Delete, Mark as sent | `invoicing:create/update/delete` |
| Inventory (Products) | New product, Edit, Delete | `inventory:create/update/delete` |
| Inventory (Warehouses) | New warehouse, Edit, Delete, Stock adjustment, Stock transfer | `inventory:create/update/delete` |
| Payroll (Employees) | New employee, Edit, Delete | `payroll:create/update/delete` |
| Payroll (Runs) | New payroll run, Delete | `payroll:create/delete` |
| Admin (Users) | Add user, change access level, suspend/reactivate, assign/unassign role, create custom role, toggle permission grant, delete custom role | `user_management:create/update` |

`user_management` has no `delete` action in the real catalog — deleting a
custom role is gated on `user_management:update` (the closest existing
key) rather than inventing a `delete` action that doesn't exist in
`public.permissions`.

### `<AccessDenied/>` (`src/features/auth/components/AccessDenied.tsx`)

Reusable v0-styled state — icon, heading, description, a way back to the
dashboard. Never surfaces the underlying `feature`/`action` key to the
user.

## Ungated areas (real gap, not an oversight)

These routes/modules have **no route-level or action-level gate** because
no matching permission exists in `public.permissions`: Companies,
Financial Periods, Sales (Quotes/Orders/Credit Notes/Receipts), Purchases
(Vendors detail actions beyond the list — Bills/Orders/Payments/Aging),
Banking (all three pages), Assets (all four pages), Tax (all eight pages),
Compliance (all three pages), Related Parties, Foreign Exchange, Leases,
the Access Log (`/admin/audit`) and business Audit Trail
(`/admin/audit-trail`), Settings, Help. Anyone who can sign in and reach
the app shell (i.e., has a company) can open these — same as before M11.
Closing this gap requires deciding on and seeding new permission rows
(a schema/data change), which was explicitly out of scope for M11 without
a separate STOP-and-report; it's the natural next step for a future
security phase, alongside deciding whether the fine-grained catalog should
grow to cover them or whether `Profile.role` alone should keep governing
those areas.

## Admin self-lockout guard (UI-level, M11)

The Users & Roles admin page (`/admin/users`) disables:
- the access-level (`ProfileRole`) selector for the signed-in user's own
  row, and
- the Suspend/Reactivate button for the signed-in user's own row.

This is a UI convenience only — nothing in the backend (RLS,
`ProfileService.changeRole()`/`setActive()`) currently stops an admin from
demoting or suspending themselves via a direct call, and no such guard
was added at the service layer in M11 (that would be a business-logic
change, out of scope here). If that matters, it should be a deliberate
service-layer decision in a future phase, not something to infer from a
UI disable alone.
