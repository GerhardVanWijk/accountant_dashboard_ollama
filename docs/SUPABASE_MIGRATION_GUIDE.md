# Supabase Migration Guide

Living record of the migration from in-memory mock repositories to Supabase
(project `bcaffvpibpitpuqglszn`) — read by the Database Migration Bee at the
start of every phase (`.claude/agents/database-migration-bee.md`), updated at
the end of every phase. Full entity catalog, relationships, and the migration
strategy this guide implements: the **Accounting Suite Atlas** artifact
(published 2026-08-23) — this doc is the execution log against that plan's
§5, not a replacement for it.

**Core principle, unchanged across every phase**: services depend on
`IXxxRepository` interfaces, never concrete classes. A `SupabaseXxxRepository
implements IXxxRepository` swaps in via a one-line change in a feature's
`services/index.ts`. Zero service, hook, or component changes. Every service
method is already `async`. Mock repositories are never deleted — they remain
the test-suite's own backing store (see the Testing note below).

## Status

| Phase | Scope | Status |
|---|---|---|
| A | Schema setup & validation | ✅ done 2026-08-23 |
| B | Core repositories (Company, FinancialYear, AccountingPeriod, Account) | ✅ done 2026-08-23 |
| C | Ledger (JournalEntry, AuditLog) — append-only enforcement | ✅ done 2026-08-23 |
| D | Master data (Customers, Suppliers, Products, Warehouses, BankAccounts, TaxRates, Employees) | ✅ done 2026-08-23 (TaxRate: schema shipped, wiring deferred — see below) |
| E | Transactional documents (Sales, Purchases, Banking, Inventory) | ✅ schema/repositories done 2026-08-23 — GL posting blocked by a pre-existing gap, see below |
| F | Fixed Assets, Payroll, Tax modules | not started |
| G | Compliance & Phase 12 (Deferred Tax, ECL, Leases, Related Parties, FX, Reporting Standards) | ✅ done 2026-08-23 |
| T | Multi-Tenant Auth + Role System + Superuser Dashboard | ✅ done 2026-08-23 |
| — | Reconciliation persistence (`reconciliations` table, closes the Phase E `bank_transactions.reconciliation_id` gap) | ✅ done 2026-08-25 |

## Testing note — read before trusting a green test run as migration proof

The existing 844-test suite constructs its own `MockXxxRepository` instances
directly in each test file (e.g. `new MockJournalEntryRepository([])`) — it
does **not** import the live singleton each feature's `services/index.ts`
exports. Swapping that singleton from Mock to Supabase changes what the
*running app* uses; it is invisible to `npm test`, which will still report
844/844 regardless of whether a Supabase repository actually works. Treat
"tests passing" as proof the business logic didn't regress, not as proof a
given phase's Supabase repositories function correctly — that needs either a
manual smoke pass through the running app, or new integration tests written
specifically against the Supabase repositories (out of scope for the Bee's
"do not create new test code" rule as currently written; revisit if that
rule should be narrowed to "do not create new *unit* test code").

---

## Phase A — Schema setup & validation ✅

### What was found before anything was built

`list_tables` on first run showed the project was **not empty**: 27
pre-existing tables (companies, users, roles, permissions, user_roles,
customers, suppliers, products, warehouses, invoices, invoice_lines,
payments, bills, bill_lines, bank_accounts, bank_transactions,
reconciliations, accounts, journal_entries, journal_lines, tax_rates,
tax_transactions, stock_movements, expenses, fixed_assets, employees,
audit_logs), all RLS-enabled, all 0 rows, and **not tracked by
`list_migrations`** (empty result) — meaning this schema was created outside
Supabase's migration system entirely. Its column shapes didn't match the
real application types (e.g. its `companies.legal_name`/`fiscal_year_end_month`
vs. the real `Company` type's `reportingFramework`/`legalEntityType`/VAT
fields; its `journal_entries.posted` boolean vs. the real `draft | posted |
reversed` status), and it was missing roughly two-thirds of the domain
model (no Fixed Assets, Payroll runs, any Phase 9-12 tax module, Compliance,
Leases, Related Parties, Exchange Rates).

User confirmed (given everything was empty) to drop it and start clean from
the real domain types rather than build around or alongside it.

### Migrations applied

1. **`0000_drop_legacy_schema`** — `drop table ... cascade` for all 27
   pre-existing tables.
2. **`0001_bootstrap`** — the real Phase A schema (below).
3. **`0002_phase_a_hardening`** — fixed every real finding from the first
   `get_advisors` pass: missing indexes on every FK column an RLS policy
   filters on (`company_id` everywhere), and `auth.uid()`/helper-function
   calls in RLS policies rewritten as `(select ...)` per Supabase's
   documented RLS performance pattern (evaluated once per query, not once
   per row).
4. **`0003_lock_down_function_grants`** — `0002`'s `revoke ... from public`
   silently didn't work: this project has an `ALTER DEFAULT PRIVILEGES` rule
   granting `EXECUTE` on every new `public` function directly to
   `anon`/`authenticated` at creation time, bypassing the generic `PUBLIC`
   pseudo-role entirely. Caught by directly querying
   `has_function_privilege()` rather than trusting the advisor's (possibly
   cached) re-run — fixed with explicit per-role `revoke`.

### Schema created

Five tables, matching the real TypeScript types field-for-field (see the
Atlas §3.1) rather than a generic accounting schema:

- **`companies`** — mirrors `src/types/company.ts`'s `Company` interface.
- **`profiles`** — `id` FK's `auth.users.id` (cascade delete). Replaces the
  stub `User`/`Role` types and the `SYSTEM_USER_ID` fallback every service
  currently uses. Auto-created via an `AFTER INSERT ON auth.users` trigger
  (`handle_new_user()`) — no client-side profile-creation call needed, and
  no chicken-and-egg problem for a brand-new signup with nothing to
  reference yet.
- **`financial_years`** — mirrors `FinancialYear`.
- **`accounting_periods`** — mirrors `AccountingPeriod`.
- **`accounts`** — mirrors `Account`, **with one deliberate deviation**:
  `company_id` is `NOT NULL` here even though the current
  `src/types/account.ts` `Account` type has no `companyId` field at all (the
  app is single-tenant today). Phase B's `SupabaseAccountRepository` will
  need to resolve "the" company internally (there's only one) rather than
  expect it from the existing `CreateAccountDTO` — flagged here rather than
  silently decided, since it's the first real crack in the "zero interface
  changes" promise and worth a conscious call when Phase B starts.

Enum types created: `legal_entity_type`, `reporting_framework`,
`accounting_basis`, `financial_statement_compilation`,
`vat_filing_frequency`, `vat_accounting_basis`, `profile_role`,
`financial_year_status`, `accounting_period_status`, `account_type`,
`debit_credit` — each matching the corresponding TypeScript union exactly.

### RLS design

Every table scoped to the caller's own company via a `SECURITY DEFINER`
helper function:

```sql
create function public.get_my_company_id() returns uuid
language sql stable security definer set search_path = public
as $$ select company_id from public.profiles where id = auth.uid() $$;
```

This exists specifically to avoid RLS self-recursion when a policy on
`profiles` needs the caller's own `company_id` (a naive subquery against
`profiles` from within a `profiles` policy is the classic Postgres RLS
recursion trap) — the standard Supabase-documented pattern for this. Locked
down to `EXECUTE` for `authenticated` only, no `anon` access (verified via
direct `has_function_privilege()` query, not just the advisor).

`companies` allows `INSERT` for any authenticated user (there is no company
to scope against until one exists — a real bootstrapping exception, not an
oversight) with `SELECT`/`UPDATE`/`DELETE` scoped to the caller's own
company thereafter. `financial_years`/`accounting_periods`/`accounts` are
full same-company CRUD. `profiles` allows a user to see their own row plus
colleagues in the same company, and update only their own row.

### Known accepted finding

One security advisor warning remains and is **not** fixable without breaking
the RLS design: `get_my_company_id()` is deliberately callable by
`authenticated` (every company-scoped RLS policy depends on it). This is the
standard, documented trade-off of the "SECURITY DEFINER helper function to
avoid RLS recursion" pattern — the advisor flags any such function
generically, not a defect specific to this one. Anon access is fully
revoked and verified.

### Final verification

- `list_tables` — exactly 5 tables, all `rls_enabled: true`, all 0 rows.
- `get_advisors` (security) — 1 accepted finding (above), 0 unaddressed.
- `get_advisors` (performance) — 0 warnings; remaining findings are all
  `INFO`-level "unused index" (expected — zero rows, zero query history,
  not a real problem).
- `list_migrations` — 4 tracked migrations, matches what was actually run.

---

## Phase B — Core repositories ✅

### Cross-cutting setup (done as part of this phase, not a separate step)

- Installed `@supabase/supabase-js`.
- `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` added to `.env.local`
  (real values, gitignored) and `.env.local.example` (placeholders).
  `src/config/env.ts` extended with `supabaseUrl`/`supabasePublishableKey`.
- `src/config/supabase.ts` — the single shared client, using the
  `sb_publishable_...` key (Supabase's recommended modern key over the
  legacy anon JWT — safe client-side, real access control is RLS, not
  secrecy of this key).

### The real blocker this phase surfaced, and how it was resolved

Every Phase A RLS policy grants access to `authenticated` only —
intentional, and correct. But this app has no real login flow yet, so a
freshly swapped-in Supabase client runs as `anon` by default, which every
policy denies outright: every list would render empty, every create would
be rejected. This was surfaced to the user before finishing the swap rather
than shipping a build that silently stopped working. Resolution: **Supabase
Anonymous Sign-ins** — `signInAnonymously()` creates a real `auth.users` row
that assumes the `authenticated` Postgres role (Supabase's own documented
behavior), so every Phase A policy works against it unmodified. This
requires enabling "Anonymous Sign-ins" once in the dashboard
(Authentication → Providers) — a project-level Auth setting no Supabase MCP
tool exposes, so **the user needs to flip that toggle manually** before the
app will actually show data. `ensureAnonymousSession()`
(`src/config/supabase.ts`) is awaited in `src/main.tsx` before the first
render, so every hook's initial fetch already has a session rather than
racing an unauthenticated first pass. This only runs in the real browser
entry point — component tests render `<App />` directly and never execute
`main.tsx`, so it carries zero risk to the test suite (confirmed empirically
below, not just assumed).

### Repositories created

