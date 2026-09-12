-- 0107_tax_payment_clearing_accounts
-- Tax & Compliance integrity audit — migration-review addendum, §3 (Tax ↔
-- Banking duplicate-post review). AUTHORED, NOT APPLIED. Apply AFTER 0007
-- (companies/accounts exist) — independent of 0099-0106, but numbered
-- after them since it was authored as a direct consequence of reviewing
-- them.
--
-- THE DEFECT THIS CLOSES. As authored, `pay_provisional_tax` (0101) posted
-- DR Income Tax Payable / CR Cash and Bank directly, and
-- `_post_dividend_transition` (0102)'s pay()/remit() legs posted CR Cash
-- and Bank directly for the net-to-shareholders and SARS-remittance
-- amounts. Both are the EXACT same defect class the Leases + Payroll
-- integrity audit already found and fixed (see 0085's header): a direct
-- credit to Cash and Bank at the moment the OBLIGATION is recognised,
-- rather than at the moment the real EFT is recorded, means that when the
-- real SARS/dividend payment later appears in an imported bank statement
-- (or is captured as a Direct Payment in Banking), allocating/reconciling
-- it posts a SECOND journal against Cash and Bank for the SAME physical
-- payment — double-counting the cash outflow. Every OTHER cash-touching
-- subledger in this codebase that settles later already uses a two-step
-- clearing pattern; Provisional Tax and Dividends Tax were the only two
-- NEW posting paths in this migration set that skipped straight to Cash,
-- reproducing the identical bug Leases/Payroll already had before 0085.
--
-- Seeds TWO new GL clearing/payable accounts per existing company (mirrors
-- 0085's precedent exactly):
--
--   2270 Provisional Tax Payment Clearing   (liability, normal balance credit)
--   2520 Dividends Payment Clearing         (liability, normal balance credit)
--
-- From this review onward, `pay_provisional_tax` (0101) and
-- `_post_dividend_transition` (0102) both REJECT a line that posts
-- directly to a bank account's own GL account (see those migrations'
-- "BANKING FIX" additions) — the actual EFT (to SARS, or to shareholders)
-- is recorded exactly once, through the EXISTING Banking module (a Direct
-- Payment, or an allocated imported statement line) against these SAME
-- clearing accounts. Vertex does not gain a second banking system; these
-- two tax postings simply start behaving like every other subledger that
-- already settles through Banking.
--
-- Code 2270 sits beside 2250/2260 (payroll's Net Pay Payable /
-- Provisional-family liabilities) and just before 2300 Income Tax
-- Payable — the natural home for "a clearing account for a payment made
-- AGAINST Income Tax Payable before the final liability is struck". Code
-- 2520 sits directly after 2510 Dividends Tax Payable, beside 2500
-- Dividends Payable. Both confirmed free live (queried
-- `public.accounts.code` directly against the Vertex project — zero rows
-- for either code, in either company) and free of any reference anywhere
-- in `src/` at authoring time.
--
-- KNOWN LIMITATION, DELIBERATELY NOT BUILT HERE (documented, not silently
-- worked around): Payroll/Leases ALSO gained a dedicated over-settlement-
-- proof settlement RPC + `subledger_settlements` ledger (migrations
-- 0095/0096/0097) in a LATER, separate hardening pass, on top of the
-- clearing-account fix — because many independent obligations (many
-- payroll runs / many lease periods) share ONE clearing account, and nothing
-- at the database layer capped how much of ONE SPECIFIC obligation a bank
-- allocation could settle. The identical "many obligations share one
-- clearing account" shape applies here too (many provisional tax
-- slots / many dividend declarations all clear through these same two
-- accounts over time). This migration closes the DUPLICATE-POSTING defect
-- (the thing §3 of the audit asked about — Cash and Bank being credited
-- twice for one real payment) by routing the obligation through a clearing
-- account instead of Cash directly; it does NOT add the finer-grained
-- over/under-settlement-tracking RPC layer 0095-0097 later added for
-- Payroll/Leases. Recommended follow-up, flagged in the audit's final
-- report, out of scope for this pass: `settle_provisional_tax_payment(...)`
-- / `settle_dividend_declaration_payment(...)` RPCs mirroring
-- `settle_payroll_net_pay` (0096), keyed off
-- `provisional_tax_payment_log.id` / `dividend_declaration_posting_log.id`
-- (already unique per obligation — first/second/topUp slot, or
-- pay/remit transition — see those tables' own unique constraints, 0101/0102)
-- as the `subledger_settlements.source_id`.
--
-- Additive only. No business row is modified. No journal entry is created
-- or altered. No product/company data changed beyond these two new account
-- rows per company. Same "do not mutate a user-created account with the
-- same code" safe-failure strategy as 0045/0053/0085.

do $$
declare v_bad record;
begin
  for v_bad in
    select a.company_id, a.code, a.name, a.type::text as type, a.normal_balance::text as nb, a.is_active
    from public.accounts a
    where a.code in ('2270', '2520')
      and not (a.type = 'liability' and a.normal_balance = 'credit' and a.is_active)
  loop
    raise exception
      'Migration 0107 ABORT: company % already has a code-% account ("%": type=%, normal_balance=%, active=%) that is NOT an active credit-normal liability. Renumber / reclassify / reactivate it before applying this migration — 0107 will not mutate a user-created account.',
      v_bad.company_id, v_bad.code, v_bad.name, v_bad.type, v_bad.nb, v_bad.is_active;
  end loop;
end $$;

insert into public.accounts (company_id, code, name, type, normal_balance, is_active, description)
select c.id, v.code, v.name, v.acct_type::public.account_type, v.nb::public.debit_credit, true, v.descr
from public.companies c
cross join (values
  ('2270', 'Provisional Tax Payment Clearing', 'liability', 'credit',
     'Clearing/payable account credited when a provisional tax slot (first/second/top-up) is recorded as paid — cleared to zero when the actual SARS EFT is recorded/matched through Banking. Never credited by Cash and Bank directly (see migration 0107 / pay_provisional_tax''s "BANKING FIX", 0101).'),
  ('2520', 'Dividends Payment Clearing', 'liability', 'credit',
     'Clearing/payable account credited by both the dividend payment leg (net amount to shareholders) and the Dividends Tax remittance leg (amount to SARS) — cleared to zero when the actual EFT is recorded/matched through Banking. Never credited by Cash and Bank directly (see migration 0107 / _post_dividend_transition''s "BANKING FIX", 0102).')
) as v(code, name, acct_type, nb, descr)
where not exists (
  select 1 from public.accounts a where a.company_id = c.id and a.code = v.code
);
