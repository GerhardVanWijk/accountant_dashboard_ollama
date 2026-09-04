-- 0049_create_invoice_from_sales_order_rpc
-- Phase 5B FINAL. APPLIED to project bcaffvpibpitpuqglszn 2026-09-04
-- (recorded version 20260904115239), after 0048. Rollback-wrapped smoke test
-- against SO-2026-0004 confirmed: creates a draft, links each line to its SO
-- line, over-invoice rejected inside the same transaction. Nothing persisted.
--
-- Makes "create a DRAFT invoice from a Sales Order for an explicit per-line
-- quantity selection" a SINGLE atomic, concurrency-safe operation — the
-- database is the final authority on "you cannot invoice more than remains",
-- closing the create/create race the TypeScript-only `buildInvoiceFromSelections`
-- check could not (CP-5B.2 KNOWN ISSUE).
--
-- SAFETY PHILOSOPHY (mirrors apply_customer_deposit / post_inventory_transaction):
--   * SECURITY INVOKER — every table's RLS applies as the calling user.
--   * v_company := get_my_company_id() — the client NEVER supplies company_id.
--   * LOCK the sales_orders row FOR UPDATE — serialises every concurrent
--     create-invoice for THAT order. Two callers racing the same SO line can no
--     longer both pass the remaining-quantity check.
--   * Remaining quantity is RE-COMPUTED inside the transaction from the current
--     invoice evidence (posted + draft both count as "taken", exactly like
--     `remainingToInvoiceQty`), so a stale caller is rejected.
--   * Every invoice-line field (product_id / warehouse_id / tax_rate_id /
--     unit_price / description) is taken from the AUTHORITATIVE Sales Order
--     line jsonb — the caller supplies ONLY { salesOrderLineId, quantity }.
--     Forged product / price / tax data in the request is ignored.
--   * Each created invoice line gets its OWN fresh uuid; salesOrderLineId links
--     it back to the SO line. Never reuses the SO line id.
--
-- NO GL / stock / VAT posting — the invoice is created as `draft`. It stays
-- draft until InvoiceService.postInvoice() runs (unchanged engine). The Sales
-- Order status is NOT touched here (a draft never flips commercial status —
-- the confirmed -> fulfilled flip happens at post time via
-- InvoiceService.onInvoicePosted).
--
-- NOT idempotent on a client key: a lost-response retry could create a second
-- draft, but the remaining-quantity cap (which counts existing drafts) rejects
-- it once it would exceed the ordered quantity. A full request-id idempotency
-- log is a future nicety, not required for the concurrency guarantee.

create or replace function public.create_invoice_from_sales_order(
  p_sales_order_id uuid,
  p_selections     jsonb,     -- [{ "salesOrderLineId": uuid-text, "quantity": number }, ...]
  p_created_by     text default null,
  p_issue_date     timestamptz default null
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company        uuid := (select public.get_my_company_id());
  v_so             public.sales_orders;
  v_now            timestamptz := coalesce(p_issue_date, now());
  v_year           text := to_char(v_now, 'YYYY');
  v_sel            jsonb;
  v_sol_id         text;
  v_qty            numeric;
  v_seen           text[] := array[]::text[];
  v_so_line        jsonb;
  v_ordered        numeric;
  v_taken          numeric;
  v_remaining      numeric;
  v_unit_price     numeric;
  v_src_line_total numeric;
  v_src_tax        numeric;
  v_line_total     numeric;
  v_tax_amount     numeric;
  v_rate           numeric;
  v_new_lines      jsonb := '[]'::jsonb;
  v_subtotal       numeric := 0;
  v_tax_total      numeric := 0;
  v_total          numeric;
  v_has_legacy_link boolean;
  v_invoice_id     uuid;
  v_invoice_number text;
  v_seq            bigint;
  v_attempt        int := 0;
begin
  if v_company is null then
    raise exception 'create_invoice_from_sales_order: no company context';
  end if;
  if p_selections is null or jsonb_typeof(p_selections) <> 'array' or jsonb_array_length(p_selections) = 0 then
    raise exception 'create_invoice_from_sales_order: select at least one line to invoice';
  end if;

  -- 1. LOCK the Sales Order — serialises concurrent create-invoice for this SO.
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

  -- 2. Reject a pre-5B.1 legacy full conversion (a linked invoice whose lines
  --    carry no salesOrderLineId) — there is no per-line evidence to invoice.
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

  -- 3. Validate + build every selected line.
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

    -- the authoritative SO line
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

    -- taken = Σ non-void linked invoice-line qty for this SO line (draft + posted)
    select coalesce(sum((il.value->>'quantity')::numeric), 0)
      into v_taken
      from public.invoices i, jsonb_array_elements(coalesce(i.line_items,'[]'::jsonb)) il
     where i.sales_order_id = p_sales_order_id and i.company_id = v_company
       and i.status <> 'void'
       and (il.value->>'salesOrderLineId') = v_sol_id;

    v_remaining := round(v_ordered - v_taken, 3);
    if v_qty - v_remaining > 0.0000005 then
      raise exception 'create_invoice_from_sales_order: cannot invoice % of line % — only % remain to invoice',
        round(v_qty,3), v_sol_id, greatest(v_remaining, 0);
    end if;

    -- totals: preserve the SO line exactly when billing the whole line,
    -- otherwise recompute at the SO line's own effective rate.
    if abs(v_qty - v_ordered) <= 0.0000005 then
      v_line_total := round(v_src_line_total, 2);
      v_tax_amount := round(v_src_tax, 2);
    else
      v_rate := case when v_src_line_total > 0 then v_src_tax / v_src_line_total else 0 end;
      v_line_total := round(v_qty * v_unit_price, 2);
      v_tax_amount := round(v_line_total * v_rate, 2);
    end if;

    -- keep the SO line's own product / warehouse / tax-rate ids; drop them when
    -- absent (service line) so the shape matches the TS-built line exactly.
    v_new_lines := v_new_lines || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'productId', v_so_line->>'productId',
        'warehouseId', v_so_line->>'warehouseId',
        'taxRateId', v_so_line->>'taxRateId'
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

  -- 4. Allocate an invoice number + INSERT the draft (retry on a number clash).
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

  -- 5. audit
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

revoke all on function public.create_invoice_from_sales_order(uuid, jsonb, text, timestamptz) from public, anon;
grant execute on function public.create_invoice_from_sales_order(uuid, jsonb, text, timestamptz) to authenticated;