`SupabaseCompanyRepository` (`src/features/admin/repositories/`),
`SupabaseFinancialYearRepository`, `SupabaseAccountingPeriodRepository`,
`SupabaseAccountRepository` (`src/features/accounting/repositories/`) — each
implements its existing `IXxxRepository` interface exactly (verified by
`tsc`, not just visually), with a private `rowToXxx()`/`xxxToRow()` pair
mapping snake_case DB columns to the real camelCase domain type field for
field.

`SupabaseAccountRepository` carries the one flagged exception to "zero
interface changes": `accounts.company_id` is `NOT NULL` in the DB but the
`Account` TypeScript type has no `companyId` field. It resolves "the"
company internally (`resolveCompanyId()`, queries `companies` for the single
existing row, caches it for the repository instance's lifetime) rather than
changing `IAccountRepository`'s contract.

### Wiring

- `src/features/admin/services/index.ts` — `companyRepository` swapped.
- `src/features/accounting/services/index.ts` — `accountRepository`,
  `periodRepository`, `financialYearRepository` swapped.
  `journalRepository` stays `MockJournalEntryRepository` — the ledger is
  Phase C's scope, not this one; `JournalEntryService` takes the
  now-Supabase account/period repositories as constructor args exactly as
  before, no service code touched.

### Verification

- Swapped `admin/services/index.ts` alone first as a canary, ran the full
  suite, confirmed 844/844 still passed before touching the wider
  `accounting/services/index.ts` barrel (which is imported far more
  broadly, including via `SYSTEM_USER_ID`-only imports) — real evidence
  that `.env.local`'s Supabase values load correctly under `vitest run` in
  this project's Vite config, not an assumption.
- `npm run type-check` — clean.
- `npm run lint` — clean.
- `npx vitest run` — 844/844, both before and after the full swap.
- `npm run build` — clean.
- **Not verified**: an actual authenticated read/write against the live
  tables through the running app — that needs a browser, which this session
  has no tool for. The user still needs to (1) enable Anonymous Sign-ins in
  the dashboard, then (2) load the app and confirm Company/Financial
  Year/Accounting Period/Chart of Accounts pages actually show and can
  create real data, before treating Phase B as fully proven end-to-end.

## Phase C — Ledger (append-only infrastructure) ✅

### Migration applied

**`0004_phase_c_ledger`** — three tables, an atomic posting function, and
append-only lockdown.

- **`journal_entries`** — header row mirroring `JournalEntry` (minus
  `lines`). Same flagged deviation as `SupabaseAccountRepository`:
  `company_id` is `NOT NULL` but the domain type has no `companyId` field
  (single-tenant today), resolved internally by the repository. New
  `journal_entry_status` enum matches `JournalEntryStatus` exactly.
  `unique(company_id, entry_number)`.
- **`journal_lines`** — detail rows. `company_id` is **denormalized** from
  the parent entry (always set by the posting function below, never
  independently) rather than scoped via a join back to `journal_entries` —
  matches Phase A's "index/scope every `company_id` directly" convention
  and keeps RLS a plain equality check like every other table instead of an
  `EXISTS` subquery. Three `CHECK` constraints mirror
  `JournalEntryService.validateLines()`'s per-line shape rules
  (`debit >= 0 and credit >= 0`, not both sides on one line, not an
  all-zero line) — the cross-line `sum(debit) = sum(credit)` invariant
  stays application-level only, per `docs/LEDGER_ARCHITECTURE.md`'s "Known
  gaps" (unchanged by this phase).
- **`audit_log_entries`** — mirrors `AuditLogEntry`, with one deliberate
  exception: `user_id`/`record_id`/`action` are plain `text`, not
  `uuid`/FK/enum. Reason: `auditLogService` (`src/services/auditLogService.ts`)
  is **one shared top-level singleton** every feature writes to — including
  Sales/Purchases/Banking/Payroll/Tax, still Mock-backed (Phase D+, not
  started), which still pass Mock-style ids (e.g. `"inv_0001"`) and the
  `SYSTEM_USER_ID = 'system'` sentinel (no real authenticated session yet).
  A strict column would make every one of those still-Mock modules' audit
  calls throw the moment this singleton moved to Supabase, well before
  their own migration phase. `action` is additionally documented as
  non-exhaustive/growing (`src/types/auditLog.ts`), so an enum would need
  its own migration on every new action. `company_id` is still resolved and
  stored internally so RLS can scope reads.

### Append-only enforcement (both layers, per the task's ask)

1. **RLS**: every table has only `SELECT`/`INSERT` policies for
   `authenticated`, scoped to `company_id = (select get_my_company_id())`
   (or the FK-denormalized `company_id` for `journal_lines`). No
   `UPDATE`/`DELETE` policy exists at all, so RLS denies those commands
   outright regardless of grants.
2. **Grants**: this project's `ALTER DEFAULT PRIVILEGES` auto-grants
   `UPDATE`/`DELETE`/`TRUNCATE` (and everything else) on every *new* table
   to `anon`/`authenticated` — the same mechanism `0003_lock_down_function_grants`
   found and fixed for functions in Phase A. Explicitly revoked for all
   three tables; verified directly via `information_schema.role_table_grants`
   (not just re-running the advisor), same discipline as `0003`.

### Atomic header+lines insert

`create_journal_entry_with_lines(...)` — a `SECURITY INVOKER` Postgres
function (both inserts run as the calling `authenticated` user, so the RLS
policies above still apply exactly as they would to two direct client
inserts) that inserts the header, then every line from a `jsonb` array in
one call. One function call is one implicit transaction: a bad line (FK
violation, a `CHECK` violation) rolls the header back too — verified live
against the database (not just reasoned about): a deliberately bad
`account_id` and a deliberately bad debit+credit shape were each posted
through the function directly, both raised, and both left **zero** rows in
either table afterward. `EXECUTE` is revoked from `anon`/`PUBLIC` and
granted to `authenticated` only (verified via `has_function_privilege()`,
same discipline as `get_my_company_id()`).

### Repositories created

`SupabaseJournalEntryRepository` (`src/features/accounting/repositories/`)
— `create()` runs the app-level `assertBalanced()` re-check first (same
defense-in-depth `MockJournalEntryRepository` already does), then calls the
RPC and re-reads the full entry (with its now-persisted lines) by id.
`getAll()`/`getById()` use PostgREST's embedded-resource select
(`*, journal_lines(*)`) and sort the nested lines by a `line_no` column
(added specifically to make line order deterministic — a plain `SELECT`
gives no ordering guarantee otherwise).

`SupabaseAuditLogRepository` (`src/repositories/`, alongside
`IAuditLogRepository.ts` — top-level, not per-feature, matching where the
interface already lives) — plain `create()`/`getAll()`/`getById()`/
`getByRecord()`, no update/delete (matches the interface).

### Wiring

- `src/features/accounting/services/index.ts` — `journalRepository` swapped
  to `SupabaseJournalEntryRepository`.
- `src/services/auditLogService.ts` — **not** `accounting/services/index.ts`
  (that file only re-exports the singleton; this is where it's actually
  constructed) — `auditLogService`'s repository swapped to
  `SupabaseAuditLogRepository`. Flagged consequence: because this is one
  shared singleton, every still-Mock module across the whole app now sends
  its audit-log writes over the network instead of to an in-memory array,
  ahead of those modules' own migration phases. Functionally safe (the
  permissive `text` columns above exist specifically for this), but a real
  behavior change worth knowing about, not just a Phase C implementation
  detail.

### Verification

- `get_advisors` (security) — same accepted `get_my_company_id()` finding
  as Phase A, plus expected `auth_allow_anonymous_sign_ins` warnings on
  every table (this app's whole access model is anonymous-sign-in-based —
  not new, not unaddressed). Zero new unaddressed findings.
- `get_advisors` (performance) — all `INFO`-level "unused index" (zero
  rows, zero query history — expected, matches Phase A).
- Live rollback test against the real database (not just unit tests, which
  can't exercise real Postgres transaction semantics): see "Atomic
  header+lines insert" above. Test company/account/entries created and
  fully cleaned up afterward (cascade-deleted via the throwaway company) —
  confirmed 0 rows across every table again before finishing.
- `npm run type-check` — clean.
- `npm run lint` — clean.
- `npx vitest run` — 844/844.
- `npm run build` — clean.
- **Not verified**: an actual authenticated post through the running app UI
  (needs a real company + open accounting period + browser session, none of
  which exist yet in this single-tenant project). The direct-SQL rollback
  test above exercises the same function the repository calls, under the
  same transaction semantics, but not through the `authenticated` JWT path
  end-to-end — that needs Phase D's Customer/Supplier UI or a manual smoke
  pass once a Company exists.

## Phase D — Master data ✅

### Migration applied

**`0005_phase_d_master_data`** — seven tables, all fully editable (standard
`IRepository<T>` CRUD, not append-only like Phase C), so every table uses
the same "`ALL`, own company" RLS shape Phase B established for
accounts/accounting_periods/financial_years.

- **`tax_rates`**, **`customers`**, **`suppliers`**, **`products`**,
  **`warehouses`**, **`bank_accounts`**, **`employees`** — each mirrors its
  domain type field-for-field. Same flagged deviation as
  `SupabaseAccountRepository`: none of the seven domain types carry a
  `companyId` field, so `company_id` is resolved internally by every
  repository (see "Shared helper" below) rather than expected from the
  caller.
- One shared `active_status` enum (`'active' | 'inactive'`) covers all five
  domain types that use that exact union (Customer/Supplier/Product/
  Warehouse/BankAccount) instead of five near-identical enums. Every other
  union (`customer_payment_terms`, `supplier_category`,
  `bank_account_type`, `vat_treatment`, `employment_type`, etc.) got its
  own enum, mirroring each field exactly.
- Small nested lists with no independent relational need — `Customer.contacts`,
  `Supplier.bankDetails`/`remittanceAddress`, every `Address`,
  `Employee.standardAllowances`/`standardDeductions` — are `jsonb` columns,
  not their own tables, the same treatment Phase C gave `Address` fields
  already. Verified round-trip live (a jsonb array in, the same array shape
  back out) as part of this phase's smoke test, not just assumed.
- `products.tax_rate_id` references `tax_rates(id)`; `bank_accounts.gl_account_id`
  references `accounts(id)` — created in dependency order.
- Unique constraints per company on the natural business key each type
  already has: `customer_number`, `supplier_number`, `sku`, warehouse
  `code`, `account_number`, `employee_number`, and `tax_rates(code,
  effective_from)`.

### Shared helper

`src/repositories/resolveDefaultCompanyId.ts` — the "resolve the single
company" query first written inline in `SupabaseAccountRepository` (Phase
B) is now used by all seven of this phase's repositories plus Phase C's
`SupabaseJournalEntryRepository`/`SupabaseAuditLogRepository`, so it was
extracted rather than copy-pasted a tenth time. Phase B/C's own repository
files were **not** retrofitted to use it — they already shipped and were
verified against their inline copy; touching already-verified prior-phase
code for a pure DRY win wasn't worth the (small) risk.

