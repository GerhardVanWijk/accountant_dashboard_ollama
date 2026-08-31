-- 0023_inventory_gl_accounts
-- Inventory Accounting Module — Phase 2. AUTHORED, NOT YET APPLIED (Review 2 gate).
--
-- Adds the three GL accounts the new module needs. The chart of accounts is
-- otherwise app-seeded per company (src/mock-data/accounts.ts) — no prior
-- migration inserts into public.accounts — so this migration seeds every
-- EXISTING company; new companies pick these up from the updated seed file.
--
--   5050 Inventory Adjustments  (expense)  — write-offs, shrinkage, damage, and
--        stock-take losses/gains. Both signs post here (a gain is a credit).
--        docs/INVENTORY_ARCHITECTURE.md §3.2: no variance account existed before.
--   1210 Inventory in Transit   (asset)    — stock dispatched on an inter-warehouse
--        transfer and not yet received.
--   3950 Opening Balance Equity (equity)   — suspense account for opening balances
--        captured after go-live (opening stock batches). Nets to zero once opening
--        balances are fully entered. No such account existed; Office National's
--        opening JE-0001 credited Retained Earnings / Share Capital directly.
--
-- Resolved in application code through NEW AccountMappingKeys
-- (INVENTORY_ADJUSTMENT / INVENTORY_IN_TRANSIT / OPENING_BALANCE_EQUITY) — never
-- a literal code or UUID in a posting service.

insert into public.accounts (company_id, code, name, type, normal_balance, is_active, description)
select c.id, v.code, v.name, v.acct_type::public.account_type, v.nb::public.debit_credit, true, v.descr
from public.companies c
cross join (values
  ('5050', 'Inventory Adjustments',   'expense', 'debit',
     'Write-offs, shrinkage, damage and stock-take losses/gains — inventory carrying-value adjustments that are not the cost of a sale.'),
  ('1210', 'Inventory in Transit',    'asset',   'debit',
     'Stock dispatched from one warehouse and not yet received at the destination on an inter-warehouse transfer.'),
  ('3950', 'Opening Balance Equity',  'equity',  'credit',
     'Suspense account for opening balances captured after go-live (opening stock, opening AR/AP). Should net to zero once opening balances are fully entered.')
) as v(code, name, acct_type, nb, descr)
where not exists (
  select 1 from public.accounts a where a.company_id = c.id and a.code = v.code
);
