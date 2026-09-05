-- 0058_post_return_note_rpc
-- Phase 5D. Makes "post an existing DRAFT Return Note" a SINGLE atomic,
-- concurrency-safe operation — the same composition pattern `post_delivery_note`
-- (0054) established: this function itself locks rows and re-derives
-- quantities, then calls the EXISTING, UNCHANGED `post_inventory_transaction`
-- (0031/0032) for the actual stock/GL write. No change to the posting engine
-- is needed or made.
--
-- ACCOUNTING TREATMENT (explicitly approved, docs/RETURN_NOTES_DESIGN.md):
--   DR 1200 Inventory
--   CR 1220 Goods Delivered Not Invoiced
-- The exact reversal of what `post_delivery_note` posted (DR 1220 / CR 1200)
-- — no revenue, no AR, no VAT, no customer refund, because there was never
-- an invoice. This is a `return_in` costing-mode line (0031) with an
-- EXPLICIT `unit_cost_override` (0032, already-existing engine support) set
-- to the FROZEN unit cost recorded on the ORIGINAL delivery's own
-- `stock_movements` row — never the product's current WAC, which could have
-- drifted since the goods left. `return_in` already blends this quantity
-- back into the WAC pool at that frozen cost via `post_inventory_transaction`
-- itself (a receipt-shaped costing mode, unchanged) — no new engine logic.
--
-- RETURN QUANTITY MODEL (per DELIVERY NOTE LINE, not per SO line — a return
-- always traces to the specific physical dispatch it reverses):
--   deliveredQty              = the Delivery Note line's own quantity
--   invoicedQty               = Σ non-void invoice-line qty carrying THIS
--                                 EXACT deliveryNoteLineId (0055's own
--                                 linking field — an invoiced quantity can
--                                 never be returned here; it goes through a
--                                 Credit Note instead)
--   alreadyReturnedQty        = Σ POSTED return-note-line qty against THIS
--                                 EXACT deliveryNoteLineId, from every OTHER
--                                 return note (this one excluded)
--   returnableUninvoicedQty   = max(0, deliveredQty - invoicedQty - alreadyReturnedQty)
-- Re-derived fresh inside this function's own transaction — never trusted
-- from the client — exactly the discipline 0054/0055/0049 already hold to.
--
-- SCOPE — what this migration deliberately does NOT change: the SO-line-level
-- `remainingToDeliver`/`remainingToInvoice` read model
-- (`salesOrderFulfilment.ts`) and `post_delivery_note`'s (0054) own
-- `deliveredElsewhere` aggregate are UNCHANGED — a Return Note does not
-- currently net back into "how much of this Sales Order line remains to
-- deliver again". Re-delivering previously-returned-and-not-yet-invoiced
-- stock against the SAME Sales Order line is a known, documented, narrower
-- follow-on (the same class of cross-RPC compatibility question 0055 solved
-- for delivery-vs-invoice; solving it for delivery-vs-return needs the same
-- multi-scenario proof rigor and is deliberately left out of this run rather
-- than rushed). What Return Notes DO fully and correctly guarantee, proven
-- by the formula above: no over-return, no returning already-invoiced
-- quantity through this document, no double-return of the same quantity.
--
-- LOCKING: Return Note row FIRST (double-post guard, same pattern as 0054's
-- own Delivery Note lock), then the Delivery Note row (serialises concurrent
-- Return Note posts against lines of the SAME delivery — mirrors 0054
-- locking the Sales Order row next). Product rows are locked third, inside
-- `post_inventory_transaction` itself, in `order by id` — unchanged,
-- deadlock-safe.
--
-- SECURITY INVOKER, SAME AS 0054: no SECURITY DEFINER anywhere in this call
-- chain; RLS applies exactly as if the caller made two separate top-level
-- RPC calls in one transaction. `company_id` is resolved from
-- `get_my_company_id()` and never taken from the client.