### Real bug found and fixed: `getById()` on a malformed id

`billService.test.ts` (still-Mock Purchases, Phase E) surfaced a genuine
correctness gap, not just a fixture mismatch: every `Supabase*Repository.getById()`
threw a raw Postgres error (`invalid input syntax for type uuid`) when
passed a non-UUID string, where every `Mock*Repository`'s `Array.find()`
just returns `undefined` for any unrecognized id — `IRepository<T>.getById()`'s
contract (`Promise<T | undefined>`) never assumed anything about the id's
format. `src/repositories/supabaseErrors.ts` now checks for Postgres
SQLSTATE `22P02` (invalid_text_representation) and returns `undefined`
instead of throwing, applied to every `getById()` written in Phase C and
this phase (not retrofitted onto Phase B's three files — same
don't-touch-already-verified-code reasoning as above; flagged here as a
known residual gap rather than silently left unmentioned).

### Real conflict found, and why `taxRateService` stays Mock-wired

Attempting the `taxRateService` swap broke 6 real `billService.test.ts`
cases — not from the `getById()` bug above (that was fixed first and
independently confirmed), but from a genuine cross-phase data dependency:
`billService`'s live singleton (`src/features/purchases/services/index.ts`)
takes the real `taxRateService` singleton as a constructor argument, and
`billService.test.ts` exercises that real singleton directly for most of
its `postBill()` cases (an exception to this guide's own "Testing note"
below, which assumed no test file imports a live singleton — true for
every other Phase B/C/D swap, not this one). Still-Mock Purchases fixtures
reference Mock-seeded tax rate ids like `"tax_std_v2"`. Swapping
`taxRateService` made every such lookup resolve to "not found" against the
empty Supabase table — which `BillService.splitDeductibleVat()`
conservatively treats as non-deductible VAT, silently changing real GL
postings (wrong debit amounts to VAT Input vs. Expense), not just failing
loudly. Re-seeding matching rows into Supabase wouldn't fix it either: a
newly-inserted row gets a real UUID, never the exact string `"tax_std_v2"`
the fixtures look up by.

**Resolution**: `SupabaseTaxRateRepository` and the `tax_rates` table are
fully built, RLS-verified, and smoke-tested (see below) — but
`src/features/tax/services/index.ts` still constructs `taxRateService` with
`MockTaxRateRepository`, not the Supabase one, with the reasoning inlined
as a doc comment there. Flip it once Phase E migrates Sales/Purchases too,
so both sides of the dependency reference the same real tax rate rows
instead of one side holding stale Mock ids.

### Repositories created (7)

`SupabaseCustomerRepository`/`SupabaseTaxRateRepository` (`src/repositories/`,
alongside their interfaces — top-level, not per-feature, matching where
`ICustomerRepository`/`ITaxRateRepository` already live), `SupabaseSupplierRepository`
(`src/features/suppliers/repositories/`), `SupabaseProductRepository`/
`SupabaseWarehouseRepository` (`src/features/inventory/repositories/`),
`SupabaseBankAccountRepository` (`src/features/banking/repositories/`),
`SupabaseEmployeeRepository` (`src/features/employees/repositories/`).

### Wiring

- `src/features/customers/services/customerService.ts` — swapped.
- `src/features/suppliers/services/supplierService.ts` — swapped.
- `src/features/inventory/repositories/instances.ts` — `productRepository`/
  `warehouseRepository` swapped; `stockMovementRepository`/`stockLotRepository`
  (transactional inventory ledger) stay Mock — Phase E's scope.
- `src/features/banking/services/index.ts` — `bankAccountRepository`
  swapped; `bankTransactionRepository`/`bankReconciliationRepository` stay
  Mock — Phase E's scope.
- `src/features/tax/services/index.ts` — **not swapped**, deliberately (see
  above).
- `src/features/employees/repositories/instances.ts` — `employeeRepository`
  swapped; `payrollRunRepository`/`payrollTaxConfigRepository` stay Mock —
  Phase F's scope.

### Verification

- `get_advisors` (security) — same accepted findings as Phase A/C, plus the
  expected `auth_allow_anonymous_sign_ins` warning on each of the 7 new
  tables. Zero new unaddressed findings.
- Live smoke test against the real database: a throwaway company + one
  account (for `bank_accounts.gl_account_id`), then one row inserted
  directly into all six *wired* tables (customers, suppliers, products,
  warehouses, bank_accounts, employees) — including nested jsonb
  (`contacts`, `standardAllowances`, `standardDeductions`) — confirmed
  present, then the whole thing cascade-deleted and every table
  independently re-confirmed back at 0 rows.
- `npm run type-check` — clean.
- `npm run lint` — clean.
- `npx vitest run` — 844/844 (required two real fixes along the way, both
  documented above — not a clean pass on the first attempt, and worth
  saying so).
- `npm run build` — clean.
- **Not verified**: an actual authenticated create through the running app
  UI (same caveat as Phase C — needs a real Company to exist first).

## Phase E — Transactional documents ⚠️ schema/repositories done, GL posting blocked

### The headline finding

`invoiceService.postInvoice()` — and, by the same pattern,
`billService`/`creditNoteService`/`customerReceiptService`/`paymentService`/
`purchaseOrderService`/`bankTransactionService` — posts to the GL using
**hardcoded string account ids**: `AR_ACCOUNT_ID = 'acc_1100'`,
`SALES_REVENUE_ACCOUNT_ID = 'acc_4000'`, `VAT_OUTPUT_ACCOUNT_ID = 'acc_2100'`,
`COGS_ACCOUNT_ID = 'acc_5000'`, `INVENTORY_ACCOUNT_ID = 'acc_1200'`
(`src/services/invoiceService.ts`), passed straight through as
`NewJournalLineInput.accountId`. This was always a known gap —
`docs/LEDGER_ARCHITECTURE.md`'s "Known gaps" already says "Account mapping
is still hard-coded per service, not a configurable mapping table" — but it
was invisible while `accounts.id` was a Mock in-memory string matching
these exact constants. Under Supabase, `accounts.id` is a real `uuid`;
`'acc_1100'` isn't valid UUID syntax at all. **Reproduced live**: calling
the posting RPC with `account_id: "acc_1100"` against the real database
raises `22P02: invalid input syntax for type uuid: "acc_1100"` immediately
— the whole posting rolls back (Phase C's atomicity guarantee working
exactly as designed), and `postInvoice()` throws.

This means **no service-layer GL posting call succeeds against Supabase
today**, for any of the seven modules above, until the hardcoded account
ids are replaced with a real code→id lookup (e.g.
`accountService.getAll().find(a => a.code === '1100')`, or the
"configurable mapping table" `LEDGER_ARCHITECTURE.md` already flagged as a
future need). That is a service-layer change — explicitly out of a
migration phase's remit ("DO NOT modify services") — so it is reported
here, not fixed here.

### What was actually verified instead

Since the literal ask (call `invoiceService.postInvoice()` against live
data) cannot succeed today for a reason outside this phase's scope, the
strongest available proof was run instead: a real Company, a real 3-account
Chart of Accounts (AR/Sales Revenue/VAT Output, real UUIDs), a real
Customer, and a real 2-line-item Invoice (`INV-0001`, subtotal 1800.00 + VAT
270.00 = total 2070.00) were created directly against the schema this
phase shipped. The entry was then posted through the **same
`create_journal_entry_with_lines` RPC** `SupabaseJournalEntryRepository`
calls, using the real account UUIDs a fixed service layer would resolve to
instead of the broken constants:

| line | account | debit | credit |
|---|---|---|---|
| 0 | 1100 Accounts Receivable | 2070.00 | 0 |
| 1 | 4000 Sales Revenue | 0 | 1800.00 |
| 2 | 2100 VAT Output | 0 | 270.00 |

Verified: 3 lines (not 4 — `postInvoice()` only adds COGS/Inventory lines
when a line item carries a `productId`, which this test deliberately
didn't use, to keep the proof isolated to the AR/Revenue/VAT path the
dispatch asked about), debits = credits = 2070.00 within the entry, and
`sum(debit) = sum(credit)` across the whole chart (trial balance) also
balanced. The invoice was linked (`status: 'sent'`, `journal_entry_id`
set) exactly as `postInvoice()`'s last line does. Every row was then
cascade-deleted via the test company and every table re-confirmed at 0
rows. This proves the schema, repositories, and Phase C's RPC are all
correct and ready for a real Invoice-shaped posting — it isolates the
actual blocker precisely to the seven services' hardcoded account
constants, not to anything shipped in this phase.

### Schema (`0006_phase_e_transactional`)

Ten tables: `quotes`, `sales_orders`, `invoices`, `credit_notes`,
`customer_receipts`, `purchase_orders`, `bills`, `payments`,
`bank_transactions`, `stock_movements`.

**Design deviation, flagged not silently decided**: every document's
`lineItems: DocumentLineItem[]` (Quote/SalesOrder/Invoice/CreditNote/
PurchaseOrder/Bill) is a single `line_items jsonb` column, not a child
table the way Phase C's `journal_lines` is. `journal_lines` is the GL
itself — needs FK integrity to accounts, is queried relationally
(`getAccountLedger`), must be immutable at the DB layer. A document's line
items are a pre-GL source manifest — nothing in this codebase queries them
at the SQL level; every consumer reads the whole document object and works
over `lineItems` in JS. Same treatment Phase D gave
`CustomerContact`/`SupplierBankDetails`/etc. Trade-off, accepted
deliberately: no FK enforcement on a line's `productId`/`taxRateId`, no
SQL-level per-product reporting — revisit if either becomes a real need.
Same jsonb treatment for every allocation array
(`CreditNoteAllocation[]`/`ReceiptAllocation[]`/`PaymentAllocation[]`/
`BankTransactionAllocation[]`). This also means each document is a
single-row write, so there's no header/lines atomicity gap to solve the
way Phase C needed an RPC for.

