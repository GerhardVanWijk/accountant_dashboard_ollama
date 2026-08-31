-- 0031_inventory_posting_engine
-- Inventory Accounting Module — Phase 3. AUTHORED, then applied under the
-- controlled Phase-3 procedure (additive; no business rows touched by the DDL).
--
-- The ONE atomic boundary for a financially significant inventory posting:
-- `post_inventory_transaction(...)`. In a single implicit transaction it
--   1. records the idempotency key (rolls back cleanly with everything else),
--   2. LOCKS every referenced product row (consistent id order → no deadlock),
--   3. per line: computes the movement unit cost + WAC per costing mode,
--      writes the append-only stock_movements row (with unit_cost / total_cost /
--      source_document_type / _id / _line_id / movement_date / created_by),
--      upserts stock_balances, moves products.quantity_on_hand (transfers are
--      company-neutral), updates products.cost_price for a cost-in event,
--   4. builds the inventory-side journal lines from the values IT computed,
--      merges the caller's non-inventory lines (AR / revenue / VAT / AP …),
--      aggregates by account, validates Σdr = Σcr, inserts one journal entry,
--   5. writes the audit row,
--   6. returns the log id + journal entry id + movement ids.
--
-- SECURITY INVOKER (default): runs as the calling user, so every table's RLS
-- applies. `company_id` is resolved from `get_my_company_id()` and NEVER taken
-- from the client. Composite (company_id, id) FKs + RLS make a cross-company
-- reference structurally impossible. No SECURITY DEFINER function is introduced.
--
-- The open-accounting-period check and the document-header status update are
-- done by the TS engine (matching the pre-existing pattern where the service
-- checks the period before calling `create_journal_entry_with_lines`). The
-- header marker is a recoverable workflow state, not financially significant;
-- the RPC is idempotent so the engine safely retries the header write.
--
-- costing_mode per line:
--   receipt      qty>0, unit_cost_in given  → WAC blend; movement.unit_cost = received cost
--   opening      qty>0, unit_cost_in given  → WAC blend (or = cost on empty product); movement 'opening'
--   issue        qty<0, cost = current WAC  → no WAC change; movement_type from line
--   return_in    qty>0, cost = current WAC  → no WAC change; movement_type from line
--   transfer_out qty<0, cost = current WAC  → company qoh unchanged; balance -= ; movement 'transfer_out'
--   transfer_in  qty>0, cost = current WAC  → company qoh unchanged; balance += ; movement 'transfer_in'
--
-- line json: { product_id, warehouse_id, quantity_delta, costing_mode,
--   unit_cost_in?, movement_type?, source_document_line_id?,
--   inventory_account_id?, contra_account_id?, non_stock? }
-- (a `non_stock` line — a service item — is skipped entirely.)

create table public.inventory_transaction_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  posting_key text not null,
  source_type text not null,
  source_id uuid not null,
  kind text not null default 'post',
  journal_entry_id uuid references public.journal_entries(id),
  reverses_transaction_id uuid references public.inventory_transaction_log(id),
  movement_ids uuid[] not null default '{}',
  created_by text,
  created_at timestamptz not null default now(),
  unique (company_id, posting_key)
);

create index inventory_transaction_log_company_id_idx on public.inventory_transaction_log(company_id);
create index inventory_transaction_log_source_idx     on public.inventory_transaction_log(source_type, source_id);
create index inventory_transaction_log_journal_entry_id_idx on public.inventory_transaction_log(journal_entry_id);

alter table public.inventory_transaction_log enable row level security;

create policy inventory_transaction_log_all_own_company on public.inventory_transaction_log
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.post_inventory_transaction(
  p_posting_key   text,
  p_source_type   text,
  p_source_id     uuid,
  p_movement_date date,
  p_created_by    text,
  p_lines         jsonb,
  p_extra_journal jsonb,
  p_journal       jsonb,
  p_audit         jsonb
) returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_company uuid := (select public.get_my_company_id());
  v_existing public.inventory_transaction_log;
  v_log_id uuid;
  v_movement_ids uuid[] := '{}';
  v_line jsonb;
  v_pid uuid; v_wid uuid; v_qty numeric; v_mode text; v_costin numeric; v_srcline uuid;
  v_inv_acct uuid; v_contra_acct uuid;
  v_prod public.products;
  v_company_qty numeric; v_bal numeric;
  v_movement_cost numeric; v_movement_value numeric; v_new_wac numeric;
  v_mv_type public.stock_movement_type; v_mv_id uuid;
  v_je_lines jsonb := '[]'::jsonb;
  v_agg jsonb; v_dr numeric; v_cr numeric;
  v_je_id uuid; v_je_number text;
  v_warnings text[] := '{}';
