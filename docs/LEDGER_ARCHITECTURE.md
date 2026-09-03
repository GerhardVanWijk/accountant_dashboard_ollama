# Ledger Architecture

This is the foundation for `docs/HIVE_TASKS.md`'s Accounting Module (Wave 2): the
double-entry posting engine that Sales/Purchases/Banking will call into once GL
integration is wired up, and that the Chart of Accounts / Ledger / Trial Balance pages
(still placeholders — see below) will read from. It codifies standard double-entry
system-design patterns for this specific codebase, not a general accounting tutorial.

## Data model

Two tables, matching the header + lines shape every production ledger schema uses:

- **`Account`** (`src/types/account.ts`) — Chart of Accounts. Editable: rename,
  re-parent, activate/deactivate. `normalBalance: 'debit' | 'credit'` decides which side
  a "positive" balance is reported on.
- **`JournalEntry`** (`src/types/journalEntry.ts`) — a header row with `lines:
  JournalLine[]`, each line an `{ accountId, debit, credit }` pair. This is the "ledger
  entries as vectors" model: a posted entry is a vector of (account, signed amount)
  pairs that must sum to zero.

## The invariant, and where it's enforced

**Sum of debits must equal sum of credits, always.** `JournalEntryService` (`src/features/
accounting/services/journalEntryService.ts`) is the *only* place in the codebase allowed
to decide this — `validateLines()` checks it before anything is written, and
`postJournalEntry()` throws rather than posting an unbalanced entry. Sales, Purchases,
and Banking services all call `journalEntryService.postJournalEntry()` (real, wired —
see `billService.postBill()`, `invoiceService.postInvoice()`,
`creditNoteService.issueCreditNote()`, `customerReceiptService`,
`bankTransactionService`) rather than re-implementing the check.

**This is application-level enforcement only.** The mock repository is an in-memory
array — there's no database to also enforce the invariant with a `CHECK` constraint or
a trigger. That's fine for a single-writer mock, but it's a known gap: a real backend
must enforce this at the storage layer too (a `CHECK (sum(debit) = sum(credit)) `
per-transaction constraint, or a serializable DB transaction that validates before
commit), because application code alone cannot stop a second writer — a bug, a retried
request, a future backend endpoint that forgets to call the service — from inserting an
unbalanced entry directly. Track this as a backend requirement, not a "nice to have."

## Immutability: append-only, reversal not edit

`IJournalEntryRepository` (`src/features/accounting/repositories/`) has **no update() or
delete()** — the same shape as Inventory's `IStockMovementRepository`. A posted entry is
never mutated. To correct a mistake, `reverseJournalEntry()` posts a **new** entry with
every line's debit/credit swapped and `reversalOfEntryId` pointing at the original. The
original row's `status` field is never flipped to `'reversed'` after the fact — whether
an entry has been reversed is answered by asking `isReversed()` (does any other entry
reference it), not by mutating a field on the original.

This is the tamper-evident audit-trail pattern: ledger history always shows both the
mistake and the fix, never just the fix silently edited away. It also means every
`JournalEntryService` method is safe to call from concurrent UI without worrying about
lost updates, because there's nothing to update.

**Increment 4A:** `reverseJournalEntry()` also refuses to reverse an entry whose `source`
is owned by an AR/AP subledger (`invoice` / `bill` / `credit_note` / `customer_receipt` /
`customer_receipt_allocation` / `payment`) unless the caller passes
`{ allowSubledgerSourced: true }`. Reversing one of these straight from the general ledger
moves the GL but leaves `invoice.amountPaid` / a receipt's `allocations` / a credit note's
allocation untouched — a silent GL-vs-subledger split. Correction paths: `invoice` → a credit
note; `bill` → a supplier return or a compensating manual journal; issued credit notes,
customer receipts, payments and deposit allocations → a compensating manual journal
(`source: 'manual'`, unguarded). Nothing in the app programmatically reverses a guarded source
today — only the generic Journals-page button, which is exactly what this closes.

