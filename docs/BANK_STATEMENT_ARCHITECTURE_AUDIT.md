# Bank Statement / Reconciliation Architecture — Audit & Migration Proposal (Agent 11, 2026-08-28)

Investigation for `docs/CURRENT_TASKS.md` → `BANK_STATEMENT_RECONCILIATION_AND_FORM_SYSTEM` PART 0.1–0.4.
Read-only. No DDL/DB writes performed. Schema facts pulled live 2026-08-28.

## Headline

- **No bank-statement entity exists anywhere.** The only banking/reconciliation tables are
  `bank_accounts`, `bank_transactions`, `reconciliations` (0 rows, never used), `reconciliation_issues`.
  No statement table, no statement-line table, no import/batch table, no documents/attachments table.
- **An import = N loose `bank_transactions` rows with `source='import'`.** No statement identity, no
  batch id, no way to answer "which lines came from which file". `ParsedStatementLine.sourceRowId`
  (which would enable dedup) is **not persisted** — only `reference`.
- **Statement metadata is discarded at parse time.** Opening/closing balances (MT940 `:60F:`/`:62F:`,
  OFX `<LEDGERBAL>`/`<DTSTART>`/`<DTEND>`) are never read. No raw row is retained. No balance validation
  (PART L is entirely unbuilt).
- **`reconciliation_issues` evidence is prose, not data** — `{label, detail?}` strings. Every number the
  detectors compute (`diffCents`, `daysApart`, `descOverlap`, `reference_similarity`, …) is folded into a
  sentence and thrown away. None of the user's requested structured fields exist.
- **Investigator dedupe is broken in production** — `staleOpenIssues = existing.filter(i => i.statementDate === statementDate …)` string-compares against a `timestamptz` column, so re-runs pile up duplicates.
- Parsers for **CSV / OFX / QIF / MT940** are real and format-specific (`statementParsers.ts`). Import is
  **non-destructive** — never calls `journalEntryService`; GL posting is a separate `allocateTransaction()` step.
- Bad rows: any malformed row throws and **the whole file is abandoned** — no per-row skip, no error list.

## Live schema (condensed — full column tables in Agent 11 transcript)

`bank_accounts`: id, company_id (FK CASCADE), name, bank_name, account_number (unique per company),
account_type enum, currency, opening_balance, current_balance (= true GL 1000 bal), gl_account_id (FK),
status, branch_code, swift_code, timestamps.

`bank_transactions` (94 rows ON): id, company_id, bank_account_id, **date** (single — no value_date),
description, reference (free text — the only "external ref"), amount (magnitude), direction enum
(`debit`=money IN — inverted vs bank convention), status enum (`unreconciled|matched|reconciled`),
matched_entity_id (**no FK**), category, source enum (`manual|transfer|import`, **nullable, no default**),
journal_entry_id (FK), transfer_pair_id (self-FK), reconciliation_id (FK, migration 0017), allocations
jsonb. **No hash / unique key usable for import dedup.**
Missing for a real statement line: `statement_id, sequence, value_date, running_balance,
external_bank_ref_id, raw_source_payload, imported_at/by, line-level state`.

`reconciliations` (0 rows): a **finalized-reconciliation snapshot** (append-only, grants revoked, like
`journal_entries`) — NOT a statement. id, company_id, bank_account_id, statement_date (single),
statement_balance (closing only), gl_cashbook_balance, adjusted_bank_balance, variance,
cleared/unpresented/uncleared id arrays (jsonb), finalized_at, finalized_by_user_id (**text**), notes.
No opening balance, no filename, no currency, no line children, no import status, no checksum.

`reconciliation_issues`: id, company_id, bank_account_id, statement_date, issue_type enum (14),
severity enum (5), confidence int CHECK 0..100, effect_amount, affected_date_from/to,
related_bank_transaction_ids uuid[], related_journal_entry_ids uuid[], related_source_document_ids
uuid[] (**always empty — no target table**), explanation text, evidence **jsonb** `[{label, detail?}]`,
suggested_resolution text, auto_resolution_safe bool, status enum (4), resolution_* fields. Mutable CRUD.