begin
  if v_company is null then
    raise exception 'post_inventory_transaction: no company context';
  end if;

  -- 1. idempotency (rolls back with the whole txn on any later failure)
  insert into public.inventory_transaction_log (company_id, posting_key, source_type, source_id, kind, created_by)
  values (v_company, p_posting_key, p_source_type, p_source_id, 'post', p_created_by)
  on conflict (company_id, posting_key) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select * into v_existing from public.inventory_transaction_log
      where company_id = v_company and posting_key = p_posting_key;
    return jsonb_build_object('idempotent', true, 'transaction_log_id', v_existing.id,
      'journal_entry_id', v_existing.journal_entry_id, 'movement_ids', to_jsonb(v_existing.movement_ids),
      'warnings', '[]'::jsonb);
  end if;

  -- 2. lock every referenced product, consistent order
  perform 1 from public.products
    where company_id = v_company
      and id in (select (l->>'product_id')::uuid from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) l)
    order by id
    for update;

  -- 3. process lines
  for v_line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb))
  loop
    if coalesce((v_line->>'non_stock')::boolean, false) then continue; end if;

    v_pid := (v_line->>'product_id')::uuid;
    v_wid := (v_line->>'warehouse_id')::uuid;
    v_qty := (v_line->>'quantity_delta')::numeric;
    v_mode := v_line->>'costing_mode';
    v_costin := nullif(v_line->>'unit_cost_in','')::numeric;
    v_srcline := nullif(v_line->>'source_document_line_id','')::uuid;
    v_inv_acct := nullif(v_line->>'inventory_account_id','')::uuid;
    v_contra_acct := nullif(v_line->>'contra_account_id','')::uuid;

    select * into v_prod from public.products where id = v_pid and company_id = v_company;
    if not found then raise exception 'post_inventory_transaction: product % not in company', v_pid; end if;
    v_company_qty := v_prod.quantity_on_hand;

    if v_mode in ('receipt','opening') then
      if v_costin is null then raise exception 'post_inventory_transaction: % needs unit_cost_in', v_mode; end if;
      v_movement_cost := round(v_costin, 4);
      if v_company_qty + v_qty <= 0 then
        v_new_wac := v_prod.cost_price;
      elsif v_company_qty <= 0 then
        v_new_wac := round(v_costin, 4);
      else
        v_new_wac := round((v_company_qty * v_prod.cost_price + v_qty * v_costin) / (v_company_qty + v_qty), 4);
      end if;
      update public.products set cost_price = v_new_wac, updated_at = now() where id = v_pid;
      v_mv_type := case when v_mode = 'opening' then 'opening' else 'goods_received' end::public.stock_movement_type;
    elsif v_mode in ('issue','return_in') then
      v_movement_cost := v_prod.cost_price;
      v_mv_type := (v_line->>'movement_type')::public.stock_movement_type;
    elsif v_mode = 'transfer_out' then
      v_movement_cost := v_prod.cost_price; v_mv_type := 'transfer_out';
    elsif v_mode = 'transfer_in' then
      v_movement_cost := v_prod.cost_price; v_mv_type := 'transfer_in';
    else
      raise exception 'post_inventory_transaction: unknown costing_mode %', v_mode;
    end if;

    v_movement_value := round(abs(v_qty) * v_movement_cost, 2);

    insert into public.stock_balances (company_id, product_id, warehouse_id, quantity_on_hand)
      values (v_company, v_pid, v_wid, v_qty)
      on conflict (product_id, warehouse_id)
      do update set quantity_on_hand = public.stock_balances.quantity_on_hand + excluded.quantity_on_hand,
                    updated_at = now()
      returning quantity_on_hand into v_bal;
    if v_bal < 0 then
      v_warnings := v_warnings || format('negative stock: product %s warehouse %s -> %s', v_pid, v_wid, v_bal);
    end if;

    if v_mode not in ('transfer_out','transfer_in') then
      update public.products set quantity_on_hand = quantity_on_hand + v_qty, updated_at = now() where id = v_pid;
    end if;

    insert into public.stock_movements
      (company_id, product_id, warehouse_id, type, quantity_delta, unit_cost, total_cost,
       movement_date, source_document_type, source_document_id, source_document_line_id, created_by, reference)
    values
      (v_company, v_pid, v_wid, v_mv_type, v_qty, v_movement_cost, v_movement_value, p_movement_date,
       p_source_type, p_source_id, v_srcline, p_created_by, p_source_type || ':' || p_source_id::text)
    returning id into v_mv_id;
    v_movement_ids := v_movement_ids || v_mv_id;

    if v_inv_acct is not null and v_contra_acct is not null and v_movement_value <> 0 then
      if v_qty > 0 then
        v_je_lines := v_je_lines
          || jsonb_build_object('account_id', v_inv_acct,    'debit', v_movement_value, 'credit', 0)
          || jsonb_build_object('account_id', v_contra_acct, 'debit', 0, 'credit', v_movement_value);
      else
        v_je_lines := v_je_lines
          || jsonb_build_object('account_id', v_contra_acct, 'debit', v_movement_value, 'credit', 0)
          || jsonb_build_object('account_id', v_inv_acct,    'debit', 0, 'credit', v_movement_value);
      end if;
    end if;
  end loop;

  -- 4. journal
  v_je_lines := v_je_lines || coalesce(p_extra_journal, '[]'::jsonb);
  with lines as (select l from jsonb_array_elements(v_je_lines) l),
  agg as (
    select (l->>'account_id')::uuid aid,
           round(coalesce(sum((l->>'debit')::numeric),0),2) d,
           round(coalesce(sum((l->>'credit')::numeric),0),2) c
    from lines group by 1
  ),
  net as (select aid, greatest(d-c,0) d, greatest(c-d,0) c from agg)
  select jsonb_agg(jsonb_build_object('account_id', aid, 'debit', d, 'credit', c) order by aid),
         coalesce(sum(d),0), coalesce(sum(c),0)
    into v_agg, v_dr, v_cr
  from net where d <> 0 or c <> 0;

  if v_agg is not null then
    if abs(v_dr - v_cr) > 0.005 then
      raise exception 'post_inventory_transaction: unbalanced journal (dr % / cr %)', v_dr, v_cr;
    end if;
    select 'JE-' || lpad((count(*) + 1)::text, 4, '0') into v_je_number
      from public.journal_entries where company_id = v_company;
    insert into public.journal_entries (company_id, entry_number, date, memo, status, posted_at, currency, source)
      values (v_company, v_je_number, now(), p_journal->>'memo', 'posted', now(),
              coalesce(p_journal->>'currency','ZAR'), coalesce(p_journal->>'source', p_source_type))
      returning id into v_je_id;
    insert into public.journal_lines (journal_entry_id, company_id, account_id, description, debit, credit, line_no)
      select v_je_id, v_company, (l->>'account_id')::uuid, null, (l->>'debit')::numeric, (l->>'credit')::numeric, (ord-1)::int
      from jsonb_array_elements(v_agg) with ordinality t(l, ord);
    update public.inventory_transaction_log set journal_entry_id = v_je_id where id = v_log_id;
  end if;

  update public.inventory_transaction_log set movement_ids = v_movement_ids where id = v_log_id;

  -- 5. audit
  if p_audit is not null and p_audit->>'action' is not null then
    insert into public.audit_log_entries (company_id, user_id, action, module, record_type, record_id, reason, new_value)
    values (v_company, coalesce(p_audit->>'user_id','system'), p_audit->>'action',
            coalesce(p_audit->>'module','inventory'),
            coalesce(p_audit->>'record_type', p_source_type),
            coalesce(p_audit->>'record_id', p_source_id::text),
            p_audit->>'reason', p_audit->'new_value');
  end if;

  return jsonb_build_object('idempotent', false, 'transaction_log_id', v_log_id,
    'journal_entry_id', v_je_id, 'movement_ids', to_jsonb(v_movement_ids),
    'warnings', to_jsonb(v_warnings));
