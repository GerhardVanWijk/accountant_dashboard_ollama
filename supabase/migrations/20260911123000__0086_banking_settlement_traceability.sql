-- 0086_banking_settlement_traceability
-- Leases + Payroll accounting-integrity hardening (PART 3 — Banking/payment
-- architecture). AUTHORED, NOT APPLIED. Apply AFTER 0085 (this migration's
-- comment references the clearing accounts it seeds).
--
-- Adds ONE column: `bank_transactions.matched_entity_type` (text, nullable).
--
-- `bank_transactions.matched_entity_id` has existed since 0006 (Phase E)
-- with the doc comment "Journal entry or invoice/bill payment this
-- transaction was matched to" — but no service in this codebase has ever
-- populated it, and `BankTransactionDetailSheet.tsx` explicitly does NOT
-- render it as a related-record link, with a comment noting "no service
-- ever populates a human-readable label for it... a link here would either
-- be fake or silently wrong." Rather than invent a brand-new linking table
-- (a second, parallel traceability mechanism the brief explicitly warns
-- against), this migration finishes wiring up the column that was already
-- there for exactly this purpose: `matched_entity_type` distinguishes WHAT
-- `matched_entity_id` points at, so the UI can finally resolve it safely.
--
-- Values written exclusively by the atomic settlement RPCs
-- (`settle_payroll_net_pay` / `settle_lease_period_payment`, 0096/0097 —
-- FINAL HARDENING pass, superseding this migration's original plan of a
-- TypeScript-side `subledgerSettlementService` two-step write, which had
-- no database-level protection against over-settlement): 'payroll_run'
-- (matched_entity_id -> payroll_runs.id, one obligation per whole run) and
-- 'lease_amortization_entry' (matched_entity_id ->
-- lease_amortization_entries.id — NOT lease_contracts.id: FINAL HARDENING
-- PART B tracks a lease's clearing balance per amortization PERIOD, not as
-- one cumulative figure per lease, so each settlement points at the
-- specific period row it clears). This is the "bank transaction -> payment/
-- clearing transaction -> payroll run or lease period" traceability chain
-- the audit's Banking section calls for — one hop, on an existing column,
-- not a new subsystem. No FK is added (the target table depends on
-- `matched_entity_type`, which plain Postgres FKs cannot express) — same
-- "documented convention, not an enforced constraint" tradeoff
-- `journal_entries.source` already accepts in this schema for the
-- identical reason.
--
-- Additive only, nullable, no default-value backfill needed (every
-- pre-existing row keeps matched_entity_type = null, meaning "not linked to
-- a subledger settlement", the correct reading for a row written before
-- this feature existed).

alter table public.bank_transactions
  add column if not exists matched_entity_type text;

comment on column public.bank_transactions.matched_entity_type is
  'What matched_entity_id refers to: currently ''payroll_run'' (-> payroll_runs.id) or ''lease_amortization_entry'' (-> lease_amortization_entries.id, one specific period). Null for a transaction not linked to a subledger settlement. See migrations 0086/0096/0097.';

create index if not exists bank_transactions_matched_entity_idx
  on public.bank_transactions (company_id, matched_entity_type, matched_entity_id)
  where matched_entity_type is not null;
