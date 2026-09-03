-- 0046_customer_deposit_allocation_rpc
-- Increment 4A hardening (Review 4A-3 / 4A-4). AUTHORED, NOT APPLIED.
-- Apply AFTER 0045 (this RPC hard-requires the 2600 Customer Deposits account).
--
-- Makes "apply an existing customer deposit to an invoice" a SINGLE atomic,
-- idempotent, concurrency-safe operation — mirroring post_inventory_transaction
-- (migration 0031), the strongest posting pattern already in this repo.
--
-- STABLE IDENTITY (Review 4A-4): idempotency is keyed on a UUID
-- `allocation_id` generated client-side BEFORE the RPC runs — NOT on any
-- mutable/derived state such as an allocation array length. The same logical
-- retry re-uses the id; a genuinely new allocation gets a fresh one.
--
-- 0046 introduces:
--   * public.deposit_allocation_log     — UNIQUE (company_id, allocation_id).
--   * public.deposit_reclassification_log — one row per historically-corrected
--     receipt; UNIQUE (company_id, receipt_id). The deterministic identity for
--     the 0045b one-time reclassification (memo text is only a sanity check).
--   * public.apply_customer_deposit(...) — one plpgsql function = one implicit
--     Postgres transaction. It records the idempotency row, LOCKS the receipt
--     then the invoice row FOR UPDATE (fixed order — see the LOCK ORDER note),
--     RE-VALIDATES the amount against the LOCKED rows, resolves the 2600 / 1100
--     accounts (2600 must be an active credit-normal liability), posts the
--     balanced DR 2600 / CR 1100 entry through the canonical
--     allocate_journal_number + create_journal_entry_with_lines path (0033),
--     updates invoices.amount_paid/status and customer_receipts
--     .allocations/.unallocated_amount, and writes the audit row — all or
--     nothing.
--   * CHECK constraints so the money invariants hold at the storage layer even
--     against a writer that bypasses the RPC:
--       customer_receipts / payments : 0 <= unallocated_amount <= amount
--       invoices / bills             : 0 <= amount_paid <= total
--     Verified 2026-09-03 (read-only): 0 existing rows violate any of these.
--
-- LOCK ORDER (deadlock audit): apply_customer_deposit locks
--   (1) public.customer_receipts   then   (2) public.invoices.
-- This is the ONLY function/RPC in the schema that locks both entities with
-- FOR UPDATE (post_inventory_transaction locks only public.products;
-- create_journal_entry_with_lines / allocate_journal_number take no explicit
-- row locks on these tables). Any future code that must lock a receipt and an
-- invoice together MUST take them in that same order.
--
-- SECURITY INVOKER throughout: every table's RLS applies as the calling user.
-- company_id comes from get_my_company_id(), never the client.

-- ========================================================================
-- 1. Money invariants at the storage layer
-- ========================================================================
alter table public.customer_receipts
  add constraint customer_receipts_unallocated_amount_nonneg check (unallocated_amount >= 0),
  add constraint customer_receipts_unallocated_amount_le_amount check (unallocated_amount <= amount + 0.005);

alter table public.payments
  add constraint payments_unallocated_amount_nonneg check (unallocated_amount >= 0),
  add constraint payments_unallocated_amount_le_amount check (unallocated_amount <= amount + 0.005);

alter table public.invoices
  add constraint invoices_amount_paid_nonneg check (amount_paid >= 0),
  add constraint invoices_amount_paid_le_total check (amount_paid <= total + 0.005);

alter table public.bills
  add constraint bills_amount_paid_nonneg check (amount_paid >= 0),
  add constraint bills_amount_paid_le_total check (amount_paid <= total + 0.005);

-- ========================================================================
-- 2. Idempotency logs
-- ========================================================================
create table public.deposit_allocation_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  allocation_id uuid not null,        -- STABLE identity of the logical allocation (client-generated)
  receipt_id uuid not null references public.customer_receipts(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id),
  amount numeric(14, 2) not null check (amount > 0),
  journal_entry_id uuid references public.journal_entries(id),
  created_by text,
  created_at timestamptz not null default now(),
  unique (company_id, allocation_id)
);

