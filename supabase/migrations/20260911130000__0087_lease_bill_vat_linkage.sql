-- 0087_lease_bill_vat_linkage
-- Leases + Payroll accounting-integrity hardening (PART 4 of the audit —
-- South African lease VAT architecture). AUTHORED, NOT APPLIED.
--
-- DESIGN DECISION (documented here because it is a schema-shaping choice,
-- not just a comment): a VAT-bearing lessor tax invoice for a lease
-- rental does NOT get its VAT applied inside leaseAmortizationService.
-- IFRS 16 lessee accounting (interest unwind on the liability + straight-
-- line ROU depreciation, what `runAmortization()` posts) and VAT (a
-- transaction tax on the ACTUAL invoiced supply, evidenced by the lessor's
-- tax invoice on its own tax point) are two unrelated things that happen to
-- share a payment date. Blanket-applying 15% inside the amortization run
-- would be wrong on every count the audit brief warned about: it is not
-- evidence-driven (no tax invoice, no tax_rate_id, nothing VAT201 can cite
-- as a source document), it would tax the amortization split (interest +
-- principal) which is not what SARS taxes at all (SARS taxes the rental
-- AMOUNT the lessor's invoice states), and a lessor who is NOT a VAT
-- vendor (or a lease that is genuinely zero-rated/exempt) would be
-- incorrectly charged output... input VAT regardless of the real facts.
--
-- The correct integration, using the architecture that already exists: a
-- VAT-bearing lease rental invoice is captured as an ordinary Supplier
-- Invoice (Bill) through the existing AP pipeline — `billService.ts`
-- already resolves its VAT from the effective-dated `tax_rates` engine
-- per line, already feeds `vatReportService`/VAT201 as a first-class
-- document source, and already settles through the existing
-- `paymentService.ts` (DR AP / CR Cash) exactly like any other supplier
-- invoice. Coding that Bill's net (VAT-exclusive) expense line to 2460
-- Lease Payment Clearing (0085) — the SAME account `runAmortization()`
-- credits for the period's interest+principal — makes the two postings
-- net against each other automatically: leaseAmortizationService supplies
-- the DR (finance-cost) side of the clearing account from the IFRS 16
-- calculation, the Bill supplies the CR (real invoiced amount, gross of
-- VAT, net of VAT going to VAT Input) side from actual lessor evidence.
-- A non-zero residual in 2460 after both sides post is a genuine
-- signal worth investigating (an escalation clause, a short month, a
-- rate mismatch) — visible on the Lease Register health card
-- (leaseReconciliationService.ts) exactly like any other control-account
-- variance, never silently absorbed.
--
-- `lease_id` on `bills` is what makes that Bill traceable back to the
-- specific lease it invoices (Related Records, the reconciliation view,
-- and — if a company runs multiple leases through the same lessor — the
-- disambiguator a lessor-name match alone cannot give). Nullable: the
-- overwhelming majority of Bills are not lease-related at all. No
-- behavior changes from adding this column alone — billService.ts/the Bill
-- form gain the ability to set it in application code, out of this
-- migration's (schema-only) scope, matching 0053's precedent.

alter table public.bills
  add column if not exists lease_id uuid references public.lease_contracts(id);

comment on column public.bills.lease_id is
  'Optional link to the lease_contracts row this Bill invoices a rental/VAT tax invoice for. Set by the Bill form when the user tags a lease. See migration 0087.';

create index if not exists bills_lease_id_idx on public.bills (company_id, lease_id) where lease_id is not null;
