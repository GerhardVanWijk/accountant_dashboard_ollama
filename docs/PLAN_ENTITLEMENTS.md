# Plan Entitlements — Vertex Accounting

## The three-layer access model

Effective access to any module/action is:

```
ACTIVE SUBSCRIPTION   (Layer 1 — is Vertex commercially active for this company?)
        AND
PLAN ENTITLEMENT      (Layer 2 — does the purchased plan include this module?)
        AND
USER PERMISSION       (Layer 3 — may this individual user perform this action?)
```

These are **never conflated**. Layer 3 is the fine-grained permission
catalogue (`docs/PERMISSIONS.md`, migrations 0064/0065). Layers 1 and 2
are this document (migration 0068).

| | Layer 1 — Subscription | Layer 2 — Entitlement | Layer 3 — Permission |
|---|---|---|---|
| Question | Is billing current? | Is the module in the plan? | Can this user do it? |
| Stored | `subscriptions.status` | `plan_features` | `role_permissions` + `user_roles` |
| Resolver | `company_entitlements()` folds L1 into L2 | `company_entitlements()` | `useCanAccess()` |
| Frontend | — | `useEntitlement()`, `<EntitlementGate>` | `useCanAccess()`, `<PermissionRoute>` |
| Server | `require_entitlement()` | `require_entitlement()` | RLS (`profiles.role`) |
| **Company Admin bypass?** | **No** | **No** | Yes (admin/superuser) |
| Superuser bypass? | Yes (explicit, audited) | Yes | Yes |

A company **Admin does not bypass a commercial restriction** — buying more
of the product is not an access-control decision.

## Feature keys (the entitlement catalogue)

`public.subscription_features` — 22 keys. **Core** keys (`dashboard`,
`customers`, `suppliers`, `user_management`, `settings`) are available on
every plan and with no plan at all. The rest are plan-gated.

Client mirror: `src/features/subscriptions/entitlements.ts`
(`ENTITLEMENT_KEYS`, `ENTITLEMENT_LABELS`, `PLAN_CATALOGUE`).
`subscriptionCatalogue.test.ts` fails the build if the mirror drifts from
the migration seed — **the database is the source of truth** and the
public pricing page renders from `PLAN_CATALOGUE`.

## Plans (migration 0068 seed — from the audited public pricing)

| | Starter R199 | Growth R449 | Premium R899 |
|---|---|---|---|
| Included users | 1 | 3 | 10 |
| `sales`, `purchasing`, `banking`, `vat`, `financial_statements`, `assets` | ✓ | ✓ | ✓ |
| `sales_receipts`, `purchasing_payments`, `income_tax`, `general_ledger`, `audit_trail` | — | ✓ | ✓ |
| `advanced_tax`, `assets_depreciation`, `inventory`, `compliance` | — | — | ✓ |

`payroll` and `foreign_exchange` are optional add-ons — in **no** base plan.
Plans are cumulative (Starter ⊂ Growth ⊂ Premium), asserted by test.

## The resolver — `company_entitlements()`

`SECURITY DEFINER`, `search_path=public`, `authenticated`-only. Returns the
feature keys the **caller's company** is entitled to:

1. every **core** feature, always;
2. if the company has **no `subscriptions` row** → **every** feature
   ("unmanaged" / grandfathered — the transition state, see below);
3. otherwise the plan's features, **but only while
   `status IN ('active','trialing')`** — a `past_due` / `suspended` /
   `cancelled` / `expired` subscription drops to **core-only** (that is
   Layer 1).

`company_has_entitlement(key)` and `require_entitlement(key)` (raises
`42501` "Your Vertex plan does not include this feature") wrap it.

## Transition — no lockout

Same principle as the 0064 permission catalogue. Today the only live
company (the demo) has **no subscription row** → it is unmanaged → fully
entitled → nothing changes for it. Once Paystack is connected (Block 5),
every new company gets a `subscriptions` row and "unmanaged" means legacy
only.

## Enforcement

### Frontend (UX — not a security boundary)
- `<EntitlementGate>` wraps `<Outlet/>` in `AppLayout`: a direct URL to a
  module the plan lacks renders `<UpgradeRequired>` (CTA → `/settings/subscription`),
  never a broken accounting page.
- `useVisibleNavGroups()` hides nav items the company isn't entitled to
  (one consistent policy — hide, not lock; discovery is the always-visible
  **Plan & Billing** nav item).
- `useEntitlement(key)` — `superuser` passes; core passes; **not-loaded
  passes** (a resolver outage must not lock a paying customer out of their
  own books); otherwise the resolved set decides.

### Server (the real boundary)
- **Scaffold shipped for `inventory`**: `BEFORE INSERT` triggers on
  `products`, `warehouses`, `stock_movements` call
  `require_entitlement('inventory')`. A company on Starter/Growth cannot
  create inventory data even via a direct API/SQL call; an unmanaged
  company is unaffected (trigger no-ops when `auth.uid()` is null or the
  feature resolves).
- **Incremental rollout** (same as the permission catalogue did it): the
  other paid modules adopt the identical `perform public.require_entitlement('<key>')`
  guard — inside their posting RPC, or a `BEFORE INSERT/UPDATE` trigger on
  the module's write tables — as each is hardened. Order of priority:
  `payroll`, `advanced_tax`, `compliance`, `assets_depreciation`,
  `general_ledger`, `sales_receipts`, `purchasing_payments`.

## Downgrade safety — accounting history is never deleted

A plan change **only changes what operations are available going
forward**. It never deletes, cascades or archives:

- transactions, journals, journal lines
- GL balances / trial balance
- documents (invoices, bills, credit notes, delivery notes …)
- stock movements, stock balances
- audit trail / access log

If a customer downgrades from Premium and loses `inventory`:
`stock_movements` and every posted inventory journal **stay exactly as
they were**; `products`/`warehouses`/`stock_movements` inserts start being
rejected server-side; the Inventory nav disappears; `/inventory/*` shows
the upgrade panel; the Balance Sheet still shows the inventory asset
balance. Re-upgrading restores full access with no data migration.

`subscriptionDowngrade.test.ts` and the live rollback-wrapped verification
(see `docs/KNOWN_ISSUES.md`) prove no destructive path exists.

## Billing separation

Platform billing for Vertex **never** touches a customer's accounting
ledger — no journal entries, no GL accounts, no Trial Balance effect.
`subscriptions` / `subscription_events` are the only tables involved.
Verified: TB `R0.00`, GL 1200 unchanged after 0068.