end;
$$;

revoke all on function public.post_inventory_transaction(text,text,uuid,date,text,jsonb,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.post_inventory_transaction(text,text,uuid,date,text,jsonb,jsonb,jsonb,jsonb) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Reversal: negates every movement of a prior posting and reverses its journal
-- entry (via the same swap-debit-credit rule the app already uses). Idempotent
-- on its own posting key. Movement cost is carried from the original movement
-- (historical unit cost is never recomputed).
create or replace function public.reverse_inventory_transaction(
  p_posting_key         text,
  p_original_posting_key text,
  p_movement_date       date,
  p_created_by          text,
  p_reason              text,
  p_audit               jsonb
) returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_company uuid := (select public.get_my_company_id());
  v_orig public.inventory_transaction_log;
  v_log_id uuid; v_existing public.inventory_transaction_log;
  v_mv public.stock_movements;
  v_new_ids uuid[] := '{}';
  v_orig_mv_id uuid;
  v_new_mv_id uuid;
  v_orig_je public.journal_entries;
  v_new_je uuid; v_je_number text;
begin
  if v_company is null then raise exception 'reverse_inventory_transaction: no company context'; end if;

  select * into v_orig from public.inventory_transaction_log
    where company_id = v_company and posting_key = p_original_posting_key;
  if not found then raise exception 'reverse_inventory_transaction: original % not found', p_original_posting_key; end if;

  insert into public.inventory_transaction_log (company_id, posting_key, source_type, source_id, kind, created_by, reverses_transaction_id)
  values (v_company, p_posting_key, v_orig.source_type, v_orig.source_id, 'reversal', p_created_by, v_orig.id)
  on conflict (company_id, posting_key) do nothing
  returning id into v_log_id;
  if v_log_id is null then
    select * into v_existing from public.inventory_transaction_log where company_id = v_company and posting_key = p_posting_key;
    return jsonb_build_object('idempotent', true, 'transaction_log_id', v_existing.id, 'journal_entry_id', v_existing.journal_entry_id);
  end if;

  perform 1 from public.products
    where company_id = v_company and id in (select product_id from public.stock_movements where id = any(v_orig.movement_ids))
    order by id for update;

  foreach v_orig_mv_id in array v_orig.movement_ids
  loop
    select * into v_mv from public.stock_movements where id = v_orig_mv_id and company_id = v_company;
    insert into public.stock_movements
      (company_id, product_id, warehouse_id, type, quantity_delta, unit_cost, total_cost, movement_date,
       source_document_type, source_document_id, source_document_line_id, created_by, reference, reversal_of_movement_id)
    values
      (v_company, v_mv.product_id, v_mv.warehouse_id, 'correction', -v_mv.quantity_delta, v_mv.unit_cost, v_mv.total_cost,
       p_movement_date, 'reversal', v_orig.source_id, v_mv.source_document_line_id, p_created_by,
       'reversal:' || v_orig.source_id::text, v_mv.id)
    returning id into v_new_mv_id;
    v_new_ids := v_new_ids || v_new_mv_id;

    insert into public.stock_balances (company_id, product_id, warehouse_id, quantity_on_hand)
      values (v_company, v_mv.product_id, v_mv.warehouse_id, -v_mv.quantity_delta)
      on conflict (product_id, warehouse_id)
      do update set quantity_on_hand = public.stock_balances.quantity_on_hand + excluded.quantity_on_hand, updated_at = now();

    if v_mv.type not in ('transfer_out','transfer_in') then
      update public.products set quantity_on_hand = quantity_on_hand - v_mv.quantity_delta, updated_at = now()
        where id = v_mv.product_id;
    end if;
  end loop;
  -- NB: reversal deliberately does NOT recompute products.cost_price — a reversal
  -- is not a re-pricing event; WAC drift from an already-blended receipt is
  -- corrected by a fresh reviewed restatement, never silently here.

  if v_orig.journal_entry_id is not null then
    select * into v_orig_je from public.journal_entries where id = v_orig.journal_entry_id;
    select 'JE-' || lpad((count(*) + 1)::text, 4, '0') into v_je_number
      from public.journal_entries where company_id = v_company;
    insert into public.journal_entries (company_id, entry_number, date, memo, status, posted_at, currency, source, reversal_of_entry_id)
      values (v_company, v_je_number, now(),
              'Reversal of ' || v_orig_je.entry_number || coalesce(' — ' || p_reason, ''),
              'posted', now(), v_orig_je.currency, 'reversal', v_orig_je.id)
      returning id into v_new_je;
    insert into public.journal_lines (journal_entry_id, company_id, account_id, description, debit, credit, line_no)
      select v_new_je, v_company, jl.account_id, jl.description, jl.credit, jl.debit, jl.line_no
      from public.journal_lines jl where jl.journal_entry_id = v_orig_je.id;
    update public.journal_entries set status = 'reversed' where id = v_orig_je.id;
    update public.inventory_transaction_log set journal_entry_id = v_new_je where id = v_log_id;
  end if;

  update public.inventory_transaction_log set movement_ids = v_new_ids where id = v_log_id;

  if p_audit is not null and p_audit->>'action' is not null then
    insert into public.audit_log_entries (company_id, user_id, action, module, record_type, record_id, reason)
    values (v_company, coalesce(p_audit->>'user_id','system'), p_audit->>'action', 'inventory',
            coalesce(p_audit->>'record_type', v_orig.source_type), coalesce(p_audit->>'record_id', v_orig.source_id::text), p_reason);
  end if;

  return jsonb_build_object('idempotent', false, 'transaction_log_id', v_log_id,
    'journal_entry_id', v_new_je, 'movement_ids', to_jsonb(v_new_ids));
end;
$$;

revoke all on function public.reverse_inventory_transaction(text,text,date,text,text,jsonb) from public, anon;
grant execute on function public.reverse_inventory_transaction(text,text,date,text,text,jsonb) to authenticated;
