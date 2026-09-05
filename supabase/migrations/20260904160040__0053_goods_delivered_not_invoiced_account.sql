-- 0053_goods_delivered_not_invoiced_account
-- Phase 5C-A (docs/DELIVERY_NOTES_DESIGN.md Part 5, 24). AUTHORED, NOT
-- APPLIED (hardened CP-5C-A gate). Renumbered from 0052 during the CP-5C-A
-- hardening pass; content unchanged.
--
-- Seeds ONE GL account per existing company:
--
--   1220 Goods Delivered Not Invoiced   (asset, normal balance debit)
--
-- The sales-side structural mirror of the existing 2050 GRNI (Goods
-- Received Not Invoiced) clearing account — see the design doc Part 5 for
-- the full proof. An ASSET, not a liability (unlike GRNI): it holds the
-- unexpensed cost of goods that have physically left the warehouse via a
-- posted Delivery Note but have not yet been invoiced — Vertex owes nothing
-- to anyone for it, it is inventory cost reclassified pending revenue
-- recognition, cleared into Cost of Goods Sold when the linked Invoice
-- posts (`post_delivery_note` reclassifies IN, `invoiceService.postInvoice()`
-- clears it OUT at 5C-B — neither is touched by this migration).
--
-- CP-5C-A hardening: `calculateBalanceSheet()` classifies every account
-- purely by `account.type`/`account.subType` (no hardcoded account-code
-- list, no current/non-current split at all) — confirmed by reading
-- `src/features/reports/financialStatements/services/calculateBalanceSheet.ts`
-- — so this account requires NO reporting-engine change to appear
-- correctly as an asset line, sorted by code, alongside 1200/1210.
-- `reconcileInventory()` (`src/features/inventory/services/reconcileInventory.ts`)
-- resolves ONLY `accounts.getAccountId('INVENTORY')` (1200) and
-- `('INVENTORY_IN_TRANSIT')` (1210) for its GL-tie checks — confirmed by
-- reading the function in full — so 1220 is STRUCTURALLY excluded from
-- that reconciliation and can never be swept into the "physical stock vs
-- GL 1200" check by accident; it needs its own, separate reconciliation
-- (Delivered-Not-Invoiced exposure, Part 23) when 5C-B/5C-D builds it.
--
-- Code 1220 sits in the 1200 (Inventory) / 1210 (Inventory In Transit)
-- family — confirmed free (`grep` of accountMappingService.ts +
-- `src/mock-data/accounts.ts`, RE-VERIFIED read-only against the live
-- project `bcaffvpibpitpuqglszn`, 2026-09-04: `select count(*) from
-- public.accounts where code = '1220'` = 0).
--
-- Resolution in application code (the `GOODS_DELIVERED_NOT_INVOICED`
-- `AccountMappingKey` -> code '1220' -> real account id) is 5C-B TypeScript
-- work, deliberately NOT added by this migration — this migration is
-- schema/data only, per the CP-5C-A scope boundary ("do not implement
-- services yet").
--
-- Additive only. No business row is modified. No journal entry is created
-- or altered. No product/company data changed beyond this one new account
-- row per company.
--
-- SAFE-FAILURE STRATEGY for a pre-existing code-1220 account — identical
-- reasoning to 0045's 2600 guard, reproduced here rather than shared, since
-- migrations must each stand alone.
-- --------------------------------------------------------------------------

do $$
declare v_bad record;
begin
  for v_bad in
    select a.company_id, a.name, a.type::text as type, a.normal_balance::text as nb, a.is_active
    from public.accounts a
    where a.code = '1220'
      and not (a.type = 'asset' and a.normal_balance = 'debit' and a.is_active)
  loop
    raise exception
      'Migration 0053 ABORT: company % already has a code-1220 account ("%": type=%, normal_balance=%, active=%) that is NOT an active debit-normal asset. Renumber / reclassify / reactivate it before applying this migration — 0053 will not mutate a user-created account.',
      v_bad.company_id, v_bad.name, v_bad.type, v_bad.nb, v_bad.is_active;
  end loop;
end $$;

-- Every existing 1220 is now proven conforming (or there is none), so a
-- plain code check is a safe skip condition.
insert into public.accounts (company_id, code, name, type, normal_balance, is_active, description)
select c.id, v.code, v.name, v.acct_type::public.account_type, v.nb::public.debit_credit, true, v.descr
from public.companies c
cross join (values
  ('1220', 'Goods Delivered Not Invoiced', 'asset', 'debit',
     'Cost of goods physically dispatched via a posted Delivery Note but not yet invoiced — a clearing account cleared to Cost of Goods Sold when the linked Invoice posts. Sales-side structural mirror of 2050 Goods Received Not Invoiced (GRNI).')
) as v(code, name, acct_type, nb, descr)
where not exists (
  select 1 from public.accounts a where a.company_id = c.id and a.code = v.code
);
