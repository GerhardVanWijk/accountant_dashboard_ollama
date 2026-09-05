-- 0061_return_note_aware_fulfilment_rpcs
-- Completion-run stabilization (2026-09-05): closes the documented MEDIUM
-- known issue — "Re-delivering previously-returned-and-not-yet-invoiced
-- stock against the SAME Sales Order line is not yet netted into
-- remainingToDeliver" (docs/KNOWN_ISSUES.md, docs/RETURN_NOTES_DESIGN.md
-- § "SCOPE — what this migration deliberately does NOT change" in 0058).
--
-- ══════════════════════════════════════════════════════════════════════
-- THE ONE AUTHORITATIVE PHYSICAL-FULFILMENT FORMULA (now applied at every
-- layer — TypeScript `salesOrderFulfilment.ts` AND both RPCs below):
--
--   orderedQty
--   deliveredQty            = Σ posted Delivery Note line qty
--   returnedUninvoicedQty   = Σ posted Return Note line qty
--   netDeliveredQty         = deliveredQty − returnedUninvoicedQty
--   directlyInvoicedQty     = Σ non-void invoice-line qty with NO
--                              deliveryNoteLineId
--   physicalFulfilledQty    = netDeliveredQty + directlyInvoicedQty
--   remainingToDeliver      = max(0, orderedQty − physicalFulfilledQty)
--   commitmentQty           = remainingToDeliver
--
-- A Return Note only ever exists against delivered-but-NOT-YET-INVOICED
-- goods (`returnNoteService.createDraft`'s own guard, unchanged by this
-- migration) — so a returned quantity can NEVER have been invoiced, and
-- subtracting it from `deliveredQty` can never make `directlyInvoicedQty`
-- double-count anything. This migration does NOT touch invoiced-quantity
-- math anywhere — `remainingToInvoice` (Phase 5B, `create_invoice_from_
-- sales_order`'s legacy-conversion / direct-selection-quantity math) is
-- UNTOUCHED except for the one place a return genuinely changes how much
-- is left to invoice DIRECTLY (see below) and the one place it changes how
-- much of a SPECIFIC delivery-note line is left to invoice (a returned
-- unit of that exact line can never be invoiced again through it).
--
-- BACKWARD COMPATIBILITY: with zero Return Notes ever posted for a company
-- (every pre-Phase-5D row, forever, unless one is posted), `returnedQty`
-- is 0 for every line and both functions below reduce BYTE-IDENTICALLY to
-- their 0055/0054 formulas. Proven by the existing migration-contract
-- tests re-run against this replaced body (`deliveryNotesMigrations.test.ts`)
-- plus new `returnNotesMigrations.test.ts` scenarios.
-- ══════════════════════════════════════════════════════════════════════
--
-- WHAT CHANGES vs 0054 (`post_delivery_note`):
--   `v_remaining := ordered − (deliveredElsewhere − returnedElsewhere) − directInvoiced`
--   `returnedElsewhere` = Σ POSTED return-note line qty for the SAME SO
--   line (return-note lines carry `salesOrderLineId`, mirroring delivery-
--   note lines — see `ReturnNoteLineItem`). This is exactly the worked
--   example from the brief: SO ordered 10, DN delivers 6, RN returns 2
--   uninvoiced → net delivered 4, remaining 6; a second DN for 6 then sees
--   remaining 6 and succeeds, landing at net physical fulfilled 10,
--   remaining 0 — no double count, no double return (0058's own guard,
--   unchanged, still prevents returning the same unit twice).
--
-- WHAT CHANGES vs 0055 (`create_invoice_from_sales_order`):
--   DIRECT branch: `v_remaining := ordered − (delivered − returned) − takenDirect`
--   — a return of uninvoiced delivered stock makes room for a NEW direct
--   invoice against the same line only up to the net-delivered amount (it
--   does NOT invent invoiceable quantity beyond `ordered`; a return only
--   ever *reduces* `deliveredQty`, so this can only ever RAISE `remaining`,
--   never lower it below what 0055 already allowed).
--   DELIVERY-LINKED branch: `v_remaining := dnLineQty − dnLineTaken − dnLineReturned`
--   — a specific delivery-note line that has had some of its quantity
--   returned can no longer be invoiced for that returned portion through
--   the "invoice this delivery" path (it was physically taken back before
--   ever being billed). `dnLineReturned` sums POSTED return-note lines
--   carrying that EXACT `deliveryNoteLineId` — the same join key 0058's
--   own `alreadyReturnedQty` aggregate already uses.
--
-- COMPANY SAFETY: the new `return_notes` reads in both functions are
-- filtered by `company_id = v_company` exactly like every other table read
-- in these functions — no new cross-company surface introduced.
--
-- LOCKING: unchanged — neither function acquires any NEW lock. `return_notes`
-- is only ever read (aggregate sum), never written, by either function; the
-- sole writer of `return_notes.status = 'posted'` remains `post_return_note`
-- (0058), which itself locks the Return Note row then the Delivery Note row
-- — it never touches `sales_orders`, so no new lock-ordering path is created
-- between it and these two functions' existing `sales_orders` lock.

create or replace function public.post_delivery_note(
  p_delivery_note_id  uuid,
  p_contra_account_id uuid,
  p_line_accounts     jsonb,      -- [{ "deliveryNoteLineId": uuid-text, "inventoryAccountId": uuid-text }, ...]
  p_posted_by         text default null,
  p_posting_date      date default null
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company             uuid := (select public.get_my_company_id());
  v_dn                  public.delivery_notes;
  v_so                  public.sales_orders;
  v_now                 date := coalesce(p_posting_date, current_date);
  v_line                jsonb;
  v_dnl_id              text;
  v_sol_id              text;
  v_product_id          uuid;
  v_qty                 numeric;
  v_seen                text[] := array[]::text[];
  v_so_line             jsonb;
  v_ordered             numeric;
  v_delivered_elsewhere numeric;
  v_returned_elsewhere  numeric;
  v_direct_invoiced     numeric;
  v_remaining           numeric;
  v_inv_acct            uuid;
  v_pit_lines           jsonb := '[]'::jsonb;
  v_posting_key         text;
  v_result              jsonb;
begin
  if v_company is null then
    raise exception 'post_delivery_note: no company context';
  end if;
  if p_delivery_note_id is null then
    raise exception 'post_delivery_note: p_delivery_note_id is required';
  end if;
  if p_contra_account_id is null then
    raise exception 'post_delivery_note: p_contra_account_id is required';
  end if;
  if p_line_accounts is null or jsonb_typeof(p_line_accounts) <> 'array' or jsonb_array_length(p_line_accounts) = 0 then
    raise exception 'post_delivery_note: p_line_accounts must be a non-empty array';
  end if;

  -- 1. LOCK the Delivery Note — the double-post / concurrent-post-of-the-
  --    SAME-document guard.
  select * into v_dn
    from public.delivery_notes
   where id = p_delivery_note_id and company_id = v_company
   for update;
  if not found then
    raise exception 'post_delivery_note: delivery note % not found in company', p_delivery_note_id;
  end if;
  if v_dn.status <> 'draft' then
    raise exception 'post_delivery_note: delivery note % is % — only a draft can be posted', v_dn.delivery_note_number, v_dn.status;
  end if;
  if jsonb_array_length(coalesce(v_dn.line_items, '[]'::jsonb)) = 0 then
    raise exception 'post_delivery_note: delivery note % has no lines to post', v_dn.delivery_note_number;
  end if;

  if not exists (select 1 from public.accounts where id = p_contra_account_id and company_id = v_company) then
    raise exception 'post_delivery_note: contra account % does not belong to this company', p_contra_account_id;
  end if;

  -- 2. LOCK the Sales Order — serialises concurrent post_delivery_note
  --    calls against the SAME order (see 0054's own CRITICAL FINDING banner
  --    re: create_invoice_from_sales_order's separate concurrency contract).
  select * into v_so
    from public.sales_orders
   where id = v_dn.sales_order_id and company_id = v_company
   for update;
  if not found then
    raise exception 'post_delivery_note: sales order % not found in company', v_dn.sales_order_id;
  end if;
  if v_so.status = 'cancelled' then
    raise exception 'post_delivery_note: sales order % has been cancelled', v_so.order_number;
  end if;
  if v_so.status = 'closed' then
    raise exception 'post_delivery_note: sales order % is closed — its remainder was abandoned', v_so.order_number;
  end if;

  -- 3. Validate + build every stored delivery-note line. Product / quantity /
  --    salesOrderLineId are read ONLY from v_dn.line_items (already
  --    persisted, authoritative) — never re-supplied by this call's params.
  for v_line in select * from jsonb_array_elements(v_dn.line_items)
  loop
    v_dnl_id := v_line->>'id';
    if v_dnl_id is null then
      raise exception 'post_delivery_note: a delivery note line is missing id';
    end if;
    if v_dnl_id = any(v_seen) then
      raise exception 'post_delivery_note: line % appears more than once', v_dnl_id;
    end if;
    v_seen := v_seen || v_dnl_id;

    v_sol_id := v_line->>'salesOrderLineId';
    if v_sol_id is null then
      raise exception 'post_delivery_note: line % has no salesOrderLineId', v_dnl_id;
    end if;

    v_product_id := nullif(v_line->>'productId', '')::uuid;
    if v_product_id is null then
      raise exception 'post_delivery_note: line % has no productId — a non-inventory line cannot be delivered', v_dnl_id;
    end if;

    begin
      v_qty := (v_line->>'quantity')::numeric;
    exception when others then
      raise exception 'post_delivery_note: line % quantity is not a number', v_dnl_id;
    end;
    if v_qty is null or v_qty <= 0 then
      raise exception 'post_delivery_note: line % quantity must be greater than zero', v_dnl_id;
    end if;
    if v_qty <> round(v_qty, 3) then
      raise exception 'post_delivery_note: line % quantity has more than 3 decimal places', v_dnl_id;
    end if;

    -- the authoritative SO line
    select l.value into v_so_line
      from jsonb_array_elements(coalesce(v_so.line_items, '[]'::jsonb)) l
     where (l.value->>'id') = v_sol_id
     limit 1;
    if v_so_line is null then
      raise exception 'post_delivery_note: line %: sales order line % not found on sales order %', v_dnl_id, v_sol_id, v_so.order_number;
    end if;
    v_ordered := coalesce((v_so_line->>'quantity')::numeric, 0);

    -- deliveredElsewhere = Σ POSTED line qty from every OTHER delivery note
    -- against this SO line (design doc Part 8's `deliveredQty`, this DN excluded).
    select coalesce(sum((l.value->>'quantity')::numeric), 0) into v_delivered_elsewhere
      from public.delivery_notes dn, jsonb_array_elements(coalesce(dn.line_items, '[]'::jsonb)) l
     where dn.company_id = v_company and dn.sales_order_id = v_so.id and dn.status = 'posted'
       and dn.id <> v_dn.id
       and (l.value->>'salesOrderLineId') = v_sol_id;

    -- returnedElsewhere (0061, Phase-5D-aware): Σ POSTED return-note line
    -- qty against this SAME SO line, from ANY return note (a Return Note
    -- can only ever exist against goods delivered by a DIFFERENT,
    -- already-posted Delivery Note than the one currently being posted —
    -- this draft has never had a line id a return could reference yet, so
    -- no self-exclusion is needed, unlike v_delivered_elsewhere).
    select coalesce(sum((l.value->>'quantity')::numeric), 0) into v_returned_elsewhere
      from public.return_notes rn, jsonb_array_elements(coalesce(rn.line_items, '[]'::jsonb)) l
     where rn.company_id = v_company and rn.status = 'posted'
       and (l.value->>'salesOrderLineId') = v_sol_id;

    -- directlyInvoicedQty = Σ POSTED invoice-line qty for this SO line that
    -- carries NO deliveryNoteLineId (design doc Part 8 — the invoice-before-
    -- delivery bypass path; deliberately unconstrained by this RPC). A
    -- line that DOES carry deliveryNoteLineId is excluded here precisely
    -- because it is already counted once, above, inside deliveredElsewhere
    -- — this is the double-subtraction guard (CP-5C-A hardening scenario B/H).
    select coalesce(sum((l.value->>'quantity')::numeric), 0) into v_direct_invoiced
      from public.invoices i, jsonb_array_elements(coalesce(i.line_items, '[]'::jsonb)) l
     where i.company_id = v_company and i.sales_order_id = v_so.id
       and i.status not in ('draft', 'void')
       and (l.value->>'salesOrderLineId') = v_sol_id
       and not (l.value ? 'deliveryNoteLineId');

    -- netDeliveredElsewhere = deliveredElsewhere − returnedElsewhere (0061):
    -- a posted return hands physically-departed-but-uninvoiced stock back,
    -- so it must free up remainingToDeliver for a FRESH delivery against
    -- the same line — never below 0 (a return can never exceed what was
    -- delivered — 0058's own returnable-quantity guard already enforces
    -- that at return-post time).
    v_remaining := round(v_ordered - greatest(v_delivered_elsewhere - v_returned_elsewhere, 0) - v_direct_invoiced, 3);
    if v_qty - v_remaining > 0.0000005 then
      raise exception 'post_delivery_note: line %: cannot deliver % of sales order line % — only % remain to deliver',
        v_dnl_id, round(v_qty, 3), v_sol_id, greatest(v_remaining, 0);
    end if;

    -- resolve this line's inventory account from the caller-supplied map —
    -- category-mapped, TS-side knowledge, never re-derived here.
    select nullif(a.value->>'inventoryAccountId', '')::uuid into v_inv_acct
      from jsonb_array_elements(p_line_accounts) a
     where (a.value->>'deliveryNoteLineId') = v_dnl_id
     limit 1;
    if v_inv_acct is null then
      raise exception 'post_delivery_note: line %: no inventoryAccountId supplied', v_dnl_id;
    end if;
    if not exists (select 1 from public.accounts where id = v_inv_acct and company_id = v_company) then
      raise exception 'post_delivery_note: line %: inventoryAccountId % does not belong to this company', v_dnl_id, v_inv_acct;
    end if;

    v_pit_lines := v_pit_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'warehouse_id', v_dn.warehouse_id,
      'quantity_delta', -v_qty,
      'costing_mode', 'issue',
      'movement_type', 'delivery',
      'source_document_line_id', v_dnl_id,
      'inventory_account_id', v_inv_acct,
      'contra_account_id', p_contra_account_id,
      'non_stock', false
    ));
  end loop;

  if jsonb_array_length(v_pit_lines) = 0 then
    raise exception 'post_delivery_note: delivery note % has no deliverable lines', v_dn.delivery_note_number;
  end if;

  -- 4. Post — via the EXISTING, UNCHANGED engine. <sourceType>:<sourceId>:<verb>
  --    posting key, matching the established convention (invoice:<id>:post).
  v_posting_key := 'delivery_note:' || v_dn.id::text || ':post';

  select public.post_inventory_transaction(
    p_posting_key   => v_posting_key,
    p_source_type   => 'delivery_note',
    p_source_id     => v_dn.id,
    p_movement_date => v_now,
    p_created_by    => coalesce(p_posted_by, 'system'),
    p_lines         => v_pit_lines,
    p_extra_journal => '[]'::jsonb,
    p_journal       => jsonb_build_object(
                          'memo', 'Delivery ' || v_dn.delivery_note_number || ' — ' || v_so.order_number,
                          'source', 'delivery_note'
                        ),
    p_audit         => jsonb_build_object(
                          'action', 'delivery_note_posted',
                          'module', 'sales',
                          'record_type', 'DeliveryNote',
                          'record_id', v_dn.id::text,
                          'new_value', jsonb_build_object(
                            'deliveryNoteNumber', v_dn.delivery_note_number,
                            'salesOrderId', v_so.id,
                            'salesOrderNumber', v_so.order_number,
                            'lineCount', jsonb_array_length(v_pit_lines)
                          )
                        )
  ) into v_result;

  -- 5. Flip the Delivery Note to posted — the ONLY status write this RPC
  --    makes, and ONLY reached after post_inventory_transaction has already
  --    returned successfully.
  update public.delivery_notes
     set status = 'posted',
         journal_entry_id = nullif(v_result->>'journal_entry_id', '')::uuid,
         updated_at = now()
   where id = v_dn.id;

  return jsonb_build_object(
    'delivery_note_id', v_dn.id,
    'delivery_note_number', v_dn.delivery_note_number,
    'journal_entry_id', v_result->>'journal_entry_id',
    'movement_ids', v_result->'movement_ids',
    'idempotent', coalesce(v_result->'idempotent', 'false'::jsonb));
end;
$$;

revoke all on function public.post_delivery_note(uuid, uuid, jsonb, text, date) from public, anon;
grant execute on function public.post_delivery_note(uuid, uuid, jsonb, text, date) to authenticated;

-- ══════════════════════════════════════════════════════════════════════

create or replace function public.create_invoice_from_sales_order(
  p_sales_order_id uuid,
  p_selections     jsonb,     -- [{ "salesOrderLineId": uuid-text, "quantity": number, "deliveryNoteLineId": uuid-text? }, ...]
  p_created_by     text default null,
  p_issue_date     timestamptz default null
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

  -- 1. LOCK the Sales Order — serialises concurrent create-invoice AND
  --    concurrent post_delivery_note (0054/0061) calls for this SO (same
  --    row, same lock — see the locking note above).
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
  --    UNCHANGED from 0049.
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

    v_dnl_id := v_sel->>'deliveryNoteLineId';

    if v_dnl_id is not null then
      -- ── DELIVERY-LINKED SELECTION (5C, now 5D-aware) ─────────────────
      -- the physical event already happened at Delivery Note posting;
      -- this consumes invoiceable quantity on THAT delivery note line
      -- only, never remainingToDeliver again.
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

      -- how much of THIS delivery note line has already been invoiced
      -- (draft + posted, non-void) — a DN-line-scoped guard, independent
      -- of the SO-line-level remainingToDeliver.
      select coalesce(sum((il.value->>'quantity')::numeric), 0) into v_dn_line_taken
        from public.invoices i, jsonb_array_elements(coalesce(i.line_items, '[]'::jsonb)) il
       where i.company_id = v_company and i.sales_order_id = p_sales_order_id
         and i.status <> 'void'
         and (il.value->>'deliveryNoteLineId') = v_dnl_id;

      -- how much of THIS delivery note line has already been physically
      -- RETURNED (0061, Phase-5D-aware) — returned stock can never be
      -- invoiced through the delivery it came back from; it went back to
      -- 1200 uninvoiced, so it is no longer this delivery's to bill.
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
      -- ── DIRECT SELECTION (Phase 5B behaviour, delivery- and return-aware) ──
      -- directlyInvoicedQty: draft+posted, EXCLUDING delivery-linked lines
      -- (they are not "direct" — counted instead via deliveredQty below;
      -- this exclusion is the double-subtraction guard).
      select coalesce(sum((il.value->>'quantity')::numeric), 0) into v_taken_direct
        from public.invoices i, jsonb_array_elements(coalesce(i.line_items,'[]'::jsonb)) il
       where i.sales_order_id = p_sales_order_id and i.company_id = v_company
         and i.status <> 'void'
         and (il.value->>'salesOrderLineId') = v_sol_id
         and not (il.value ? 'deliveryNoteLineId');

      -- deliveredQty: POSTED delivery notes only — a draft Delivery Note
      -- never represents physical stock movement (Part 3/8).
      select coalesce(sum((l.value->>'quantity')::numeric), 0) into v_delivered
        from public.delivery_notes dn, jsonb_array_elements(coalesce(dn.line_items,'[]'::jsonb)) l
       where dn.company_id = v_company and dn.sales_order_id = p_sales_order_id and dn.status = 'posted'
         and (l.value->>'salesOrderLineId') = v_sol_id;

      -- returnedQty (0061): POSTED return notes for this SO line — nets
      -- back into remaining-to-invoice exactly as it nets into
      -- remainingToDeliver; a return can only ever reduce deliveredQty,
      -- never invent quantity beyond what was ordered.
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

    -- totals: preserve the SO line exactly when billing the whole line,
    -- otherwise recompute at the SO line's own effective rate. UNCHANGED
    -- from 0049 — orthogonal to direct-vs-delivery-linked.
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
    -- Stamp deliveryNoteLineId only when this selection was delivery-linked.
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

  -- 4. Allocate an invoice number + INSERT the draft (retry on a number clash).
  --    UNCHANGED from 0049.
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

  -- 5. audit — UNCHANGED from 0049.
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