create index deposit_allocation_log_company_id_idx on public.deposit_allocation_log (company_id);
create index deposit_allocation_log_receipt_id_idx on public.deposit_allocation_log (receipt_id);
create index deposit_allocation_log_invoice_id_idx on public.deposit_allocation_log (invoice_id);
create index deposit_allocation_log_journal_entry_id_idx on public.deposit_allocation_log (journal_entry_id);

alter table public.deposit_allocation_log enable row level security;

-- for all: the RPC INSERTs the id row then UPDATEs journal_entry_id on it,
-- same shape as inventory_transaction_log's policy (migration 0031).
create policy deposit_allocation_log_all_own_company on public.deposit_allocation_log
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- One row per receipt whose pre-4A unapplied balance was reclassified to 2600
-- by the one-time docs/db-changes/0045b_... script. The deterministic identity
-- (receipt) for that correction; memo matching in 0045b is a secondary check.
create table public.deposit_reclassification_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  receipt_id uuid not null references public.customer_receipts(id) on delete cascade,
  journal_entry_id uuid not null references public.journal_entries(id),
  unallocated_amount numeric(14, 2) not null check (unallocated_amount > 0),
  created_at timestamptz not null default now(),
  unique (company_id, receipt_id)
);

create index deposit_reclassification_log_company_id_idx on public.deposit_reclassification_log (company_id);

alter table public.deposit_reclassification_log enable row level security;