create or replace function public.post_return_note(
  p_return_note_id    uuid,
  p_contra_account_id uuid,
  p_line_accounts     jsonb,      -- [{ "returnNoteLineId": uuid-text, "inventoryAccountId": uuid-text }, ...]
  p_posted_by         text default null,
  p_posting_date      date default null
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company           uuid := (select public.get_my_company_id());
  v_rn                public.return_notes;
  v_dn                public.delivery_notes;
  v_now               date := coalesce(p_posting_date, current_date);
  v_line              jsonb;
  v_rnl_id            text;
  v_dnl_id            text;
  v_product_id        uuid;
  v_qty               numeric;
  v_seen              text[] := array[]::text[];
  v_dn_line           jsonb;
  v_delivered_qty     numeric;
  v_invoiced_qty      numeric;
  v_already_returned  numeric;
  v_returnable        numeric;
  v_frozen_cost       numeric;
  v_inv_acct          uuid;
  v_pit_lines         jsonb := '[]'::jsonb;
  v_posting_key       text;
  v_result            jsonb;
begin
  if v_company is null then
    raise exception 'post_return_note: no company context';
  end if;
  if p_return_note_id is null then
    raise exception 'post_return_note: p_return_note_id is required';
  end if;
  if p_contra_account_id is null then
    raise exception 'post_return_note: p_contra_account_id is required';
  end if;
  if p_line_accounts is null or jsonb_typeof(p_line_accounts) <> 'array' or jsonb_array_length(p_line_accounts) = 0 then
    raise exception 'post_return_note: p_line_accounts must be a non-empty array';
  end if;

  -- 1. LOCK the Return Note — double-post / concurrent-post-of-the-SAME-
  --    document guard, exactly 0054's own step 1.
  select * into v_rn
    from public.return_notes
   where id = p_return_note_id and company_id = v_company
   for update;
  if not found then
    raise exception 'post_return_note: return note % not found in company', p_return_note_id;
  end if;
  if v_rn.status <> 'draft' then
    raise exception 'post_return_note: return note % is % — only a draft can be posted', v_rn.return_note_number, v_rn.status;
  end if;
  if jsonb_array_length(coalesce(v_rn.line_items, '[]'::jsonb)) = 0 then
    raise exception 'post_return_note: return note % has no lines to post', v_rn.return_note_number;
  end if;
  if not exists (select 1 from public.accounts where id = p_contra_account_id and company_id = v_company) then
    raise exception 'post_return_note: contra account % does not belong to this company', p_contra_account_id;
  end if;

  -- 2. LOCK the Delivery Note — serialises concurrent post_return_note calls
  --    against lines of the SAME delivery.
  select * into v_dn
    from public.delivery_notes
   where id = v_rn.delivery_note_id and company_id = v_company
   for update;
  if not found then
    raise exception 'post_return_note: delivery note % not found in company', v_rn.delivery_note_id;
  end if;
  if v_dn.status <> 'posted' then
    raise exception 'post_return_note: delivery note % is % — only a posted delivery note has physical stock to return', v_dn.delivery_note_number, v_dn.status;
  end if;
  if v_rn.warehouse_id <> v_dn.warehouse_id then
    raise exception 'post_return_note: return note % warehouse does not match delivery note % warehouse', v_rn.return_note_number, v_dn.delivery_note_number;
  end if;
  if v_rn.sales_order_id <> v_dn.sales_order_id then
    raise exception 'post_return_note: return note % sales order does not match delivery note % sales order', v_rn.return_note_number, v_dn.delivery_note_number;
  end if;
  if v_rn.customer_id <> v_dn.customer_id then
    raise exception 'post_return_note: return note % customer does not match delivery note % customer', v_rn.return_note_number, v_dn.delivery_note_number;
  end if;

  -- 3. Validate + build every stored return-note line. productId/quantity
  --    are read ONLY from the Delivery Note's OWN stored line_items (never
  --    re-supplied by this call's params) — the return can only ever be
  --    what was actually delivered.
  for v_line in select * from jsonb_array_elements(v_rn.line_items)
  loop
    v_rnl_id := v_line->>'id';
    if v_rnl_id is null then
      raise exception 'post_return_note: a return note line is missing id';
    end if;
    if v_rnl_id = any(v_seen) then
      raise exception 'post_return_note: line % appears more than once', v_rnl_id;
    end if;
    v_seen := v_seen || v_rnl_id;

    v_dnl_id := v_line->>'deliveryNoteLineId';
    if v_dnl_id is null then
      raise exception 'post_return_note: line % has no deliveryNoteLineId', v_rnl_id;
    end if;

    begin
      v_qty := (v_line->>'quantity')::numeric;
    exception when others then
      raise exception 'post_return_note: line % quantity is not a number', v_rnl_id;
    end;
    if v_qty is null or v_qty <= 0 then
      raise exception 'post_return_note: line % quantity must be greater than zero', v_rnl_id;
    end if;
    if v_qty <> round(v_qty, 3) then
      raise exception 'post_return_note: line % quantity has more than 3 decimal places', v_rnl_id;
    end if;

    -- the authoritative delivery-note line
    select l.value into v_dn_line
      from jsonb_array_elements(coalesce(v_dn.line_items, '[]'::jsonb)) l
     where (l.value->>'id') = v_dnl_id
     limit 1;
    if v_dn_line is null then
      raise exception 'post_return_note: line %: delivery note line % not found on delivery note %', v_rnl_id, v_dnl_id, v_dn.delivery_note_number;
    end if;
    v_product_id := nullif(v_dn_line->>'productId', '')::uuid;
    if v_product_id is null then
      raise exception 'post_return_note: line %: delivery note line % has no product', v_rnl_id, v_dnl_id;
    end if;
    v_delivered_qty := coalesce((v_dn_line->>'quantity')::numeric, 0);

    -- invoicedQty: Σ non-void invoice-line qty carrying this EXACT deliveryNoteLineId.
    select coalesce(sum((il.value->>'quantity')::numeric), 0) into v_invoiced_qty
      from public.invoices i, jsonb_array_elements(coalesce(i.line_items, '[]'::jsonb)) il
     where i.company_id = v_company and i.status <> 'void'
       and (il.value->>'deliveryNoteLineId') = v_dnl_id;

    -- alreadyReturnedQty: Σ POSTED return-note-line qty against this EXACT
    -- deliveryNoteLineId, from every OTHER return note (this one excluded —
    -- the double-post guard above already prevents this SAME note being
    -- posted twice, so "excluded" here only matters for OTHER documents).
    select coalesce(sum((l.value->>'quantity')::numeric), 0) into v_already_returned
      from public.return_notes rn, jsonb_array_elements(coalesce(rn.line_items, '[]'::jsonb)) l
     where rn.company_id = v_company and rn.status = 'posted' and rn.id <> v_rn.id
       and (l.value->>'deliveryNoteLineId') = v_dnl_id;

    v_returnable := round(v_delivered_qty - v_invoiced_qty - v_already_returned, 3);
    if v_qty - v_returnable > 0.0000005 then
      raise exception 'post_return_note: line %: cannot return % of delivery note line % — only % remain returnable (delivered %, invoiced %, already returned %)',
        v_rnl_id, round(v_qty, 3), v_dnl_id, greatest(v_returnable, 0), v_delivered_qty, v_invoiced_qty, v_already_returned;
    end if;

    -- frozen unit cost: the EXACT stock_movements row the Delivery Note's
    -- own posting created for this line — never today's WAC.
    select sm.unit_cost into v_frozen_cost
      from public.stock_movements sm
     where sm.company_id = v_company
       and sm.source_document_type = 'delivery_note'
       and sm.source_document_id = v_dn.id
       and sm.source_document_line_id::text = v_dnl_id
     limit 1;
    if v_frozen_cost is null then
      raise exception 'post_return_note: line %: no frozen delivery cost evidence found for delivery note line %', v_rnl_id, v_dnl_id;
    end if;

    -- resolve this line's inventory account from the caller-supplied map —
    -- category-mapped, TS-side knowledge, never re-derived here (same
    -- pattern as 0054).
    select nullif(a.value->>'inventoryAccountId', '')::uuid into v_inv_acct
      from jsonb_array_elements(p_line_accounts) a
     where (a.value->>'returnNoteLineId') = v_rnl_id
     limit 1;
    if v_inv_acct is null then
      raise exception 'post_return_note: line %: no inventoryAccountId supplied', v_rnl_id;
    end if;
    if not exists (select 1 from public.accounts where id = v_inv_acct and company_id = v_company) then
      raise exception 'post_return_note: line %: inventoryAccountId % does not belong to this company', v_rnl_id, v_inv_acct;
    end if;

    v_pit_lines := v_pit_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'warehouse_id', v_rn.warehouse_id,
      'quantity_delta', v_qty,
      'costing_mode', 'return_in',
      'unit_cost_override', v_frozen_cost,
      'movement_type', 'return_note',
      'source_document_line_id', v_rnl_id,
      'inventory_account_id', v_inv_acct,
      'contra_account_id', p_contra_account_id,
      'non_stock', false
    ));
  end loop;

  if jsonb_array_length(v_pit_lines) = 0 then
    raise exception 'post_return_note: return note % has no returnable lines', v_rn.return_note_number;
  end if;

  -- 4. Post — via the EXISTING, UNCHANGED engine.
  v_posting_key := 'return_note:' || v_rn.id::text || ':post';

  select public.post_inventory_transaction(
    p_posting_key   => v_posting_key,
    p_source_type   => 'return_note',
    p_source_id     => v_rn.id,
    p_movement_date => v_now,
    p_created_by    => coalesce(p_posted_by, 'system'),
    p_lines         => v_pit_lines,
    p_extra_journal => '[]'::jsonb,
    p_journal       => jsonb_build_object(
                          'memo', 'Return ' || v_rn.return_note_number || ' — ' || v_dn.delivery_note_number,
                          'source', 'return_note'
                        ),
    p_audit         => jsonb_build_object(
                          'action', 'return_note_posted',
                          'module', 'sales',
                          'record_type', 'ReturnNote',
                          'record_id', v_rn.id::text,
                          'new_value', jsonb_build_object(
                            'returnNoteNumber', v_rn.return_note_number,
                            'deliveryNoteId', v_dn.id,
                            'deliveryNoteNumber', v_dn.delivery_note_number,
                            'lineCount', jsonb_array_length(v_pit_lines)
                          )
                        )
  ) into v_result;

  -- 5. Flip the Return Note to posted — the ONLY status write this RPC
  --    makes, and ONLY reached after post_inventory_transaction has already
  --    returned successfully (same "posted implies real GL/stock evidence"
  --    guarantee as 0054).
  update public.return_notes
     set status = 'posted',
         journal_entry_id = nullif(v_result->>'journal_entry_id', '')::uuid,
         updated_at = now()
   where id = v_rn.id;

  return jsonb_build_object(
    'return_note_id', v_rn.id,
    'return_note_number', v_rn.return_note_number,
    'journal_entry_id', v_result->>'journal_entry_id',
    'movement_ids', v_result->'movement_ids',
    'idempotent', coalesce(v_result->'idempotent', 'false'::jsonb));
end;
$$;

revoke all on function public.post_return_note(uuid, uuid, jsonb, text, date) from public, anon;
grant execute on function public.post_return_note(uuid, uuid, jsonb, text, date) to authenticated;