### Enums
- `bank_transaction_source`: `manual | transfer | import` — **no `bank`** (the expectations doc's "source `bank`" = `journal_entries.source`, a different enum).
- `bank_transaction_status`: `unreconciled | matched | reconciled`.
- `bank_account_type`: `checking | savings | credit_card | cash | money_market | foreign_currency`.
- `reconciliation_issue_type` (14): date_offset_timing, amount_mismatch, transposition_error, duplicate_transaction, missing_bank_side, missing_ledger_side, grouped_match, combination_match, wrong_sign, wrong_bank_account, vat_difference, rounding_variance, opening_balance_discrepancy, edited_after_reconciliation.
- `reconciliation_issue_severity` (5): info, low, medium, high, critical.
- `reconciliation_issue_status` (4): open, reviewed, dismissed, resolved.

### RLS
`bank_accounts` / `bank_transactions`: `_all_own_company` ALL, role `{authenticated}`, `company_id = (select get_my_company_id())`.
`reconciliation_issues`: `_all_own_company` ALL, role `{public}`.
`reconciliations`: SELECT + INSERT only (UPDATE/DELETE revoked, anon revoked), role `{public}`.
**Inconsistency to flag:** `reconciliations` / `reconciliation_issues` use `{public}`; the account/txn tables use `{authenticated}`. New tables → `{authenticated}`.

## Office National data state (post-cleanup 2026-08-28)

| table | count | detail |
|---|---|---|
| bank_accounts | 1 | `2fb81a17-92b6-4936-9925-456a73a91cd1` |
| bank_transactions | 94 | `source='manual'` **87**, `source='import'` **7**, `reconciliation_id` set on **0** |
| reconciliations | 0 | finalize flow never run |
| reconciliation_issues | **11** (golden batch, restored) | Queen deleted 16 stray confidence-40 `missing_bank_side` rows created by live investigator runs 2026-08-28 09:11–10:42 (contamination). The 08:49 batch of 11 = the documented golden set. |

**The 7 `source='import'` rows** = scenarios C4 (185.50), C5 (62.10), C11 (95.00 + 310.40), C12 (42.00 +
118.50 + 64.75). **Every other scenario bank leg the expectations doc describes (C2c, C3, C6, C7, C9,
C10) plus the ~81 clean matches is seeded as `source='manual'`** — so the investigator's two-sided
`import`-vs-`non-import` model does not actually work against the current seed. Part J must resolve this.

## Recommended smallest additive migration (0020) — DDL SKETCH, not applied

Two new tables + one nullable column + three enums. **No change to any existing column. The 94 rows
keep working unchanged.**

```sql
create type bank_statement_import_status as enum ('draft','parsed','imported','failed','reversed');
create type bank_statement_recon_status  as enum ('not_started','in_progress','reconciled');
create type bank_statement_line_state    as enum ('unmatched','matched','explained','ignored');

create table public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id),
  reference text,
  source_filename text,
  source_format text,                 -- csv | ofx | qif | mt940 | manual
  period_start timestamptz not null,
  period_end   timestamptz not null,
  opening_balance numeric not null,
  closing_balance numeric not null,
  currency text not null default 'ZAR',
  line_count integer not null default 0,
  import_status bank_statement_import_status not null default 'draft',
  reconciliation_status bank_statement_recon_status not null default 'not_started',
  content_hash text,
  imported_at timestamptz,
  imported_by text,                    -- text, matches reconciliations.finalized_by_user_id
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, bank_account_id, content_hash)
);

create table public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_statement_id uuid not null references public.bank_statements(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id),
  sequence integer not null,
  txn_date timestamptz not null,
  value_date timestamptz,
  description text not null,
  reference text,
  external_ref_id text,               -- OFX FITID / MT940 ref / CSV row id
  amount numeric not null,            -- magnitude
  direction debit_credit not null,    -- reuse existing enum
  running_balance numeric,
  raw_source jsonb not null default '{}',
  line_state bank_statement_line_state not null default 'unmatched',
  matched_bank_transaction_id uuid references public.bank_transactions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- + partial unique (bank_account_id, external_ref_id) where external_ref_id is not null
);

alter table public.bank_transactions
  add column bank_statement_line_id uuid references public.bank_statement_lines(id);
```
RLS: `enable row level security` + one `_all_own_company` policy per table, role `{authenticated}`,
`get_my_company_id()`. Recommend **mutable** (not append-only) — `import_status`/`reconciliation_status`
are a real lifecycle. Indexes: `company_id`, `bank_account_id`, `bank_statement_id`,
`matched_bank_transaction_id`.

## Reconciliation evidence model — what to add

1. **Structured `evidence_data jsonb`** (or a child table): `detector_type`, `detector_version`,
   `amount_difference_cents`, `date_difference_days`, `reference_similarity` (0–1), `same_counterparty`,
   `same_direction`, `same_bank_account`, `candidate_source_type` (`bank_transaction|journal_entry|statement_line`),
   `candidate_source_id`, `variance_explained_cents`, and the confidence factor breakdown as data:
   `[{ key, label, points, max_points, met, observed_value }]`. Keep prose `evidence[]` as a rendered view.
2. **Confidence as a derived, inspectable function** — persist `confidence_max` + the factor array so the
   UI can show "62/100 — 3 of 6 factors met" and list the unmet ones. Version the weight table.
3. **Deterministic ranking key** — replace the confidence-only `Array.sort` (non-stable, `created_at`
   tiebreak) with `ORDER BY confidence DESC, ABS(effect_amount) DESC, issue_type ASC, <smallest related id> ASC`.
4. **Real target for `related_source_document_ids`** — a documents table, or drop the column.
5. **Feed `bank_statement_lines` as the bank side** (not `source='import'` bank_transactions) — removes
   the manual/import ambiguity producing confidence-40 false positives.
6. **Stable idempotency key** on issues (`detector_type` + sorted related ids + `statement_date::date`)
   — fixes the broken supersede dedupe.

## Decisions needed (Agent 11's 7 flags)

1. ~~Delete the 16 stray confidence-40 `reconciliation_issues` rows~~ — **DONE by Queen** (contamination cleanup).
2. **`manual` vs `import` for Office National Part J:** (a) minimal — 7 statement lines from the current
   `import` rows only (under-represents scenarios); (b) faithful — also create statement lines for the
   bank legs of C2c/C3/C6/C7/C9/C10 + the ~81 clean matches, either as new `bank_statement_lines` rows
   (from the expectations-doc bank-side figures) or by reclassifying `bank_transactions.source`
   `manual→import` (mutates existing data). **Recommend (b) via new `bank_statement_lines` rows, not reclassification.**
3. **Statement table mutability:** append-only vs mutable CRUD. Recommend **mutable**.
4. **RLS role:** new tables use `{authenticated}` (not `{public}`). Confirm.
5. **`reconciliation_issues.related_source_document_ids`:** add a documents table or drop the column.
6. **Investigator dedupe bug** — fix regardless of schema work (date-normalised or idempotency key).
7. **`bank_transactions.matched_entity_id`** — no FK, no clear consumer. Clarify intent.