create policy deposit_reclassification_log_all_own_company on public.deposit_reclassification_log
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- ========================================================================
-- 3. The atomic executor
-- ========================================================================
create or replace function public.apply_customer_deposit(
  p_allocation_id uuid,
  p_receipt_id    uuid,
  p_invoice_id    uuid,
  p_amount        numeric,
  p_date          timestamptz,
  p_created_by    text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company   uuid := (select public.get_my_company_id());
  v_log_id    uuid;
  v_existing  public.deposit_allocation_log;
  v_receipt   public.customer_receipts;
  v_invoice   public.invoices;
  v_ar        uuid;
  v_cd        uuid;
  v_je        public.journal_entries;
  v_amount    numeric := round(p_amount, 2);
  v_new_paid  numeric;
  v_new_status public.invoice_status;
  v_new_unalloc numeric;
begin
  if v_company is null then
    raise exception 'apply_customer_deposit: no company context';
  end if;
  if p_allocation_id is null then
    raise exception 'apply_customer_deposit: allocation_id is required';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'apply_customer_deposit: amount must be greater than zero';
  end if;

  -- 3.1 IDEMPOTENCY on the STABLE allocation id. This row commits or rolls
  --     back with everything below it.
  insert into public.deposit_allocation_log
    (company_id, allocation_id, receipt_id, invoice_id, amount, created_by)
  values (v_company, p_allocation_id, p_receipt_id, p_invoice_id, v_amount, p_created_by)
  on conflict (company_id, allocation_id) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select * into v_existing from public.deposit_allocation_log
      where company_id = v_company and allocation_id = p_allocation_id;
    return jsonb_build_object(
      'idempotent', true,
      'journal_entry_id', v_existing.journal_entry_id,
      'applied_amount', v_existing.amount);
  end if;

  -- 3.2 LOCK the receipt then the invoice (FIXED ORDER — see header note).
  select * into v_receipt from public.customer_receipts
    where id = p_receipt_id and company_id = v_company
    for update;
  if not found then
    raise exception 'apply_customer_deposit: receipt % not found in company', p_receipt_id;
  end if;

  select * into v_invoice from public.invoices
    where id = p_invoice_id and company_id = v_company
    for update;
  if not found then
    raise exception 'apply_customer_deposit: invoice % not found in company', p_invoice_id;
  end if;

  -- 3.3 RE-VALIDATE against the LOCKED rows.
  if v_receipt.customer_id <> v_invoice.customer_id then
    raise exception 'apply_customer_deposit: receipt % and invoice % belong to different customers', p_receipt_id, p_invoice_id;
  end if;
  if v_invoice.status in ('draft', 'void') then
    raise exception 'apply_customer_deposit: invoice % is % — cannot apply a deposit to it', p_invoice_id, v_invoice.status;
  end if;
  if v_amount - v_receipt.unallocated_amount > 0.005 then
    raise exception 'apply_customer_deposit: only % remains unapplied on receipt %', v_receipt.unallocated_amount, p_receipt_id;
  end if;
  if v_amount - (v_invoice.total - v_invoice.amount_paid) > 0.005 then
    raise exception 'apply_customer_deposit: invoice % has only % outstanding', p_invoice_id, (v_invoice.total - v_invoice.amount_paid);
  end if;

  -- 3.4 open accounting period (create_journal_entry_with_lines does not check).
  if not exists (
    select 1 from public.accounting_periods p
    where p.company_id = v_company and p.status = 'open'
      and p_date::date between p.start_date and p.end_date
  ) then
    raise exception 'apply_customer_deposit: no open accounting period covers %', p_date::date;
  end if;

  -- 3.5 RESOLVE accounts — 2600 MUST be an active credit-normal liability.
  select id into v_cd from public.accounts
    where company_id = v_company and code = '2600'
      and is_active and type = 'liability' and normal_balance = 'credit';
  if v_cd is null then
    raise exception 'apply_customer_deposit: company % has no active credit-normal liability account with code 2600 (Customer Deposits) — apply migration 0045', v_company;
  end if;
  select id into v_ar from public.accounts
    where company_id = v_company and code = '1100' and is_active;
  if v_ar is null then
    raise exception 'apply_customer_deposit: company % has no active account with code 1100 (Accounts Receivable)', v_company;
  end if;

  -- 3.6 POST the balanced journal entry via the canonical atomic path.
  v_je := public.create_journal_entry_with_lines(
    v_company,
    '',                                 -- blank -> allocate_journal_number()
    p_date,
    'Apply customer deposit ' || v_receipt.receipt_number || ' -> invoice ' || v_invoice.invoice_number,
    'posted',
    now(),
    coalesce(v_receipt.currency, 'ZAR'),
    'customer_receipt_allocation',
    null,
    jsonb_build_array(
      jsonb_build_object('account_id', v_cd::text, 'description', 'Deposit applied - ' || v_receipt.receipt_number, 'debit', v_amount, 'credit', 0),
      jsonb_build_object('account_id', v_ar::text, 'description', 'Deposit applied - ' || v_receipt.receipt_number, 'debit', 0, 'credit', v_amount)
    )
  );

  -- 3.7 INVOICE subledger (mirrors invoiceService.recordPayment exactly).
  v_new_paid := least(v_invoice.amount_paid + v_amount, v_invoice.total);
  v_new_status := case
    when v_new_paid >= v_invoice.total - 0.005 then 'paid'::public.invoice_status
    when v_new_paid > 0 then 'partially_paid'::public.invoice_status
    else v_invoice.status
  end;
  update public.invoices
     set amount_paid = v_new_paid, status = v_new_status, updated_at = now()
   where id = p_invoice_id;

  -- 3.8 RECEIPT subledger — the allocation carries its own STABLE id.
  v_new_unalloc := greatest(v_receipt.unallocated_amount - v_amount, 0);
  update public.customer_receipts
     set allocations = coalesce(allocations, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'id', p_allocation_id::text,
           'invoiceId', p_invoice_id::text,
           'amount', v_amount,
           'journalEntryId', v_je.id::text,
           'allocatedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
         )),
         unallocated_amount = v_new_unalloc,
         updated_at = now()
   where id = p_receipt_id;

  update public.deposit_allocation_log set journal_entry_id = v_je.id where id = v_log_id;

  -- 3.9 audit
  insert into public.audit_log_entries (company_id, user_id, action, module, record_type, record_id, new_value)
  values (
    v_company, coalesce(p_created_by, 'system'), 'customer_deposit_applied', 'sales',
    'CustomerReceipt', p_receipt_id::text,
    jsonb_build_object('allocationId', p_allocation_id, 'invoiceId', p_invoice_id, 'amount', v_amount, 'journalEntryId', v_je.id)
  );

  return jsonb_build_object(
    'idempotent', false,
    'journal_entry_id', v_je.id,
    'applied_amount', v_amount);
end;
$$;

revoke all on function public.apply_customer_deposit(uuid, uuid, uuid, numeric, timestamptz, text) from public, anon;
grant execute on function public.apply_customer_deposit(uuid, uuid, uuid, numeric, timestamptz, text) to authenticated;