Other notes: `purchase_orders.bill_id` and `bills.purchase_order_id` are
mutually referential — `bill_id`'s FK is added via `ALTER TABLE` after
`bills` exists. `bank_transactions.direction` reuses the `debit_credit`
enum Phase A already created (matches `DebitCredit` exactly) rather than a
new one. `customer_receipts.method`/`payments.method` share one
`payment_receipt_method` enum since `ReceiptMethod`/`PaymentMethod` are
identical unions. `stock_movements` is append-only (RLS SELECT/INSERT
only, `UPDATE`/`DELETE`/`TRUNCATE` revoked from `anon`/`authenticated`) —
same shape as `journal_lines`; the real `StockMovement` type has no
`status`/`unitCost`/`totalCost` at all, just a signed `quantityDelta`.
Every other table uses the "ALL, own company" RLS shape (fully editable,
matching each `IRepository<T>`).

### Repositories created (10)

`Supabase{Quote,SalesOrder,Invoice,CreditNote,CustomerReceipt,
PurchaseOrder,Bill,Payment}Repository` (`src/repositories/`, alongside
their interfaces), `SupabaseBankTransactionRepository`
(`src/features/banking/repositories/`, works in terms of
`BankTransactionWithAllocations` per the interface),
`SupabaseStockMovementRepository` (`src/features/inventory/repositories/`,
create/getAll/getById only — no `IRepository<T>`, matching
`IStockMovementRepository` exactly). Named after their interfaces exactly
(`SupabaseCustomerReceiptRepository`, not a shortened
"SupabaseReceiptRepository") for consistency with every other repository
in this codebase.

### Wiring

- `src/services/index.ts` — `invoiceService`'s repository swapped. This is
  the one that matters most: `sales/services/index.ts`'s
  `SharedInvoiceRepositoryAdapter` delegates to this exact singleton
  rather than constructing its own repository, so this one swap is what
  makes `SalesOrderService.convertToInvoice()`/`CreditNoteService`/
  `CustomerReceiptService` all see real data too, with zero changes to any
  of them.
- `src/features/sales/services/index.ts` — Quote/SalesOrder/CreditNote/
  CustomerReceipt repositories swapped.
- `src/features/purchases/services/index.ts` — PurchaseOrder/Bill/Payment
  repositories swapped.
- `src/features/banking/services/index.ts` — `bankTransactionRepository`
  swapped; `bankReconciliationRepository` stays Mock (reconciliations
  weren't in this phase's scope — `bank_transactions.reconciliation_id`
  has no FK target yet).
- `src/features/inventory/repositories/instances.ts` — `stockMovementRepository`
  swapped; `stockLotRepository` (FIFO costing layers) stays Mock.
- `src/features/tax/services/index.ts` — `taxRateService` attempted a
  second time, reverted a second time (see below).

### `taxRateService`: attempted again, reverted again — with a corrected reason

Phase D's original theory for deferring this swap — "flip it once
Sales/Purchases migrate too, so both sides reference the same real rows"
— was tried this phase and found to be **wrong**, not just premature.
Migrating Purchases to Supabase changes *where* `billService` reads from,
not *what data exists there*. `billService.test.ts`'s fixtures reference
specific Mock-seeded tax rate ids (e.g. `"tax_std_v2"`); no schema or
repository change makes a matching row exist in the (correctly empty)
Supabase `tax_rates` table. Swapping it reproduced the exact same 6
`billService.test.ts` failures Phase D already documented. Reverted again;
the doc comment in `tax/services/index.ts` now explains why "the next
phase migrates" was the wrong theory, not just states the deferral. Real
fix needed: either real seed/reference data in Supabase, or moving these
tests off the shared live singleton onto local fixtures — both outside a
schema-migration phase's scope.

### New finding: `SupplierService.deleteSupplier()`'s live singleton dependency

Distinct from the `taxRateService` issue and **not reverted**, because the
dependency this time is on `billService` itself — this phase's actual,
correct deliverable. `SupplierService.deleteSupplier()`
(`src/features/suppliers/services/supplierService.ts`) imports the live
`billService` singleton directly (`import { billService } from
'@/features/purchases/services'`) to check for open bills before allowing
a hard delete, rather than taking a narrow injected dependency the way
`BillService` itself does for `TaxRateResolver`/`InventoryReceiver`/etc.
`MockSupplierRepository.test.ts`'s accounts-payable guard test
(`"refuses to hard-delete a supplier with linked open bills"`) expects a
specific Mock-seeded bill (`bill_00000004`, owned by `sup_00000004`) to
exist via that real singleton — it now correctly doesn't, since
`billService`'s repository is genuinely empty Supabase data. This is a
**pre-existing architectural gap** (direct singleton import instead of
constructor-injected interface) that real backend separation exposed for
the first time, not a defect in this phase's repository code — and fixing
it means editing `SupplierService`'s constructor/DI, which is service-layer
code this migration has consistently promised not to touch. Left failing,
documented, not silently worked around: **843/844** this phase, one known
test, one known reason, one known real fix (give `SupplierService` an
injected `BillLookup`-shaped dependency the way `BillService` already does
it) for whoever picks up service-layer changes next.

### Verification

- `get_advisors` (security) — same accepted findings as every prior phase,
  plus the expected `auth_allow_anonymous_sign_ins` warning on each of the
  10 new tables. Zero new unaddressed findings.
- `npm run type-check` / `npm run lint` / `npm run build` — clean.
- `npx vitest run` — **843/844** (the one documented `SupplierService`
  finding above; not a clean pass, and worth saying so plainly rather than
  rounding to "everything passed").
- Live end-to-end proof against the real database — see "What was
  actually verified instead" above. Every row created was cascade-deleted
  and every table re-confirmed at 0 rows afterward.

## Phase E.5 — Account ID Configuration (service-layer mapping) ✅

Resolves Phase E's headline finding for the six Sales/Purchases GL-posting
services. First real service-layer change in this migration — every prior
phase explicitly promised not to touch service code; this one was
explicitly requested to do exactly that, scoped precisely to the six
services that block Phase E's own GL-posting flow.

### Correction to the dispatch brief before building anything

The brief's premise — "Query `Company.defaultChartOfAccounts` or similar"
— doesn't exist; `Company` (`src/types/company.ts`) has no such field, and
no `accountMapping`/`chartOfAccounts` field exists anywhere in the type
system. Its scope estimate ("journalEntryService + 6 posting methods")
also undercounted the real problem: a full codebase grep for
`_ACCOUNT_ID = 'acc_` found **~30 files**, not 6 — Fixed Assets, Leases,
every Tax module (Income Tax, Provisional Tax, Deferred Tax, Dividends
Tax), Payroll, Reports (Cash Flow/Income Statement/Balance Sheet), the
Dashboard, and even one React component
(`PostPayrollRunForm.tsx`) carry the identical pattern.
`journalEntryService` itself has none (it's generic — callers pass
`accountId`); the six files actually needing this fix
(`invoiceService.ts`, `billService.ts`, `paymentService.ts`,
`purchaseOrderService.ts`, `creditNoteService.ts`,
`customerReceiptService.ts`) are exactly the Sales/Purchases posting
services from Phase E, which is what "6" turned out to correctly mean once
`journalEntryService` is set aside. The other ~24 files carry the exact
same latent bug and are explicitly **not** touched here — they'll hit the
same `22P02` error the moment Phase F (Fixed Assets, Payroll, Tax) or a
later Reports/Dashboard phase makes their repositories Supabase-backed.

### What was built

`src/features/accounting/services/accountMappingService.ts` —
`AccountMappingService`, constructed with the real `AccountService` (not a
raw Supabase client — keeps it backend-agnostic, matching this codebase's
"services depend on services" architecture). Defines `AccountMappingKey`
(11 semantic roles: `AR`, `AP`, `SALES_REVENUE`, `VAT_OUTPUT`,
`VAT_INPUT`, `COGS`, `INVENTORY`, `EXPENSE`, `CASH_AND_BANK`, `GRNI`,
`FIXED_ASSET` — the unique set the six services actually use) mapped to
the Chart of Accounts `code` convention every `acc_XXXX` constant already
assumed (e.g. `AR` → code `"1100"`). `getAccountId(key)` fetches the whole
Chart of Accounts once (cached for the service instance's lifetime, not
re-fetched per journal line) and resolves by code. Still a hardcoded
mapping — table code → semantic role — not a real per-company configurable
mapping (`LEDGER_ACCOUNTING.md`'s "Known gap" the whole codebase still
carries); what changed is that it now resolves to a **real** account id
looked up live, not a Mock-only literal string. Wired as one singleton
(`accountMappingService`) in `accounting/services/index.ts`.

Also **not** in the brief's sketch but necessary: the brief's suggested
signature `getAccountId(accountType: string): UUID` is synchronous — real
resolution needs an async DB round trip on first call, so the actual
signature is `getAccountId(key: AccountMappingKey): Promise<ID>`, and
`AccountMappingKey` is a real union type, not a loose `string`.

### DI, not a live singleton import

Every one of the six services already takes its cross-service dependencies
as narrow constructor-injected interfaces (`JournalPoster`,
`InventoryMover`, `TaxRateResolver`, etc. — never a live singleton import)
— exactly the pattern `SupplierService` does NOT follow, which is why its
one test failure from Phase E couldn't be fixed without touching service
code. `AccountMapper` (`{ getAccountId(key): Promise<ID> }`) follows the
same established convention: each of the six services' constructors gained
one new parameter, and every `const XXX_ACCOUNT_ID = 'acc_XXXX'` usage
became `await this.accounts.getAccountId('XXX')`. Wiring updated in
`src/services/index.ts` (`invoiceService`), `src/features/sales/services/index.ts`
(`creditNoteService`, `customerReceiptService`), and
`src/features/purchases/services/index.ts` (`purchaseOrderService`,
`billService`, `paymentService`) — all pass the one shared
`accountMappingService` singleton.

### Mechanical test fixes (not business-logic changes)

