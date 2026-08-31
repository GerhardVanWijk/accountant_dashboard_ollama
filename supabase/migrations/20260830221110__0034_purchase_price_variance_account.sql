-- 0034_purchase_price_variance_account
-- Inventory Accounting Module — Phase 3C. AUTHORED, then APPLIED 2026-08-30 under the
-- controlled Review 3C-A procedure (per-migration verification; recorded versions
-- 20260830221042..20260830221256). Additive; 0 business rows changed except the
-- journal_number_counters seed + the 5060 account seed.
--
--
-- Seeds ONE GL account, per existing company:
--
--   5060 Purchase Price Variance  (expense, normal balance debit)
--
-- WHY a dedicated account and not 5050 Inventory Adjustments:
--   * 5050 is the *physical* inventory story — shrinkage, damage, write-offs,
--     stock-take count differences: the carrying value changed because the
--     quantity on hand changed.
--   * 5060 is the *purchasing economics* story — the quantity did not change,
--     but the supplier settled a return (or a price) at a value different from
--     the weighted-average cost the units are carried at. On a supplier return
--     inventory leaves at WAC while Accounts Payable / input VAT unwind at the
--     supplier's actual credit note value; the gap is a purchasing gain or loss,
--     not a stock adjustment, and reporting keeps the two distinct.
--
-- Resolved in application code through the new `PURCHASE_PRICE_VARIANCE`
-- AccountMappingKey (src/features/accounting/services/accountMappingService.ts)
-- → code '5060' → the real account id. No literal code or UUID in a posting
-- service. New companies pick 5060 up from the updated seed file
-- (src/mock-data/accounts.ts).
--
-- Additive only. No business row is modified. Idempotent: a company that
-- already has a '5060' account (any name) is skipped.

insert into public.accounts (company_id, code, name, type, normal_balance, is_active, description)
select c.id, v.code, v.name, v.acct_type::public.account_type, v.nb::public.debit_credit, true, v.descr
from public.companies c
cross join (values
  ('5060', 'Purchase Price Variance', 'expense', 'debit',
     'Difference between a supplier''s actual credit/refund value on a return (or purchase) and the weighted-average carrying cost of the goods. A purchasing gain or loss — distinct from 5050 Inventory Adjustments, which covers physical stock differences (shrinkage, damage, write-offs, stock-take variances).')
) as v(code, name, acct_type, nb, descr)
where not exists (
  select 1 from public.accounts a where a.company_id = c.id and a.code = v.code
);