**Increment 4A — atomic deposit allocation:** applying a customer deposit to an invoice
(`DR 2600 / CR 1100` + both subledger updates) runs inside ONE Postgres function,
`apply_customer_deposit` (migration 0046), exactly like `post_inventory_transaction`.
Idempotency is keyed on a **UUID `allocationId` generated client-side before the RPC runs** —
`deposit_allocation_log` has `UNIQUE (company_id, allocation_id)`; the RPC's first step is
`INSERT … ON CONFLICT DO NOTHING RETURNING id`, and a null id returns the first result. Never
keyed on mutable state (an allocation count). The function then locks the **receipt then the
invoice** (fixed order — the only place both are locked together), re-validates the amount
against the *locked* rows, and does every write in the one implicit transaction. A retry or
concurrent double-submit of the same intent collapses to one posting; two genuinely different
intents serialise and each re-validates, so a stale client cannot over-draw a deposit or overpay
an invoice. CHECK constraints (`0 ≤ unallocated_amount ≤ amount`, `0 ≤ amount_paid ≤ total`)
enforce the money bounds at the storage layer regardless of caller.

`Account` rows are the deliberate exception — they're editable, because renaming or
deactivating an account doesn't rewrite history, it just changes how future postings and
the chart itself display. `AccountService.deleteAccount()` still guards against removing
an account with existing postings (`hasPostings()`), deactivating instead — the same
inactivate-not-delete pattern Customers/Suppliers use for records with linked history.

## Debits and credits as vectors

`JournalLine` stores `debit`/`credit` as two columns (inherited from Phase 0's
`src/types/journalEntry.ts`, and it's the natural shape for a dual-column GL table UI —
see `docs/FINANCIAL_UI_GUIDE.md`). But two columns are a display convenience, not how the
math should be *done*: internally, `JournalEntryService`'s private `debitVector(line)`
collapses each line to one signed number (`debit - credit`) — a vector with magnitude
(the amount) and direction (debit = positive, credit = negative, by this codebase's
convention). Every posted entry's lines sum to zero by construction, because
`validateLines()` already enforced that before the entry existed. `getAccountLedger()`
and `computeTrialBalance()` both work purely in this signed-vector space and only flip
the sign back to a human-friendly "the account went up/down" figure once, at the very
end, by multiplying by the account's `normalBalance` direction. This is the technique
described in Building a Robust Ledger: An Engineer's Guide to Double-Entry Accounting
(gitconnected/Level Up Coding) — juggling "is this a debit-normal or credit-normal
account, so do I add or subtract" at every step is exactly the bug-prone pattern the
vector framing avoids; this codebase does the sign-juggling exactly once, at the
boundary.

### Industry precedent (same article's survey of production ledgers)

| Company | Lesson | Where it already shows up here |
|---|---|---|
| Square ("Books") | Ledger is immutable, single source of truth | `IJournalEntryRepository` has no update()/delete() |
| Airbnb | Decouple the event source from the ledger; both product and payment events resolve to accounting entries | `postJournalEntry()`'s `source` field + the fact that Sales/Purchases/Banking call *into* the ledger rather than writing to it directly |
| Stripe | Track/trace money movement explicitly, not just the end balance | `getAccountLedger()` returns the full line-by-line trail, not just a final number |
| Uber | Ledger migrations need to run old/new systems in parallel for consistency | Not yet applicable — no legacy ledger to migrate from in this codebase |

## Reporting: trial balance & account ledger

`computeTrialBalance()` nets every posted line per account and reports the net on
whichever side matches `normalBalance`. `balanced` re-checks total debits vs. total
credits across the whole chart — if a correctly-posted-only ledger ever produces
`balanced: false`, that's a bug in the posting path, not a state reporting should accept
silently (this is exactly what the Wave 2 Trial Balance page needs to display and what
QA should assert on).

`getAccountLedger(accountId)` returns every posted line touching one account in date
order with a running balance, direction-adjusted by `normalBalance` — this is what the
General Ledger detail page (currently `LedgerPage.tsx`, a placeholder) will render.

## Accounting periods (docs/SA_ACCOUNTING_MASTER_SPEC.md §35/§68)

