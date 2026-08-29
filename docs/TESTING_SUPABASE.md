# Testing against Supabase — fail-closed rules

## Why this exists

Phase 21 incident **"JE-0171"**: a subagent exercised the real, live-wired
`bankTransactionService` singleton from a test. That singleton is
constructed in `src/features/banking/services/index.ts` with the shared
`supabase` client, which points at the **production** project. The test
called a mutating method and posted a **duplicate journal entry to
production** — it moved Bank GL + AR, flipped an unreconciled bank
transaction to `matched`, and destroyed a deliberately-seeded
reconciliation training scenario. Books stayed globally balanced, so no
cheap integrity check caught it.

`npm test` is meant to be **network-independent**. No committed test needs
a live Supabase connection.

## The three layers of protection

### (a) Global test mock — primary — `tests/setup.ts`

`vi.mock('@/config/supabase', …)` in the Vitest `setupFiles` entry applies
to **every** test file. It replaces `supabase` with a `Proxy` that
**throws on any property access or call**:

> Live Supabase client accessed from a test. Use a mock repository
> (`Mock*Repository`) or an in-memory fake …

So any test — existing or future — that touches the real client (directly,
or transitively through a service barrel / hook / page) fails **loudly and
immediately**, with zero per-test opt-in.

### (b) Load-time guard — defense in depth — `src/config/supabase.ts`

Before `createClient`, `isTestContext()` checks `import.meta.env.MODE ===
'test'` / Vitest's `VITEST` flag. In a test context, if
`VITE_TEST_SUPABASE_URL` is **not** set (or equals the production
`VITE_SUPABASE_URL`), construction **throws immediately**. It never falls
back to the production env vars.

This never fires for `MODE === 'development'` or `MODE === 'production'` —
the real app is unaffected.

### (c) The integration-test door — `getTestSupabaseClient()`

If a live integration test is ever genuinely needed:

1. Create a **throwaway, non-production** Supabase project.
2. Put its URL/key in `.env.local` (or the CI env) as:
   ```
   VITE_TEST_SUPABASE_URL=https://<throwaway-ref>.supabase.co
   VITE_TEST_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
   It **must differ** from `VITE_SUPABASE_URL`.
3. In the test, get the client through
   `getTestSupabaseClient()` (from `@/config/supabase`) — but note the
   global mock in (a) shadows the module, so a real integration test must
   `vi.importActual('@/config/supabase')` (or live in a separate Vitest
   project without `tests/setup.ts`).

Absent `VITE_TEST_SUPABASE_URL`, every path **fails closed**.

## Writing a normal test that needs the Supabase surface

- Inject a `Mock*Repository` (there is one for every repository) or an
  in-memory fake into the service under test — see
  `SupabaseBankReconciliationRepository.test.ts` for the fake-client
  pattern.
- Or add a **per-file** `vi.mock('@/config/supabase', () => ({ supabase: {
  auth: { signOut: vi.fn() } } }))` with just the surface you need — this
  overrides the global mock for that file. The auth page tests
  (`App.test.tsx`, `user-menu.test.tsx`, `OnboardingPage.test.tsx`,
  `SettingsPage.test.tsx`) already do this.

## Destructive / seed / demo tooling — `src/config/writeTargetGuard.ts`

There is **no** live-write tooling in this repo today (every `src/mock-data/`
and `testFixtures/` file is pure in-memory data). If any is ever added it
must call `assertDemoWriteTarget()` / `assertDestructiveResetAllowed()`
first, which require:

- `VERTEX_DB_TARGET=demo` (or `local`) — unset/`production` ⇒ refuse.
- resolved write URL ≠ `VITE_SUPABASE_URL` (production).
- resolved write URL is a local stack **or** exactly matches
  `VERTEX_DEMO_SUPABASE_URL`.
- destructive resets additionally require
  `VERTEX_ALLOW_DESTRUCTIVE_RESET=yes`.

"Credentials are present" is **never** treated as "safe to write".
