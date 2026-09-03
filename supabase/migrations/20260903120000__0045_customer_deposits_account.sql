-- 0045_customer_deposits_account
-- Increment 4A — Customer Deposits / Prepayments / Contract Liability.
-- AUTHORED, NOT APPLIED (Review 4A-2 / 4A-3 gate).
--
-- NOTE ON NUMBERING: docs/db-changes/0044_september_2026_data.sql is a SEED
-- script (execution-only, not a schema migration); this migration takes 0045
-- and the allocation RPC + idempotency infra is 0046, so every number stays
-- unique across supabase/migrations/ and docs/db-changes/.
--
-- Seeds ONE GL account per existing company:
--
--   2600 Customer Deposits  (liability, normal balance credit)
--
-- Money received from a customer before it is earned or applied to an
-- invoice — a contract liability (IFRS 15). Distinct from Accounts
-- Receivable: AR is what the customer owes us; this is what we owe the
-- customer (goods/services or a refund) until an invoice absorbs it.
--
-- Resolved in application code through the new CUSTOMER_DEPOSIT
-- AccountMappingKey (src/features/accounting/services/accountMappingService.ts)
-- -> code '2600' -> the real account id. No literal code or UUID in any
-- posting service. New companies pick 2600 up from the updated seed file
-- (src/mock-data/accounts.ts).
--
-- Additive only. No business row is modified. No journal entry is created
-- or altered. NO historical customer_receipts are reclassified by this
-- migration (the R4,250 of legacy unapplied receipts, all Office National,
-- is handled by the separately-reviewed docs/db-changes/0045b_... script).
--
-- SAFE-FAILURE STRATEGY for a pre-existing code-2600 account
-- --------------------------------------------------------------------------
-- `accounts` has UNIQUE (company_id, code), so a company can hold at most one
-- account with code 2600. If any company already has a 2600 account that is
-- NOT an active credit-normal liability (e.g. it was created as an asset /
-- revenue / expense account, or was deactivated), silently resolving
-- CUSTOMER_DEPOSIT to it would post deposits to the wrong classification.
-- This migration therefore ABORTS with a clear message rather than proceed —
-- the operator must renumber / reclassify / reactivate the existing account
-- first. A company that already has a *conforming* 2600 (active, liability,
-- credit-normal — any name) is left untouched. This migration never mutates
-- a user-created account.

do $$
declare v_bad record;
begin
  for v_bad in
    select a.company_id, a.name, a.type::text as type, a.normal_balance::text as nb, a.is_active
    from public.accounts a
    where a.code = '2600'
      and not (a.type = 'liability' and a.normal_balance = 'credit' and a.is_active)
  loop
    raise exception
      'Migration 0045 ABORT: company % already has a code-2600 account ("%": type=%, normal_balance=%, active=%) that is NOT an active credit-normal liability. Renumber / reclassify / reactivate it before applying this migration — 0045 will not mutate a user-created account.',
      v_bad.company_id, v_bad.name, v_bad.type, v_bad.nb, v_bad.is_active;
  end loop;
end $$;

-- Every existing 2600 is now proven conforming (or there is none), so a plain
-- code check is a safe skip condition.
insert into public.accounts (company_id, code, name, type, normal_balance, is_active, description)
select c.id, v.code, v.name, v.acct_type::public.account_type, v.nb::public.debit_credit, true, v.descr
from public.companies c
cross join (values
  ('2600', 'Customer Deposits', 'liability', 'credit',
     'Amounts received from customers before they are earned or applied to an invoice (contract liability, IFRS 15). Cleared to Accounts Receivable when an invoice is issued and the deposit applied, or refunded.')
) as v(code, name, acct_type, nb, descr)
where not exists (
  select 1 from public.accounts a where a.company_id = c.id and a.code = v.code
);
