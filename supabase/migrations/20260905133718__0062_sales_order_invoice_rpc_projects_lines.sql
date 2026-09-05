-- 0062_sales_order_invoice_rpc_projects_lines
-- Completion-run Block B (2026-09-05): closes the LAST normalized-document-
-- lines blocker (docs/CURRENT_TASKS.md § P3).
--
-- ══════════════════════════════════════════════════════════════════════
-- THE BLOCKER
--   `create_invoice_from_sales_order` inserts the invoice row directly in
--   SQL and NEVER goes through `invoiceService.createInvoice()` — so it
--   permanently bypassed `SupabaseDocumentLineProjector` (the TS dual-write
--   into `invoice_lines`), flag on or off. Every Sales-Order-derived invoice
--   (partial invoicing, delivery-linked invoicing — Phase 5B/5C/5D) would
--   have an empty `invoice_lines` projection forever.
--
-- THE FIX (atomic DB-side projection — the prompt's preferred option 1)
--   The function already builds `v_new_lines` — the authoritative line
--   array that goes VERBATIM into `invoices.line_items` jsonb. This
--   migration adds an OPTIONAL, transaction-atomic projection of that SAME
--   array into `invoice_lines`, controlled by a new `p_project_lines`
--   parameter. There is NO second calculation: `invoice_lines` rows are a
--   pure structural copy of `v_new_lines` (id preserved from the line's own
--   id, exactly as migration 0042's backfill and the TS projector both do).
--
--   `RpcSalesOrderDraftInvoiceWriter` passes
--   `p_project_lines := NORMALIZED_DOCUMENT_LINES_ENABLED`
--   (src/config/featureFlags.ts) — so the RPC dual-write turns on/off with
--   the SAME single flag as the TS projector. Default `false` keeps every
--   other (there are none today) caller unchanged.
--
--   Atomicity: the `insert into invoice_lines` runs inside the SAME
--   function transaction as the `insert into invoices`. Any constraint
--   violation aborts the WHOLE RPC — there is NO path where the invoice is
--   created but its lines silently are not (the prompt's explicit rule).
--
--   FK safety: a stale `productId`/`warehouseId`/`taxRateId` on an old SO
--   line is written as NULL, never allowed to abort invoice creation —
--   the exact defensive pattern migration 0042 established (an `exists`
--   check per composite FK). The jsonb `line_items` keeps the original
--   value untouched.
--
--   `line_number` = 1-based position in `v_new_lines` (`with ordinality`),
--   matching 0042 and `SupabaseDocumentLineProjector`.
--
-- SIGNATURE CHANGE: this adds a 5th parameter, so `create or replace` is
-- not possible — the 4-arg function is DROPped and the 5-arg (default-5th)
-- function created. The single live caller
-- (`RpcSalesOrderDraftInvoiceWriter`) uses named params and is updated in
-- the same change; PostgREST resolves the default for any 4-named-arg call.
--
-- EVERYTHING ELSE in the function body is BYTE-IDENTICAL to migration 0061
-- (the return-note-aware fulfilment formula) — this migration only adds the
-- projection block and the parameter.
-- ══════════════════════════════════════════════════════════════════════

drop function if exists public.create_invoice_from_sales_order(uuid, jsonb, text, timestamptz);

create function public.create_invoice_from_sales_order(
  p_sales_order_id uuid,
  p_selections     jsonb,     -- [{ "salesOrderLineId": uuid-text, "quantity": number, "deliveryNoteLineId": uuid-text? }, ...]
  p_created_by     text default null,
  p_issue_date     timestamptz default null,
  p_project_lines  boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company         uuid := (select public.get_my_company_id());
  v_so              public.sales_orders;
  v_now             timestamptz := coalesce(p_issue_date, now());
  v_year            text := to_char(v_now, 'YYYY');
  v_sel             jsonb;
  v_sol_id          text;
  v_dnl_id          text;
  v_qty             numeric;
  v_seen            text[] := array[]::text[];
  v_so_line         jsonb;
  v_ordered         numeric;
  v_taken_direct    numeric;
  v_delivered       numeric;
  v_returned        numeric;
  v_dn_line         jsonb;
  v_dn_line_qty     numeric;
  v_dn_line_taken   numeric;
  v_dn_line_returned numeric;
  v_remaining       numeric;
  v_unit_price      numeric;
  v_src_line_total  numeric;
  v_src_tax         numeric;
  v_line_total      numeric;
  v_tax_amount      numeric;
  v_rate            numeric;
  v_new_lines       jsonb := '[]'::jsonb;
  v_subtotal        numeric := 0;
  v_tax_total       numeric := 0;
  v_total           numeric;
  v_has_legacy_link boolean;
  v_invoice_id      uuid;
  v_invoice_number  text;
  v_seq             bigint;
  v_attempt         int := 0;
begin
  if v_company is null then
    raise exception 'create_invoice_from_sales_order: no company context';
  end if;
  if p_selections is null or jsonb_typeof(p_selections) <> 'array' or jsonb_array_length(p_selections) = 0 then
    raise exception 'create_invoice_from_sales_order: select at least one line to invoice';
  end if;

  select * into v_so
    from public.sales_orders
   where id = p_sales_order_id and company_id = v_company
   for update;
  if not found then
    raise exception 'create_invoice_from_sales_order: sales order % not found in company', p_sales_order_id;
  end if;
  if v_so.status = 'cancelled' then
    raise exception 'create_invoice_from_sales_order: sales order % has been cancelled', v_so.order_number;
  end if;
  if v_so.status = 'closed' then
    raise exception 'create_invoice_from_sales_order: sales order % is closed', v_so.order_number;
  end if;

  select exists (
    select 1 from public.invoices i
    where i.sales_order_id = p_sales_order_id and i.company_id = v_company and i.status <> 'void'
      and jsonb_array_length(coalesce(i.line_items,'[]'::jsonb)) > 0
      and not exists (
        select 1 from jsonb_array_elements(i.line_items) l where (l.value ? 'salesOrderLineId')
      )
  ) into v_has_legacy_link;
  if v_has_legacy_link then
    raise exception 'create_invoice_from_sales_order: sales order % was already converted to an invoice the pre-5B.1 way', v_so.order_number;
  end if;
  if v_so.status = 'fulfilled' and not exists (
    select 1 from public.invoices i, jsonb_array_elements(coalesce(i.line_items,'[]'::jsonb)) l
    where i.sales_order_id = p_sales_order_id and i.company_id = v_company and (l.value ? 'salesOrderLineId')
  ) then
    raise exception 'create_invoice_from_sales_order: sales order % has already been fulfilled', v_so.order_number;
  end if;

  for v_sel in select * from jsonb_array_elements(p_selections)
  loop
    v_sol_id := v_sel->>'salesOrderLineId';
    if v_sol_id is null then
      raise exception 'create_invoice_from_sales_order: a selection is missing salesOrderLineId';
    end if;
    if v_sol_id = any(v_seen) then
      raise exception 'create_invoice_from_sales_order: line % selected more than once', v_sol_id;
    end if;
    v_seen := v_seen || v_sol_id;

    begin
      v_qty := (v_sel->>'quantity')::numeric;
    exception when others then
      raise exception 'create_invoice_from_sales_order: quantity for line % is not a number', v_sol_id;
    end;
    if v_qty is null or v_qty = 'NaN'::numeric then
      raise exception 'create_invoice_from_sales_order: quantity for line % is not a number', v_sol_id;
    end if;
    if v_qty <= 0 then
      raise exception 'create_invoice_from_sales_order: quantity for line % must be greater than zero', v_sol_id;
    end if;
    if v_qty <> round(v_qty, 3) then
      raise exception 'create_invoice_from_sales_order: quantity for line % has more than 3 decimal places', v_sol_id;
    end if;

    select l.value into v_so_line
      from jsonb_array_elements(coalesce(v_so.line_items, '[]'::jsonb)) l
     where (l.value->>'id') = v_sol_id
     limit 1;
    if v_so_line is null then
      raise exception 'create_invoice_from_sales_order: line % is not on sales order %', v_sol_id, v_so.order_number;
    end if;

    v_ordered := coalesce((v_so_line->>'quantity')::numeric, 0);
    v_unit_price := coalesce((v_so_line->>'unitPrice')::numeric, 0);
    v_src_line_total := coalesce((v_so_line->>'lineTotal')::numeric, 0);
    v_src_tax := coalesce((v_so_line->>'taxAmount')::numeric, 0);

    v_dnl_id := v_sel->>'deliveryNoteLineId';

    if v_dnl_id is not null then
      select l.value into v_dn_line
        from public.delivery_notes dn, jsonb_array_elements(coalesce(dn.line_items, '[]'::jsonb)) l
       where dn.company_id = v_company and dn.sales_order_id = p_sales_order_id and dn.status = 'posted'
         and (l.value->>'id') = v_dnl_id
       limit 1;
      if v_dn_line is null then
        raise exception 'create_invoice_from_sales_order: delivery note line % not found (must be a posted delivery note against sales order %)', v_dnl_id, v_so.order_number;
      end if;
      if (v_dn_line->>'salesOrderLineId') <> v_sol_id then
        raise exception 'create_invoice_from_sales_order: delivery note line % belongs to a different sales order line than %', v_dnl_id, v_sol_id;
      end if;

      v_dn_line_qty := coalesce((v_dn_line->>'quantity')::numeric, 0);

      select coalesce(sum((il.value->>'quantity')::numeric), 0) into v_dn_line_taken
        from public.invoices i, jsonb_array_elements(coalesce(i.line_items, '[]'::jsonb)) il
       where i.company_id = v_company and i.sales_order_id = p_sales_order_id
         and i.status <> 'void'
         and (il.value->>'deliveryNoteLineId') = v_dnl_id;

      select coalesce(sum((l.value->>'quantity')::numeric), 0) into v_dn_line_returned
        from public.return_notes rn, jsonb_array_elements(coalesce(rn.line_items, '[]'::jsonb)) l
       where rn.company_id = v_company and rn.status = 'posted'
         and (l.value->>'deliveryNoteLineId') = v_dnl_id;

      v_remaining := round(v_dn_line_qty - v_dn_line_taken - v_dn_line_returned, 3);
      if v_qty - v_remaining > 0.0000005 then
        raise exception 'create_invoice_from_sales_order: cannot invoice % against delivery note line % — only % remain to invoice on that delivery',
          round(v_qty, 3), v_dnl_id, greatest(v_remaining, 0);
      end if;
    else
      select coalesce(sum((il.value->>'quantity')::numeric), 0) into v_taken_direct
        from public.invoices i, jsonb_array_elements(coalesce(i.line_items,'[]'::jsonb)) il
       where i.sales_order_id = p_sales_order_id and i.company_id = v_company
         and i.status <> 'void'
         and (il.value->>'salesOrderLineId') = v_sol_id
         and not (il.value ? 'deliveryNoteLineId');

      select coalesce(sum((l.value->>'quantity')::numeric), 0) into v_delivered
        from public.delivery_notes dn, jsonb_array_elements(coalesce(dn.line_items,'[]'::jsonb)) l
       where dn.company_id = v_company and dn.sales_order_id = p_sales_order_id and dn.status = 'posted'
         and (l.value->>'salesOrderLineId') = v_sol_id;

      select coalesce(sum((l.value->>'quantity')::numeric), 0) into v_returned
        from public.return_notes rn, jsonb_array_elements(coalesce(rn.line_items,'[]'::jsonb)) l
       where rn.company_id = v_company and rn.status = 'posted'
         and (l.value->>'salesOrderLineId') = v_sol_id;

      v_remaining := round(v_ordered - greatest(v_delivered - v_returned, 0) - v_taken_direct, 3);
      if v_qty - v_remaining > 0.0000005 then
        raise exception 'create_invoice_from_sales_order: cannot invoice % of line % — only % remain to invoice directly (% already delivered, % already returned, % already directly invoiced)',
          round(v_qty,3), v_sol_id, greatest(v_remaining, 0), v_delivered, v_returned, v_taken_direct;
      end if;
    end if;

    if abs(v_qty - v_ordered) <= 0.0000005 then
      v_line_total := round(v_src_line_total, 2);
      v_tax_amount := round(v_src_tax, 2);
    else
      v_rate := case when v_src_line_total > 0 then v_src_tax / v_src_line_total else 0 end;
      v_line_total := round(v_qty * v_unit_price, 2);
      v_tax_amount := round(v_line_total * v_rate, 2);
    end if;

    v_new_lines := v_new_lines || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'productId', v_so_line->>'productId',
        'warehouseId', v_so_line->>'warehouseId',
        'taxRateId', v_so_line->>'taxRateId',
        'deliveryNoteLineId', v_dnl_id
      )) || jsonb_build_object(
        'id', gen_random_uuid()::text,
        'salesOrderLineId', v_sol_id,
        'description', coalesce(v_so_line->>'description', ''),
        'quantity', v_qty,
        'unitPrice', v_unit_price,
        'taxAmount', v_tax_amount,
        'lineTotal', v_line_total
      )
    );
    v_subtotal := v_subtotal + v_line_total;
    v_tax_total := v_tax_total + v_tax_amount;
  end loop;

  v_subtotal := round(v_subtotal, 2);
  v_tax_total := round(v_tax_total, 2);
  v_total := round(v_subtotal + v_tax_total, 2);

  loop
    select coalesce(
             max((substring(invoice_number from '^INV-' || v_year || '-0*([0-9]+)$'))::bigint), 0
           ) + 1 + v_attempt
      into v_seq
      from public.invoices
     where company_id = v_company and invoice_number ~ ('^INV-' || v_year || '-[0-9]+$');
    v_invoice_number := 'INV-' || v_year || '-' || lpad(v_seq::text, 4, '0');
    begin
      insert into public.invoices
        (company_id, invoice_number, customer_id, sales_order_id, issue_date, due_date,
         line_items, subtotal, tax_total, total, amount_paid, currency, status, notes)
      values
        (v_company, v_invoice_number, v_so.customer_id, v_so.id, v_now, v_now + interval '30 days',
         v_new_lines, v_subtotal, v_tax_total, v_total, 0, coalesce(v_so.currency, 'ZAR'), 'draft',
         'Invoiced from ' || v_so.order_number)
      returning id into v_invoice_id;
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt > 25 then
        raise exception 'create_invoice_from_sales_order: could not allocate an invoice number for %', v_year;
      end if;
    end;
  end loop;

  -- 0062: atomic normalized-line projection — a pure structural copy of the
  -- SAME `v_new_lines` array already written to `invoices.line_items`. No
  -- recalculation. Stale FK refs -> NULL (never abort). Runs only when the
  -- caller opts in (NORMALIZED_DOCUMENT_LINES_ENABLED, via TS).
  if p_project_lines then
    insert into public.invoice_lines
      (id, company_id, invoice_id, line_number, product_id, warehouse_id, description, quantity, unit_price, tax_rate_id, tax_amount, line_total)
    select
      (l.value->>'id')::uuid,
      v_company,
      v_invoice_id,
      l.ord::int,
      case when l.value->>'productId' is not null
            and exists (select 1 from public.products p where p.id = (l.value->>'productId')::uuid and p.company_id = v_company)
           then (l.value->>'productId')::uuid end,
      case when l.value->>'warehouseId' is not null
            and exists (select 1 from public.warehouses w where w.id = (l.value->>'warehouseId')::uuid and w.company_id = v_company)
           then (l.value->>'warehouseId')::uuid end,
      coalesce(l.value->>'description', ''),
      (l.value->>'quantity')::numeric,
      coalesce((l.value->>'unitPrice')::numeric, 0),
      case when l.value->>'taxRateId' is not null
            and exists (select 1 from public.tax_rates t where t.id = (l.value->>'taxRateId')::uuid and t.company_id = v_company)
           then (l.value->>'taxRateId')::uuid end,
      coalesce((l.value->>'taxAmount')::numeric, 0),
      coalesce((l.value->>'lineTotal')::numeric, 0)
    from jsonb_array_elements(v_new_lines) with ordinality as l(value, ord)
    where coalesce((l.value->>'quantity')::numeric, 0) > 0;  -- invoice_lines has check (quantity > 0); RPC lines are always > 0, this is belt-and-suspenders
  end if;

  insert into public.audit_log_entries (company_id, user_id, action, module, record_type, record_id, new_value)
  values (
    v_company, coalesce(p_created_by, 'system'), 'created', 'sales', 'Invoice', v_invoice_id::text,
    jsonb_build_object('fromSalesOrder', v_so.order_number, 'lineCount', jsonb_array_length(v_new_lines), 'total', v_total)
  );

  return jsonb_build_object(
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'subtotal', v_subtotal,
    'tax_total', v_tax_total,
    'total', v_total);
end;
$$;

revoke all on function public.create_invoice_from_sales_order(uuid, jsonb, text, timestamptz, boolean) from public, anon;
grant execute on function public.create_invoice_from_sales_order(uuid, jsonb, text, timestamptz, boolean) to authenticated;
