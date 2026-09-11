-- 0085_payroll_lease_clearing_accounts
-- Leases + Payroll accounting-integrity hardening (PART 3 of the audit —
-- Banking/payment architecture). AUTHORED, NOT APPLIED.
--
-- Seeds TWO new GL clearing/payable accounts per existing company (mirrors
-- 0053's one-new-account precedent, doubled up):
--
--   2250 Net Pay Payable            (liability, normal balance credit)
--   2460 Lease Payment Clearing     (liability, normal balance credit)
--
-- WHY THESE ACCOUNTS EXIST (see 0091/0089's headers for the posting-side
-- half of this fix): before this migration, `payrollRunService.postPayrollRun()`
-- let the caller credit net pay straight to Cash and Bank (1000) by
-- default, and `leaseAmortizationService.runAmortization()` ALWAYS credited
-- Cash and Bank directly for the monthly lease payment — see
-- `docs/SA_SPEC_GAP_ANALYSIS.md`'s own "No separate 'mark payroll as paid'
-- settlement step" admission. Every OTHER cash-touching subledger in this
-- codebase that settles later (Bills -> Payment, Invoices -> Customer
-- Receipt) already uses a two-step clearing pattern (post the liability,
-- THEN a separate, later step clears it to Cash) — Leases and Payroll were
-- the only two posting paths that skipped straight to Cash, which is
-- exactly the shape of bug that lets the real bank statement (imported or
-- captured later in Banking) get allocated against the SAME disbursement a
-- second time, double-counting it in the GL.
--
-- From 0089/0091 onward, `post_payroll_run` and `post_lease_amortization_period`
-- both REQUIRE the contra/payment leg to be one of these two accounts (or
-- another liability-type account — never Cash and Bank, enforced at the RPC
-- layer, not just in TypeScript). The actual disbursement is then recorded
-- exactly once, through the EXISTING Banking module (a Direct Payment, or
-- an allocated imported statement line) against this SAME clearing account
-- — see 0086 for the traceability link this closes with. Vertex does not
-- gain a second banking system; Leases and Payroll simply start behaving
-- like every other subledger that already settles through Banking.
--
-- Code 2250 sits in the 2200-2240 payroll-liability family (PAYE/UIF/SDL/
-- Other Deductions Payable) as the natural next code; 2460 sits beside 2450
-- Lease Liability. Both confirmed free by grep of accountMappingService.ts
-- + src/mock-data/accounts.ts (no existing use of either code anywhere in
-- this codebase).
--
-- Additive only. No business row is modified. No journal entry is created
-- or altered. No product/company data changed beyond these two new account
-- rows per company.
--
-- SAFE-FAILURE STRATEGY for a pre-existing 2250/2460 account — identical
-- reasoning to 0045/0053's guard, reproduced here rather than shared, since
-- migrations must each stand alone.

do $$
declare v_bad record;
begin
  for v_bad in
    select a.company_id, a.code, a.name, a.type::text as type, a.normal_balance::text as nb, a.is_active
    from public.accounts a
    where a.code in ('2250', '2460')
      and not (a.type = 'liability' and a.normal_balance = 'credit' and a.is_active)
  loop
    raise exception
      'Migration 0085 ABORT: company % already has a code-% account ("%": type=%, normal_balance=%, active=%) that is NOT an active credit-normal liability. Renumber / reclassify / reactivate it before applying this migration — 0085 will not mutate a user-created account.',
      v_bad.company_id, v_bad.code, v_bad.name, v_bad.type, v_bad.nb, v_bad.is_active;
  end loop;
end $$;

insert into public.accounts (company_id, code, name, type, normal_balance, is_active, description)
select c.id, v.code, v.name, v.acct_type::public.account_type, v.nb::public.debit_credit, true, v.descr
from public.companies c
cross join (values
  ('2250', 'Net Pay Payable', 'liability', 'credit',
     'Clearing/payable account credited when a payroll run posts net pay for later disbursement — cleared to zero when the actual EFT batch is recorded/matched through Banking. Never credited by Cash and Bank directly (see 0089/0091).'),
  ('2460', 'Lease Payment Clearing', 'liability', 'credit',
     'Clearing/payable account credited each period by lease amortization (0089_lease_amortization_rpc) for the interest+principal cash portion of the lease payment — cleared to zero when the actual debit order is recorded/matched through Banking. Never credited by Cash and Bank directly. Distinct from 2450 Lease Liability, which only ever carries the IFRS 16 present-value roll-forward.')
) as v(code, name, acct_type, nb, descr)
where not exists (
  select 1 from public.accounts a where a.company_id = c.id and a.code = v.code
);