Adding a required constructor parameter broke 14 direct `new
XxxService(...)` call sites across 6 test files (`billService.test.ts`
×8, `purchaseOrderService.test.ts`, `creditNoteService.test.ts` ×2,
`customerReceiptService.test.ts` ×2, `invoiceService.test.ts`) and one
`vi.mock('../services', ...)` mock missing the new export
(`TrialBalancePage.test.tsx`). Every test site was given a **real**
`AccountMappingService` wired against the same `MockAccountRepository(seedAccounts)`
already in each test's setup (confirmed `seedAccounts` already carries
every code this needs — 1000/1100/1200/1500/2000/2050/2100/2110/4000/5000/5100
all present) rather than a hand-rolled stub — these tests now exercise the
real account-mapping resolution logic, not less coverage than before.
Mechanical fixes only: no assertion, fixture, or expected-value in any
test was changed.

### Verification

- `npm run type-check` / `npm run lint` / `npm run build` — clean.
- `npx vitest run` — **843/844**, unchanged from Phase E. The one failure
  is the already-documented `SupplierService`/`billService` direct-singleton
  gap from Phase E — genuinely out of this dispatch's scope too (it's not
  one of the six services this phase touched, and fixing it means the same
  kind of DI change to `SupplierService` specifically, which wasn't
  requested here).
- Live end-to-end proof against the real database, explicitly validating
  **code-based resolution** (not manually-picked UUIDs, unlike Phase E's
  proof): a fresh Company + 3-account Chart of Accounts (codes 1100/4000/2100)
  + Customer + 2-line Invoice, then a single SQL statement that resolves
  each account by `code` (the exact query `AccountMappingService.getAccountId()`
  now runs) and posts through the same RPC the repository layer uses — no
  `22P02` error, 3 balanced lines (debit AR 2070.00 / credit Sales Revenue
  1800.00 / credit VAT Output 270.00), and the trial balance across the
  whole chart balanced. Cleaned up afterward — 0 rows confirmed across
  every table again.

### Deliberately not done here

The other ~24 `acc_XXXX` files (Fixed Assets, Leases, every Tax module,
Payroll, Reports, Dashboard, `PostPayrollRunForm.tsx`) still carry the
identical bug. `AccountMappingKey`/`AccountMapper` are deliberately easy
to extend (add a key, add its code) for whoever fixes those — not
something to redesign later. A real configurable-per-company account
mapping (UI-editable, not a hardcoded code convention at all) remains a
separate, larger feature this phase did not attempt.

## Phase F Preamble — Extend Account Mapping to All Remaining Services ✅

Extends `AccountMappingService` from the 6 Sales/Purchases services (Phase
E.5) to every remaining file with the hardcoded `acc_XXXX` pattern, ahead
of Phase F's own repository work.

### Corrections to the dispatch brief, verified before touching anything

- The suggested audit command (`grep -r "acc_[0-9]" src/services/
  src/components/ | grep -v ".spec.ts"`) doesn't match this codebase:
  there's no top-level `src/services/` holding every service (they're
  spread across `src/features/*/services/`), `src/components/` is generic
  UI with zero account-id references, and tests are `.test.ts`, not
  `.spec.ts` (the exclusion would have silently included every test
  file's own fixtures). Ran the correct recursive search instead.
- The specific account codes the brief listed didn't match reality at all
  — e.g. `incomeTaxService (acc_3300, acc_4600)` and `cgtService
  (acc_3300)` don't exist anywhere in the codebase (no `incomeTaxService`
  by that name, no CGT posting file, no `3300`/`4600` codes anywhere).
  The real count was **20 production files**, not ~24, once test-file
  duplicates and Mock seed-data generation (`generateSeedPostings.ts`,
  intentionally out of scope — it feeds still-Mock fixtures, not a live
  posting path) are set aside.
- The brief's "`npm test` will surface all 24 failures at once, each a
  `22P02` error" doesn't hold either: most of these files' own tests
  construct local Mock repositories (the normal pattern), so they'd stay
  green regardless of whether the production code was fixed — the same
  trap Phase D/E's `taxRateService`/`billService.test.ts` incidents came
  from, generalized. The bug is real in the *live app* today for anything
  already wired to the real `journalEntryService`/`accountService`
  singletons (most of these files are), just invisible to `npm test`.

### Real finding: two risk categories, not one

A full read of each file (not just the constant declarations) split them
into two genuinely different problems:

1. **Write/posting services** (12 files) — call `journalEntryService.postJournalEntry()`
   with a hardcoded id, hitting the exact `22P02` crash Phase E's headline
   finding described: `fixedAssetService`, `assetDisposalService`,
   `eclComputationService`, `payrollRunService`, `leaseService`,
   `leaseDisposalService`, `leaseAmortizationService`,
   `taxComputationService`, `deferredTaxComputationService`,
   `dividendDeclarationService`, `provisionalTaxService`,
   `subledgerReconciliation`.
2. **Read-only report/reconciliation code** (8 files) — and this group
   itself splits in two: `calculateIncomeStatement.ts`/`calculateBalanceSheet.ts`/
   `cashFlowStatementService.ts`/`calculateMonthlyFinancials.ts`/
   `taxComputationCalculations.ts` compare `account.id === 'acc_XXXX'`
   against an **already-fetched** account list in plain JS — this can
   never crash, it silently drops that account into the wrong bucket (a
   correctness bug, not a crash). But `emp201Service.ts`/`vatReportService.ts`
   call `journalEntryService.getAccountLedger(accountId)`, which calls
   `accountRepository.getById(accountId)` first — and
   `SupabaseAccountRepository.getById()` (Phase B) was never patched with
   the `isInvalidUuidError` handling every later repository got (Phases
   C–E), so it still hard-crashes on a malformed id. **Fixed as part of
   this dispatch** — same one-line pattern as every other repo.

### What was built

`AccountMappingKey` extended from 11 to **38** keys (27 new: `ACCUMULATED_DEPRECIATION`,
`DEPRECIATION_EXPENSE`, `GAIN_ON_DISPOSAL`, `LOSS_ON_DISPOSAL`,
`ALLOWANCE_FOR_DOUBTFUL_DEBTS`, `IMPAIRMENT_LOSS`, `SALARIES_EXPENSE`,
`UIF_EMPLOYER_EXPENSE`, `SDL_EXPENSE`, `PAYE_PAYABLE`,
`UIF_EMPLOYEE_PAYABLE`, `UIF_EMPLOYER_PAYABLE`, `SDL_PAYABLE`,
`OTHER_DEDUCTIONS_PAYABLE`, `RIGHT_OF_USE_ASSET`, `LEASE_LIABILITY`,
`ACCUMULATED_DEPRECIATION_ROU`, `DEPRECIATION_EXPENSE_ROU`,
`INTEREST_EXPENSE_LEASE`, `INCOME_TAX_PAYABLE`, `INCOME_TAX_EXPENSE`,
`DEFERRED_TAX_ASSET`, `DEFERRED_TAX_LIABILITY`, `DEFERRED_TAX_EXPENSE`,
`RETAINED_EARNINGS`, `DIVIDENDS_PAYABLE`, `DIVIDENDS_TAX_PAYABLE`,
`OWNERS_EQUITY`) — deliberately built with heavy reuse: many keys are
shared across multiple files that already posted/read against the
identical account (e.g. `DEPRECIATION_EXPENSE` covers `fixedAssetService`,
`cashFlowStatementService`, AND `taxComputationCalculations` — one key,
not three near-duplicates; `AR`/`AP`/`CASH_AND_BANK`/`VAT_OUTPUT`/`VAT_INPUT`
from Phase E.5 got reused as-is by `subledgerReconciliation`/`vatReportService`).

**The 12 write services** got the exact Phase E.5 treatment: `AccountMapper`
added as a constructor parameter, every `XXX_ACCOUNT_ID` constant replaced
with `await this.accounts.getAccountId('KEY')`, wiring updated in each
feature's `services/index.ts`.

**The 2 read-only-but-crashing files** (`emp201Service.ts`'s
`reconcilePayrollLiabilities()`, `vatReportService.ts`'s
`reconcileVatControlAccounts()`, plus `subledgerReconciliation.ts`'s two
functions which have the same shape) took `accounts: AccountMapper` as a
new parameter instead — they're plain exported functions, not classes, so
no constructor DI; every hook calling them
(`useSubledgerReconciliation`/`useComplianceDashboard`/`useEmp201Report`/
`useVatReport`) was updated to pass `accountMappingService` through.

