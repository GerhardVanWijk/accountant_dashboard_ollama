-- 0032_inventory_posting_engine_frozen_cost
-- Inventory Accounting Module — Phase 3. `create or replace` on
-- post_inventory_transaction only. Adds `unit_cost_override` support to the
-- `issue` / `return_in` costing modes: a stock take (or an adjustment line) that
-- owns a FROZEN unit cost values its movement + GL line at that cost, not at the
-- product's current WAC. The product's WAC is still never changed by these modes.
-- No signature change, no data touched.

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
  v_pid uuid; v_wid uuid; v_qty numeric; v_mode text; v_costin numeric; v_costoverride numeric; v_srcline uuid;
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

  perform 1 from public.products
    where company_id = v_company
      and id in (select (l->>'product_id')::uuid from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) l)
    order by id
    for update;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb))
  loop
    if coalesce((v_line->>'non_stock')::boolean, false) then continue; end if;

    v_pid := (v_line->>'product_id')::uuid;
    v_wid := (v_line->>'warehouse_id')::uuid;
    v_qty := (v_line->>'quantity_delta')::numeric;
    v_mode := v_line->>'costing_mode';
    v_costin := nullif(v_line->>'unit_cost_in','')::numeric;
    v_costoverride := nullif(v_line->>'unit_cost_override','')::numeric;
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
      v_movement_cost := coalesce(round(v_costoverride, 4), v_prod.cost_price);
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