`postJournalEntry()` and `reverseJournalEntry()` both look up the `AccountingPeriod`
covering the entry's date (`findPeriodForDate()`,
`src/features/accounting/utils/periodLookup.ts`) and refuse to post unless its status
is `'open'` — no accounting period at all, or one that's `'soft_closed'`/`'closed'`/
`'locked'`, both reject with a clear error. `AccountingPeriodService` owns the
open→closed→locked lifecycle; `reopenPeriod()` specifically requires a non-empty reason
and is the only way to move a period back to `'open'`. There is currently no
distinction between "normal user" and "authorized override" when it comes to *who* can
post into a soft-closed period, because this app has no real roles/permissions system
yet (`docs/SA_SPEC_GAP_ANALYSIS.md`) — every non-open status blocks equally for now.

## Audit trail (docs/SA_ACCOUNTING_MASTER_SPEC.md §37)

Every `postJournalEntry()` and `reverseJournalEntry()` call, and every
`AccountingPeriodService`/`FinancialYearService`/`CompanyService` state transition,
writes an `AuditLogEntry` via the shared `auditLogService`
(`src/services/auditLogService.ts` — top-level, not owned by one feature, since
Accounting/Sales/Purchases/Banking/Admin all write to it). Its repository
(`IAuditLogRepository`) has no `update()`/`delete()`, matching the same append-only
shape as the ledger itself. `userId` is supplied by the caller — there is no real
authenticated session yet (`src/stores/authStore.ts` is a boolean stub), so
`JournalEntryService` falls back to a `SYSTEM_USER_ID` sentinel when no real user id is
passed. IP/session metadata (also called for by §37) isn't captured, for the same
reason — that requires a real backend session, which doesn't exist in this
browser-only SPA yet.

## Known gaps (deliberately out of scope here)

- **Multi-currency FX translation.** `JournalEntry` gained an entry-level `currency`
  field 2026-08-22 (`postJournalEntry()` always populates it, defaulting to `'ZAR'`),
  so a posting is no longer implicitly single-currency — it's explicit. What's still
  NOT built: a genuine foreign-currency transaction (a USD invoice against a ZAR
  functional currency, say) needs a per-line transaction-currency + exchange-rate pair
  and realized/unrealized FX gain/loss treatment — that translation engine is Phase 12
  (Advanced/IFRS) scope, not attempted here.
- **No UI yet** — resolved in Wave 2 (Accounting Bee): `ChartOfAccountsPage`,
  `JournalsPage`, `LedgerPage`, `TrialBalancePage` are real pages now, not placeholders.
- **Sales/Purchases don't post yet** — resolved in Wave 1b (2026-08-21):
  `billService.postBill()`, `invoiceService.postInvoice()` (via `markInvoiceAsSent()`),
  `creditNoteService.issueCreditNote()`, and `customerReceiptService` all post real,
  balanced entries through `journalEntryService.postJournalEntry()` with fixed
  account-mapping constants (e.g. `acc_1100` AR, `acc_4000` Sales Revenue, `acc_2100`
  VAT Output — see each service file). Account mapping is still hard-coded per service,
  not a configurable mapping table — see `docs/SA_SPEC_GAP_ANALYSIS.md`.
- **AI-generated financial logic still needs human/QA review before it's trusted**,
  same as every other module in this codebase — the existing qa-bee re-verification
  step (`docs/HIVE_TASKS.md`, `[[accounting-hive-workflow]]`-style independent
  re-checking) is the control for that, not a new one introduced here.

## What ships in this pass

- `src/features/accounting/repositories/{IAccountRepository,MockAccountRepository,
  IJournalEntryRepository,MockJournalEntryRepository}.ts`
- `src/features/accounting/services/{accountService,journalEntryService}.ts` +
  `index.ts` singleton wiring
- `src/mock-data/{accounts,journalEntries}.ts` seed data (a coherent starter Chart of
  Accounts + one balanced opening-balance entry)
- `JournalEntry.reversalOfEntryId?: ID` — a new optional field on an existing type
  (backward compatible; flagged here per `docs/DO_NOT_BREAK.md`'s "don't change core
  type shapes without discussion")
- Tests: `journalEntryService.test.ts` (21 cases: balance validation, posting,
  reversal, trial balance, account ledger) and `MockJournalEntryRepository.test.ts`
  (including a caught-and-fixed real bug: `getAll()`/`getById()` originally returned
  the live `lines` array by reference, letting a caller mutate posted ledger history in
  place — now deep-copied)