**The 5 read-only-and-safe files** got a lighter, more appropriate fix:
since they already receive the full `accounts: Account[]` list as a
parameter, matching by `account.code` instead of `account.id` needed no
new dependency at all — `calculateIncomeStatement.ts`/`calculateBalanceSheet.ts`
compare by code directly; `cashFlowStatementService.ts` (11 codes) and
`calculateMonthlyFinancials.ts`/`taxComputationCalculations.ts` resolve
every needed id from the `accounts` list once at the top of the pure
function via a small local `code → id` map, with "no matching account"
degrading to a zero contribution rather than a crash (same philosophy
`cashFlowStatementService.ts`'s own doc comment already described for
untracked working-capital accounts). One genuine UI-only instance
(`PostPayrollRunForm.tsx`'s default contra-account pre-selection) got the
same code-based-comparison treatment — silently defaulted to the wrong
account before, never crashed, still doesn't need an `AccountMapper`.

`SupabaseAccountRepository.getById()` (Phase B, never touched since) now
has the `isInvalidUuidError` handling every later repository already got.

### Verification

- `get_advisors` — unaffected (no schema changes this dispatch, service-layer only).
- `npm run type-check` / `npm run lint` / `npm run build` — clean.
- `npx vitest run` — **843/844**, same one pre-existing `SupplierService`
  finding, unaffected and out of scope here too. Getting there took two
  real, non-trivial fixes along the way, not a clean pass: (1) 14 direct
  `new XxxService(...)` call sites and 2 standalone-function call sites
  across production wiring/hooks needed the new dependency threaded
  through (comprehensively found via one `tsc` pass, then fixed file by
  file); (2) `calculateMonthlyFinancials.test.ts`'s account fixture helper
  defaulted every account to `code: '0000'` and the test's `ACCOUNTS`
  array never overrode it — invisible under the old id-based comparison,
  a real gap once the fix correctly switched to code-based matching.
  Fixed the fixture, not the assertion.
- Live end-to-end proof against the real database for the **newly added**
  key set (the original 11 keys were already proven live in Phase E.5):
  a fresh Company + 3 accounts (Salaries Expense 5400, PAYE Payable 2200,
  Cash and Bank 1000) + a simulated payroll posting resolving all three by
  `code` (exactly what `AccountMappingService.getAccountId()` now does)
  through the same RPC the repository layer uses — 3 balanced lines
  (20000.00 = 20000.00), cleaned up afterward.

### Deliberately not done here

A genuine configurable-per-company account mapping (UI-editable, not a
hardcoded code convention) remains a separate, larger feature — this
dispatch closes the "every posting/report path throws or silently
miscategorizes against Supabase" gap, not the underlying "the mapping
itself is still hardcoded" one `docs/LEDGER_ARCHITECTURE.md` already
flagged.

## Phase F — Fixed Assets, Payroll, Tax ✅

15 repositories across three domains, the largest single-phase repository
count yet.

### Scope correction before building anything

The dispatch listed `Employee` under Payroll — already fully migrated in
Phase D (`SupabaseEmployeeRepository`), not new work here. Real net-new
scope: **3 Fixed Assets + 2 Payroll + 9 Tax + 1 ECL (financialInstruments)
= 15 repositories**, confirmed by reading every domain type and repository
interface before writing any schema (`IFixedAssetRepository`,
`IDepreciationEntryRepository`, `IAssetDisposalRepository`,
`IPayrollRunRepository`, `IPayrollTaxConfigRepository`,
`IIncomeTaxConfigRepository`, `ITaxComputationRepository`,
`IProvisionalTaxPeriodRepository`, `IDeferredTaxComputationRepository`,
`IDividendDeclarationRepository`, `IDividendsWithholdingTaxConfigRepository`,
`ICgtInclusionRateConfigRepository`, `ICgtAnnualExclusionConfigRepository`,
`ICgtDisposalAdjustmentRepository`, `IEclComputationRepository`).

### Schema (`0007_phase_f_fixed_assets_payroll_tax`)

15 tables. Nested arrays/objects embedded on their parent record
(`PayrollRun.payslips`, `TaxComputation.adjustments`,
`DeferredTaxComputation.items`, `EclComputation.buckets`,
`ProvisionalTaxPeriod`'s three payment slots) are `jsonb` columns — same
treatment every embedded-array domain type has gotten since Phase D,
nothing here queries them at the SQL level.

**Company-id resolution genuinely splits in two**, confirmed by reading
each TS type rather than assuming one pattern for all 15:
`TaxComputation`/`ProvisionalTaxPeriod`/`DeferredTaxComputation`/
`EclComputation` all carry a real `companyId` field (like
`FinancialYear`/`AccountingPeriod`, Phase B) — their repositories take it
directly from the entity, no internal resolution, no
`resolveDefaultCompanyId()`. Every other type here (`FixedAsset`,
`DepreciationEntry`, `AssetDisposal`, `PayrollRun`,
`PayrollTaxYearConfig`, `IncomeTaxYearConfig`, `DividendDeclaration`,
`DividendsWithholdingTaxRateConfig`, `CgtInclusionRateConfig`,
`CgtAnnualExclusionConfig`, `CgtDisposalAdjustment`) has no `companyId`
field at all (like `Account`, Phase B) — internal resolution via the
shared helper, as usual.

One shared `draft_posted_status` enum covers `PayrollRun`/
`TaxComputation`/`DeferredTaxComputation`/`EclComputation` — all four TS
unions are the identical `'draft' | 'posted'`, one enum instead of four
near-duplicates. `depreciation_entries`/`asset_disposals` are append-only
(SELECT/INSERT only, `UPDATE`/`DELETE`/`TRUNCATE` revoked from
`anon`/`authenticated`) — same shape as `journal_lines`/`stock_movements`,
matching their real types (`journalEntryId` is non-optional on both —
every row genuinely always has one, unlike the many nullable
`journal_entry_id` columns elsewhere in this schema).

### Repositories created (15)

`Supabase{FixedAsset,DepreciationEntry,AssetDisposal}Repository`
(`src/features/assets/repositories/`), `Supabase{PayrollRun,
PayrollTaxConfig}Repository` (`src/features/employees/repositories/`),
`Supabase{IncomeTaxConfig,TaxComputation}Repository`
(`src/features/tax/incomeTax/repositories/`),
`SupabaseProvisionalTaxPeriodRepository`
(`src/features/tax/provisionalTax/repositories/`),
`SupabaseDeferredTaxComputationRepository`
(`src/features/tax/deferredTax/repositories/`),
`Supabase{DividendDeclaration,DividendsWithholdingTaxConfig}Repository`
(`src/features/tax/dividendsTax/repositories/`),
`Supabase{CgtInclusionRateConfig,CgtAnnualExclusionConfig,
CgtDisposalAdjustment}Repository` (`src/features/tax/capitalGains/repositories/`),
`SupabaseEclComputationRepository` (`src/features/financialInstruments/repositories/`).

### Wiring

Every one of the 15 swaps happened in a `repositories/instances.ts` file
(or, for `TaxComputation`/`IncomeTaxConfig`, the same file) — **no
constructor signatures changed this phase**, unlike Phase E.5/F-Preamble.
That distinction mattered for verification: since only the repository
*implementation* swapped (Mock → Supabase) and not any class's
constructor shape, every test file's own local `new MockXxxRepository()`
construction was completely unaffected — zero collateral test breakage,
confirmed by a single clean `npx vitest run` pass on the first try.

### Verification

- `get_advisors` (security) — same accepted findings as every prior
  phase, plus the expected `auth_allow_anonymous_sign_ins` warning on each
  of the 15 new tables. Zero new unaddressed findings. Append-only grants
  on `depreciation_entries`/`asset_disposals` verified directly via
  `information_schema.role_table_grants`, not just the advisor.
- `npm run type-check` / `npm run lint` / `npm run build` — clean.
- `npx vitest run` — **843/844**, same one pre-existing `SupplierService`
  finding, unaffected. Clean on the first attempt this time — no
  constructor changes meant nothing to fix.
- Live end-to-end proof against the real database: a fresh Company + 4
  accounts (Fixed Assets 1500, Accumulated Depreciation 1590, Depreciation
  Expense 5200, Accounts Payable 2000) + a real `fixed_assets` row
  (status: `draft`), then posted through the exact GL shape
  `FixedAssetService.postAcquisition()` produces (DR Fixed Asset / CR
  Accounts Payable for the full cost) via the same RPC the repository
  layer uses, flipped the asset to `active` with its `journal_entry_id`
  set — 2 balanced lines (250,000.00 = 250,000.00), and the trial balance
  across the whole chart held too. Cleaned up afterward — 0 rows
  confirmed across every table again. The RPC/schema mechanism itself has
  now been proven live across five separate phases (C, E, E.5,
  F-Preamble, F) — this was about proving the new `fixed_assets` table
  and its repository integrate correctly with that already-proven
  mechanism, not re-proving the mechanism itself.

### Deliberately not done here

Every domain's *service-layer* GL posting logic (`FixedAssetService.postAcquisition()`,
`PayrollRunService.postPayrollRun()`, `TaxComputationService.postComputation()`,
etc.) already had its hardcoded-account-id problem fixed in the Phase F
Preamble — this phase only swapped the repositories underneath those
already-fixed services. No service code changed here. `StockLot` (FIFO
costing layers) and `PayrollTaxConfigRepository`'s Mock seed-data
verification status are unrelated, still-open items, not touched by this
phase.

## Phase G — Compliance, Leases, Related Parties, Exchange Rates, Reporting Standards

**Migration:** `0008_phase_g_compliance_leases_related_parties_exchange_rates`

### Scope correction before building

The dispatch for this phase named files that don't exist
(`compliance.types.ts`, `leases.types.ts`, etc. — real files are plain
camelCase: `src/types/compliance.ts`, `lease.ts`, `relatedParty.ts`,
`reportingStandard.ts`, `foreignExchange.ts`) and asked for several types
that don't exist anywhere in the codebase: `DeferredTaxLiability`,
`ReportingStandard` (only `ReportingStandardVersion` exists),
`LeaseAmortizationSchedule`, `LeaseTerminationEntry`, `RelatedPartyBalance`,
`ExchangeRateVariance`, `DisclosureRequirement`, `FinancialStatementMapping`.
`DeferredTaxComputation`/`EclComputation` were also named as if part of this
phase — both were already fully migrated in Phase F
(`SupabaseDeferredTaxComputationRepository`/`SupabaseEclComputationRepository`,
confirmed still wired). Real scope, verified by reading every type file and
repository interface directly: **7 types across 5 domains** — `PublicInterestScore`,
`LeaseContract`, `LeaseAmortizationEntry`, `RelatedParty`,
`RelatedPartyTransaction`, `ReportingStandardVersion`, `ExchangeRate`.

The dispatch's proposed column lists were also substantially wrong against
the real TS types — most severely for `public_interest_scores`, where
almost the entire proposed column list (`score numeric(5,2)`, a
`components` shape of `{strategicImportance, governance, riskProfile,
internationalExposure, complexity}`) was fabricated; the real
`PublicInterestScore` type has no `score` field and its
`PublicInterestScoreComponents` is `{averageEmployees, turnover,
thirdPartyLiabilities, shareholdersOrMembersCount}`, plus 13 fields the
dispatch omitted entirely (the four point fields, `totalScore`,
`suggestedAssuranceLevel`, `suggestedReportingFramework`,
`reportingFrameworkConfidence`, the three `*Reason` fields,
`frameworkDiffersFromCurrent`, `sourceReference`). Other corrections made
before building, not asked-about a second time (same discipline as every
prior phase — verify, build against the real type, document the
correction):

- `lease_contracts.journal_entry_id` built **nullable** (dispatch said
  `NOT NULL`) — `LeaseContract.journalEntryId` is optional on the TS type;
  a `'draft'` lease has no journal entry yet. `status` includes `'draft'`
  (dispatch's enum only had `active|terminated`). Added the two running-total
  columns the dispatch's list omitted entirely: `accumulated_depreciation`,
  `outstanding_lease_liability`.
- `lease_amortization_entries` rebuilt against the real 7-field shape
  (`period_end` as a date, not the dispatch's `period_month int`;
  `interest_amount`/`principal_amount`/`outstanding_lease_liability_after`/
  `accumulated_depreciation_after` — the dispatch's list only had 2 of these
  5 amount/running-total fields).
- `related_parties.relationship_type` enum built with the real 6 values
  (`director, shareholder, subsidiary, associate, key_management,
  other_related_entity`) — dispatch's proposed enum had 5, dropping
  `subsidiary`/`key_management` and inventing `related_entity`. Added
  `is_active` (dispatch omitted it); dropped the dispatch's separate
  `description` column — the real type only has `relationshipDetail`.
- `related_party_transactions`: **no `transaction_type` enum** — the
  dispatch asked for one (`sale|purchase|loan|guarantee|...`), but
  `RelatedPartyTransaction.natureOfTransaction`'s own doc comment
  explicitly rejects a closed taxonomy ("too varied... guessing would
  violate SA_ACCOUNTING_MASTER_SPEC §110"). Built as `nature_of_transaction
  text not null`, free text, matching the type exactly. Also corrected the
  dispatch's factually wrong dependency claim that this table "references
  Customer/Supplier (Phase D)" — `sourceReference` is documented free text,
  never a real FK.
- `reporting_standard_versions.standard` uses a new 2-value enum
  (`full_ifrs|ifrs_for_smes`) matching `ReportingStandardName` exactly —
  deliberately NOT the existing 5-value `reporting_framework` enum
  (`companies.reporting_framework`), which has 3 extra values invalid here.
  Dispatch's `standard text`/`version text` free-text columns replaced with
  the real `versionLabel` field name and added the two required fields the
  dispatch omitted: `early_adoption_permitted boolean not null`,
  `source_reference text not null` (both load-bearing per the type's doc
  comment — §49's edition/effective-date discipline the whole table exists
  for). Kept `notes`.
- `exchange_rates`: real field names (`fromCurrency`/`toCurrency`/
  `sourceReference`, not the dispatch's `source_currency`/`target_currency`/
  `source`); `source_reference` built `NOT NULL` (dispatch made it
  optional — the type has no `?`).
- `IExchangeRateRepository` has no custom `getRateForDate()` method —
  `ExchangeRateService.getRateForDate()` already does the "most recent
  rate <= date" filtering in-memory over `getAll()` (see
  `exchangeRateService.ts`), so `SupabaseExchangeRateRepository` implements
  plain `IRepository<ExchangeRate>` only, not the extra method the dispatch
  asked for on the repository.
- `ReportingStandardVersion`'s repository interface
  (`IReportingStandardVersionRepository`) is full `IRepository<T>` even
  though the type's own doc comment describes TaxRate-style
  immutable/`supersede()`-only discipline — flagged during the audit; user
  explicitly decided to build it **mutable, per the interface contract**,
  not the aspirational doc comment. Built that way; doc comment now
  describes intent the schema doesn't enforce (a known, chosen deviation,
  not an oversight).

### Company-ID pattern

Only `PublicInterestScore` carries a real `companyId` field (required,
read directly from the entity). The other 6 either have no `companyId`
field at all, or (`LeaseContract`) have an **optional** one whose own doc
comment says it "mirrors FixedAsset's lack of a companyId" — all 6 resolve
`company_id` internally via `resolveDefaultCompanyId()`, same split rule
established every phase since B.

### Append-only enforcement

`public_interest_scores` and `lease_amortization_entries` — interface-enforced
(no `update()`/`delete()` on `IPublicInterestScoreRepository`/
`ILeaseAmortizationEntryRepository`). Same Phase C pattern: SELECT/INSERT
RLS policies only, plus `revoke all ... from anon` and
`revoke update, delete, truncate ... from authenticated`. Verified directly
via `information_schema.role_table_grants` — `authenticated` holds exactly
`INSERT,REFERENCES,SELECT,TRIGGER` on both tables, `anon` holds nothing.
The other 5 tables are standard mutable, full-CRUD RLS (single `for all`
policy), matching `fixed_assets`'s grant shape exactly (`anon` and
`authenticated` both get default full grants; RLS is the real gate).

### New enum types (5)

`audit_assurance_level`, `reporting_framework_confidence`, `lease_status`,
`related_party_relationship_type`, `reporting_standard_name`. Reused two
existing enums where the real type's field value-set matched exactly:
`companies.reporting_framework`'s existing `reporting_framework` type for
`public_interest_scores.suggested_reporting_framework`, and
`financial_statement_compilation` for
`public_interest_scores.financial_statements_compilation`.

### Repositories created (7)

`Supabase{PublicInterestScore,ReportingStandardVersion}Repository`
(`src/features/compliance/repositories/`),
`Supabase{Lease,LeaseAmortizationEntry}Repository`
(`src/features/leases/repositories/`),
`Supabase{RelatedParty,RelatedPartyTransaction}Repository`
(`src/features/relatedParties/repositories/`),
`SupabaseExchangeRateRepository` (`src/features/foreignExchange/repositories/`).

### Wiring

All 7 swapped in their `repositories/instances.ts` (or, for
`PublicInterestScore`/`ReportingStandardVersion`, `compliance/services/index.ts`,
matching where the Mock instances already lived) — no constructor
signatures changed, same low-risk shape as Phase F's repository-only swap.

### Verification

- `get_advisors` (security + performance) — same accepted baseline as every
  prior phase (`auth_allow_anonymous_sign_ins` on all 7 new tables,
  `unindexed_foreign_keys` INFO on reference-only FK columns like
  `calculated_by`/`superseded_by_version_id`, matching the same pattern
  already accepted on `fixed_assets`/`ecl_computations`/etc.). Zero new
  finding *categories*. Append-only grants verified directly via
  `information_schema.role_table_grants`, not just the advisor.
- `npm run type-check` / `npm run lint` / `npm run build` — clean.
- `npx vitest run` — **843/844**, same one pre-existing `SupplierService`
  finding, unaffected.
- Live end-to-end proof against the real database: a fresh throwaway
  Company + 2 accounts + a balanced journal entry posted via the RPC (DR
  Right-of-Use Asset / CR Lease Liability, 50,000.00 = 50,000.00), an
  `active` `lease_contracts` row referencing it, a `lease_amortization_entries`
  row referencing both the lease and the journal entry (confirmed via a
  `getByLease`-equivalent query), a `public_interest_scores` row, a
  `related_parties` + `related_party_transactions` pair, two
  `reporting_standard_versions` rows with a real `superseded_by_version_id`
  chain, and an `exchange_rates` row. Verified the lease's `status` and the
  journal entry's balance directly, then deleted the throwaway company —
  cascade delete confirmed 0 rows remaining across all 7 new tables plus
  the financial year and journal entry.

### Deliberately not done here

No service-layer changes — none of these 7 types had a hardcoded-account-id
problem (Phase F-Preamble already covered `leaseService`/
`leaseDisposalService`/`leaseAmortizationService`'s GL account resolution).
This phase only built and wired the repositories underneath.

### Next

This was the last phase in the original plan (Compliance, Leases, Related
Parties, Exchange Rates, Reporting Standards) — every domain type in the
codebase's `src/types/` now has a Supabase-backed repository except where a
domain was explicitly out of scope by design (no multi-tenant Company
scoping beyond the single-company pattern; `StockLot` FIFO costing layers
and `PayrollTaxConfigRepository` Mock seed-data verification remain
open items flagged in earlier phases, unrelated to this one).

The "no multi-tenant Company scoping" gap above is exactly what Phase T
(below) started closing.

---

## Phase T — Multi-Tenant Auth + Role System + Superuser Dashboard ✅

2026-08-23, same day as Phase G. User-supplied brief asked for a 5-table
RBAC schema, a Superuser Dashboard, a company-admin Users & Roles page,
`usePermission()`, a realtime example hook, and Cloudflare Pages config.
Two architecture questions were confirmed with the user before any schema
change, because the live project already had real conflicts with the
brief's literal spec (not a greenfield build — 3 real `auth.users` rows
already existed):

1. **Layer on top, don't replace.** `profiles.role` (`profile_role` enum:
   admin/accountant/manager/operator/viewer) already gates every one of the
   ~45 previously-shipped tables' RLS via `get_my_company_id()`. Rewriting
   RLS on all 45 tables to the brief's literal per-feature-permission
   pattern was rejected as too large/risky for what was asked; the new
   roles/permissions/role_permissions/user_roles/audit_logs_access tables
   are additive, driving `usePermission()` UI-gating and the two new admin
   UIs — they do NOT change what any pre-existing table's RLS allows.
2. **Superuser is a normal, RLS-blocked account**, not an out-of-band
   service-role mechanism. `'superuser'` was added to `profile_role`
   (migration 0009, its own migration — Postgres forbids using a new enum
   value in the same transaction that adds it). A superuser's
   `company_id` is always NULL, which every existing
   `company_id = get_my_company_id()` policy already treats as zero rows
   (NULL never equals anything) — no rewrite needed on the 45 tables for
   that blocking to work. Two new ADDITIVE policies grant superuser
   read-only access to `companies`/`profiles` only (never any financial
   table), plus role/suspend authority over `profiles`.

### A third, bigger gap found before building anything

`ensureAnonymousSession()` (src/config/supabase.ts) meant this app had NO
real login anywhere — every page load signed in anonymously regardless of
the Phase-0 `useAuthStore` boolean stub. Surfaced to the user (a role/
superuser system is meaningless without real accounts); confirmed to build
real Supabase email/password auth as this phase's foundation rather than
layering roles on top of anonymous sessions.

### Migrations applied (0009-0015)

- **0009** — `alter type profile_role add value 'superuser'`, alone.
- **0010** — the 5 new tables (`permissions`, `roles`, `role_permissions`,
  `user_roles`, `audit_logs_access`), RLS, and seed data. `roles.company_id`
  is nullable (NULL = system role, shared by every tenant) rather than the
  brief's literal `not null` — avoids duplicating the 6 seeded system roles
  per company. `role_permissions` seed mapping extends the brief's own
  table (which left `payroll` ungranted to any role) — see
  `docs/KNOWN_ISSUES.md`'s Phase T entry.
- **0011** — hardening from the first `get_advisors` pass: `get_my_role()`
  was still callable by `anon` despite `revoke ... from public` (the same
  `ALTER DEFAULT PRIVILEGES`-grants-to-anon-directly landmine 0003 already
  hit and fixed for `get_my_company_id()`); split a `for all` policy that
  was redundantly covering `SELECT`; added 3 missing FK indexes.
- **0012** — **a real, pre-existing security gap found while designing
  onboarding**: `profiles_update_self` (from 0001) had no `with_check` at
  all — any signed-in user could self-elevate `role` to `'admin'`/
  `'superuser'` or reassign their own `company_id` into any other tenant
  via a plain client update. Fixed with a `BEFORE UPDATE` trigger that
  locks `role`/`company_id`/`is_active` unless the caller is superuser (any
  row) or admin (their own company's rows, and never able to grant
  `'superuser'`). Also added `profiles_update_admin_same_company` (lets an
  admin edit rows in their own company OR unassigned rows, for onboarding)
  and the `create_company_and_become_admin` SECURITY DEFINER RPC — company
  creation deliberately goes through this RPC, not raw table writes,
  specifically because the trigger above blocks a plain client update from
  doing it.
- **0013** — same anon-grant landmine again on the two new 0012 functions;
  explicit per-role revokes.
- **0014** — `find_unassigned_profile_by_email(text)`, a narrow SECURITY
  DEFINER RPC (admin-only, exact match only) so a company admin can add an
  already-signed-up-but-companyless colleague without a broader SELECT
  policy that would leak every pending signup's email to any authenticated
  user.
- **0015** — **a second real, pre-existing gap**, found while wiring the
  Suspend button: `profiles.is_active` (present since Phase A) was never
  checked by any RLS policy anywhere — a "suspended" user could still fully
  use the app. Fixed at `get_my_company_id()`/`get_my_role()` themselves
  (both now `and is_active = true`) rather than touching any of the 45
  tables whose policies call them — an inactive profile resolves to no
  company/role, and every existing policy already treats that as zero
  access.

### App code

- `src/config/supabase.ts` / `src/stores/authStore.ts` /
  `src/features/auth/bootstrapAuth.ts` — real session bootstrap replacing
  anonymous sign-in; `useAuthStore` no longer uses zustand `persist`
  (Supabase's own client already persists its session).
- `src/features/auth/pages/{LoginPage,SignUpPage,OnboardingPage}.tsx` — real
  forms. Onboarding offers ONLY "create a company" — a self-serve "join an
  existing company by id" was designed and rejected: every company-scoped
  table grants full CRUD the instant `company_id` matches, with no separate
  membership-approval gate, so letting a user set their own `company_id` to
  any company they can find would have been a real tenant-isolation bypass.
  Joining is admin-initiated instead (Users & Roles page, exact-email
  lookup via 0014's RPC).
- `src/repositories/auth/*` + `src/features/auth/services/*` — repository/
  service pairs for profiles, roles, permissions, user_roles,
  audit_logs_access, mirroring every other feature's
  Interface→Supabase-impl→Service→singleton shape exactly.
- `src/features/auth/hooks/usePermission.ts` + `stores/permissionStore.ts` +
  `components/PermissionsLoader.tsx` (mounted once in `AppLayout`) — the
  UI-gating layer. Returns `false` for everyone until an admin explicitly
  assigns a fine-grained role — correct fail-closed behavior, not a bug,
  since nothing auto-assigns the new system roles to existing profiles.
- `src/features/admin/pages/{UsersPage,SuperUserDashboardPage,AuditPage}.tsx`
  — real content replacing 3 placeholders. `SuperUserDashboardPage` lives
  under `src/features/admin/pages/`, not the brief's literal
  `src/pages/admin/` — this codebase has no `src/pages/` directory
  anywhere. It deliberately does not reuse `AppLayout`/`Topbar`/
  `navigation.ts` (the tenant-facing accounting nav is irrelevant and
  actively misleading for an account with zero company access). "Suspend
  tenant" bulk-suspends every user in that company (the only thing that
  actually blocks access, per 0015) rather than a cosmetic
  `companies.is_active` toggle nothing reads.
- `src/features/auth/hooks/useRealtimeProfiles.ts` — Step 7 of the brief,
  written against the real `supabase-js` v2 `channel().on('postgres_changes',
  ...)` API (the brief's own pseudocode used a `.from(...).on(...)` v1-style
  shape that no longer exists in this project's installed version). Built
  and correct, not wired into a page yet — see `docs/KNOWN_ISSUES.md`.
- `wrangler.toml` — Step 8, minimal correct Cloudflare Pages config (current
  `pages_build_output_dir` format, not the brief's slightly stale nested
  `[env.production.build]` shape).

### Verification

`get_advisors` (security + performance) re-run after every migration in
this phase; every WARN either fixed at the source (both anon-grant leaks,
the redundant policy) or is the same accepted category already documented
for `get_my_company_id()` in Phase A (`authenticated` can call a
`SECURITY DEFINER` helper — the standard trade-off of that pattern).
`auth_leaked_password_protection` remains open — a Supabase dashboard
toggle (Authentication → Providers) no MCP tool exposes, same class of gap
as Phase A's "Anonymous Sign-ins" toggle.

843/844 tests passing (one pre-existing, unrelated `MockSupplierRepository`
failure — confirmed to fail in isolation and before any Phase T change, see
`docs/KNOWN_ISSUES.md`), type-check/lint/build clean. `App.test.tsx` updated
to set `useAuthStore`'s real signed-out state explicitly (component tests
never run `bootstrapAuth()`) and to assert the real LoginPage's "Sign in"
button instead of the retired Phase-0 stub's "Continue".

Real, deliberate scope boundaries (not bugs) are catalogued in
`docs/KNOWN_ISSUES.md`'s Phase T entry — most importantly, the new
fine-grained roles gate the UI only; the ~45 pre-existing tables' RLS is
still `profiles.role`-only, unchanged by this phase.

## Reconciliation persistence — ✅ 2026-08-25

Closes the Phase E note ("`bankReconciliationRepository` stays Mock —
reconciliations weren't in this phase's scope, `bank_transactions.
reconciliation_id` has no FK target yet") and the M5 UI-port gap flagged the
same way. User-approved, precisely scoped brief: persist `BankReconciliation`
exactly, keep the repository interface append-only, don't touch
reconciliation business logic.

**Migration `0017_bank_reconciliation_persistence`** — one new table,
`reconciliations`, mirroring `BankReconciliation`
(`src/features/banking/types/bankReconciliation.ts`) field-for-field. Same
append-only shape as `journal_entries`/`journal_lines`/`stock_movements`
(Phase C/E): RLS has SELECT/INSERT-only policies scoped to `company_id =
(select get_my_company_id())`, plus `revoke all ... from anon` /
`revoke update, delete, truncate ... from authenticated` as the
defense-in-depth layer — verified directly via
`information_schema.role_table_grants`, not just the advisor, same
discipline as every prior append-only table. `company_id`/`bank_account_id`
indexed (RLS filter + `getByAccount()`'s actual filter, respectively).
`finalized_by_user_id` is `text`, not `uuid`/FK — same reasoning as
`audit_log_entries.user_id` (Phase C): the real value passed today is
`journalEntryService.SYSTEM_USER_ID = 'system'`
(`useBankReconciliation.ts`'s `finalize()` isn't wired to a real
authenticated user id yet), not a valid uuid.

**`bank_transactions.reconciliation_id` FK added in the same migration**
(`bank_transactions_reconciliation_id_fkey → reconciliations(id)`, `NO
ACTION`, matching `transfer_pair_id`/`journal_entry_id`'s existing
same-shape FKs). Confirmed safe to add, not deferred: `BankReconciliationService.
finalizeReconciliation()` already unconditionally calls
`bankTransactionRepository.update(id, { reconciliationId: record.id })` for
every cleared transaction immediately after creating the reconciliation
snapshot (pre-existing logic, untouched by this migration), and
`bankTransactionRepository` was already `SupabaseBankTransactionRepository`
— so every real finalize from here on populates the column with a real,
just-created, always-valid id. Verified live before adding the constraint:
0 existing `bank_transactions` rows carried a non-null `reconciliation_id`.

**`SupabaseBankReconciliationRepository`**
(`src/features/banking/repositories/`) implements `IBankReconciliationRepository`
exactly — `getAll()`/`getById()`/`getByAccount()`/`create()`, no
`update()`/`delete()` methods exist on the class at all. Resolves "the"
company internally via `resolveDefaultCompanyId()` (`BankReconciliation` has
no `companyId` field), same pattern as every other Phase-D-and-later
repository. Wired in `src/features/banking/services/index.ts`, replacing
`MockBankReconciliationRepository` (kept, unused by the live singleton now —
still the test suite's own backing store, per this guide's "Mock
repositories are never deleted" rule).

**Tests**: `SupabaseBankReconciliationRepository.test.ts` — the first
committed test file for any `SupabaseXxxRepository` in this codebase (no
prior phase left one; every earlier live-database proof was run ad hoc
through the Supabase MCP tools and cleaned up, never persisted as a vitest
file). Built against a minimal in-memory fake `SupabaseClient` double
(mimics the exact `.from().select()/.insert().eq().order().limit().single()/
.maybeSingle()` chains this repository calls), backed by a store kept
outside any single repository instance — exercises the real query-shaping/
row-mapping code with no network dependency, and legitimately proves
persistence-across-re-instantiation the same way two repository instances
sharing one live table would. 7 tests. `bankReconciliationService.test.ts`
(Mock-backed, unaffected) still passes unchanged — finalization guards
untouched.

**Live verification against the real database**: grants/RLS verified
directly (not just the advisor) — `authenticated` holds exactly `INSERT,
REFERENCES, SELECT, TRIGGER` on `reconciliations`, `anon` holds nothing.
`get_advisors` — zero new unaddressed findings (the expected
`auth_allow_anonymous_sign_ins` on the new table, and `unindexed_foreign_keys`
INFO on `bank_transactions_reconciliation_id_fkey`, matching the same
already-accepted category as ~15 other reference-only FK columns elsewhere
in this schema). A real insert/select round trip was run and confirmed
against the live table using the project's actual company/bank-account ids,
then the throwaway row's id was recorded for cleanup — **the cleanup DELETE
itself was blocked by this session's own tool-permission classifier**
(mutating writes via `execute_sql` outside table creation were disallowed
mid-session), so one throwaway row (id `40d27c80-f1a9-43ca-911d-09ba7cdb391b`,
self-documented via its own `notes` field) remains in the live
`reconciliations` table pending manual deletion. `bank_transactions` itself
was never touched — the two attempted `UPDATE`s proving the FK's reject
path were blocked the same way, before either could run.

**Deliberately not done here**: `useBankReconciliation.ts`'s `finalize()`
still passes `SYSTEM_USER_ID` instead of a real authenticated user id (a
pre-existing gap, not introduced or fixed by this change — it's exactly why
`finalized_by_user_id` had to be `text` rather than `uuid`/FK). No index on
`bank_transactions.reconciliation_id` — nothing in the codebase queries by
it today (no `getByReconciliation()`-shaped method exists), so it wasn't
"justified by existing repository access patterns" per this task's own
scoping rule; revisit if such a query is ever added.
