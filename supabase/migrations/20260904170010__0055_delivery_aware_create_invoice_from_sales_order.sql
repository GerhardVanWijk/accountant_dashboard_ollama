-- 0055_delivery_aware_create_invoice_from_sales_order
-- Phase 5C-A HARDENING, companion fix (docs/DELIVERY_NOTES_DESIGN.md §
-- "CP-5C-A HARDENING" scenario F). AUTHORED, NOT APPLIED.
--
-- ══════════════════════════════════════════════════════════════════════
-- THIS IS NOT A PHASE 5B REOPENING. Phase 5B remains COMPLETE — its own
-- worked example, invariants, and shipped behaviour (docs/SALES_FULFILMENT.md)
-- are UNCHANGED and fully preserved by this migration (proven below and by
-- the contract tests). This is a PHASE 5C COMPATIBILITY AMENDMENT: Phase 5C
-- introduces a SECOND source of physical fulfilment (posted Delivery
-- Notes) that did not exist when 0049 was authored and reviewed. 0049's
-- own "how much remains to invoice" check could not, and did not, account
-- for a source of physical departure it had no knowledge of. This
-- migration `create or replace`s the SAME function (same name, same
-- signature) to teach it about that second source — nothing else changes.
-- ══════════════════════════════════════════════════════════════════════
--
-- THE FIX (scenario F, docs/DELIVERY_NOTES_DESIGN.md): a Sales Order
-- quantity may be physically fulfilled either by (1) a posted Delivery
-- Note, or (2) a direct posted/draft invoice with no Delivery Note
-- relationship — and must NEVER be counted twice. Formulas (identical to
-- the design doc's Part 8, restated here as the literal SQL contract):
--
--   deliveredQty          = Σ posted Delivery Note line qty for the SO line
--   directlyInvoicedQty   = Σ non-void (draft+posted) invoice-line qty for
--                            the SO line WHERE the line carries NO
--                            deliveryNoteLineId
--   physicalFulfilledQty  = deliveredQty + directlyInvoicedQty
--   remainingToDeliver    = max(0, orderedQty − physicalFulfilledQty)
--
-- A NEW **direct** (no deliveryNoteLineId) selection is now rejected
-- unless its quantity ≤ remainingToDeliver — closing exactly the scenario-F
-- gap: DN 6 posted, then a request for a 10-unit direct invoice now sees
-- remainingToDeliver = 10 − 6 − 0 = 4 and is correctly REJECTED (was
-- incorrectly ALLOWED before this migration).
--
-- `directlyInvoicedQty` uses draft+posted (not posted-only) — this is
-- DELIBERATELY UNCHANGED from 0049's own original "taken" semantics (draft
-- counts as a reservation, preventing two concurrent direct-invoice DRAFTS
-- from collectively exceeding the ordered quantity — Phase 5B's own
-- concurrency guarantee, RACE 3 below). It is NOT the same concept as the
-- design doc's posted-only `directlyInvoicedQty` used for the READ-side
-- `physicalFulfilledQty`/`remainingToDeliver` TypeScript selectors — this
-- RPC's write-time reservation check is deliberately STRICTER (it also
-- blocks on drafts) than the read-side accounting truth (which only cares
-- about what has actually posted). Both concepts share a name in the
-- design doc for the read side; this migration's `v_taken_direct` variable
-- is the write-guard, kept named distinctly to avoid confusing the two.
--
-- ══════════════════════════════════════════════════════════════════════
-- WHAT DOES **NOT** CHANGE (Phase 5B preserved, verbatim):
--   * `remainingToInvoice` (TypeScript, `salesOrderFulfilment.ts`,
--     UNTOUCHED by this migration — no `.ts` file is edited here) stays
--     exactly `orderedQty − postedFulfilledQty − draftInvoicedQty`, where
--     `postedFulfilledQty` counts EVERY posted invoice line for the SO
--     line REGARDLESS of `deliveryNoteLineId`. `remainingToInvoice` and
--     `remainingToDeliver` answer DIFFERENT questions and are NEVER made
--     equal — worked example (ordered 10, delivered 7, invoiced 4):
--     remainingToDeliver = 10 − 7 − 0(direct) = 3; remainingToInvoice =
--     10 − 4 − 0 = 6. A delivered quantity can sit un-invoiced; this
--     migration does not change that in any way.
--   * The legacy full-conversion guard, per-line validation shape
--     (belongs-to-order / no dupes / >0 / ≤3dp), invoice-number
--     allocation-with-retry, audit logging, `draft`-only creation (no
--     GL/stock effect here), and "never touches sales_orders.status" are
--     ALL unchanged, character-for-character, from 0049.
--   * A selection with NO `deliveryNoteLineId` behaves EXACTLY as before
--     whenever no Delivery Note has ever been posted against the order
--     (deliveredQty ≡ 0 ⇒ the new formula reduces byte-identically to
--     0049's original `ordered − taken`) — proven by contract test.
--
-- DELIVERY-LINKED INVOICE CREATION (new — supports the future 5C-B
-- picker, without allowing double counting): a selection MAY now
-- optionally carry `"deliveryNoteLineId": "<uuid-text>"`. When present:
--   * it identifies one specific line of one specific POSTED Delivery
--     Note against THIS Sales Order, in THIS company;
--   * the physical event already happened when that Delivery Note posted
--     — this selection consumes ONLY invoiceable quantity, never
--     `remainingToDeliver` again;
--   * validated instead against how much of THAT SPECIFIC DELIVERY NOTE
--     LINE remains un-invoiced (its own quantity minus every non-void
--     invoice line already linked to it) — a DN-line-scoped check,
--     independent of the SO-line-level `remainingToDeliver`;
--   * the created invoice line is stamped with `deliveryNoteLineId`, so
--     every FUTURE remaining-to-deliver / directlyInvoicedQty computation
--     (in this RPC, in `post_delivery_note`, and in the TypeScript derived
--     selectors once 5C-B builds them) correctly excludes it from
--     `directlyInvoicedQty` — the double-subtraction guard, proven by
--     contract test (mirrors 0054's own identical guard).
--
-- LEGACY COMPATIBILITY: an existing invoice line with no `deliveryNoteLineId`
-- (every invoice line created before this migration, and every direct
-- selection made after it) is, and remains, treated as direct fulfilment —
-- no historical invoice, journal, or stock movement is read, written, or
-- reinterpreted by this migration. No Delivery Note is ever fabricated for
-- historical data.
--
-- LOCKING / CONCURRENCY: this function locks the SAME `sales_orders` row
-- `for update` as 0049 always did, and as `post_delivery_note` (0054) also
-- does — a single shared mutex per Sales Order. Neither this function nor
-- 0054 locks any `invoices` or `delivery_notes` ROW directly (only reads,
-- via aggregate queries) — safe because the ONE writer to each of those
-- tables (this function writes `invoices`; 0054 writes `delivery_notes`)
-- always acquires the SAME `sales_orders` row lock BEFORE its own write
-- becomes visible to a concurrent reader holding that same lock. No lock
-- cycle is possible between this function and 0054: this function never
-- waits on a `delivery_notes` row lock (0054 never holds one long enough
-- to matter — it locks its OWN delivery note row, never one this function
-- would need), so the two can only ever contend on the single shared
-- `sales_orders` row, a standard single-resource mutex.
--
--   RACE 1 (SO ordered 10; User A: DN 6; User B: direct invoice 6,
--   concurrent): whichever transaction acquires the `sales_orders` row
--   lock first proceeds; the second BLOCKS until the first commits, then
--   re-derives remaining strictly from the NOW-committed state (this
--   function re-reads `delivery_notes`/`invoices` fresh inside its own
--   locked section; 0054 re-reads `delivery_notes`/`invoices` fresh inside
--   its own locked section) — the second sees remaining = 4 and is
--   REJECTED if it still requests 6. No possible outcome exceeds 10.
--   RACE 2 (SO ordered 10, existing DN 4; User A: DN 4; User B: direct
--   invoice 4, concurrent): same mechanism — one succeeds against a
--   remaining of 6, the other re-derives and is rejected or succeeds only
--   for whatever validly remains after the first commits.
--   RACE 3 (two concurrent direct invoices — Phase 5B's own original
--   race): UNCHANGED — `v_taken_direct` still counts draft+posted, exactly
--   0049's original `v_taken` did, under the SAME `sales_orders` row lock.
--   RACE 4 (two concurrent Delivery Notes): entirely 0054's own,
--   unmodified concurrency contract — not touched by this migration.
--
-- COMPANY SAFETY: every table this function reads is explicitly filtered
-- by `company_id = v_company` (never trusts a client-supplied company_id,
-- resolved once via `get_my_company_id()`) — `sales_orders` (locked row),
-- `invoices` (both the direct-taken aggregate and the DN-line-taken
-- aggregate), `delivery_notes` (both the deliveredQty aggregate and the
-- DN-line lookup). SO lines and DN lines are read from already
-- company-scoped parent rows' own `line_items` jsonb, never from a
-- separate cross-company-reachable source. No cross-company relationship
-- can satisfy any quantity calculation in this function.

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
  v_dn_line         jsonb;
  v_dn_line_qty     numeric;
  v_dn_line_taken   numeric;
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
  --    concurrent post_delivery_note (0054) calls for this SO (same row,
  --    same lock — see the locking note above).
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
      -- ── DELIVERY-LINKED SELECTION (new, 5C) ──────────────────────────
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

      v_remaining := round(v_dn_line_qty - v_dn_line_taken, 3);
      if v_qty - v_remaining > 0.0000005 then
        raise exception 'create_invoice_from_sales_order: cannot invoice % against delivery note line % — only % remain to invoice on that delivery',
          round(v_qty, 3), v_dnl_id, greatest(v_remaining, 0);
      end if;
    else
      -- ── DIRECT SELECTION (Phase 5B behaviour, now delivery-aware) ────
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

      v_remaining := round(v_ordered - v_delivered - v_taken_direct, 3);
      if v_qty - v_remaining > 0.0000005 then
        raise exception 'create_invoice_from_sales_order: cannot invoice % of line % — only % remain to invoice directly (% already delivered, % already directly invoiced)',
          round(v_qty,3), v_sol_id, greatest(v_remaining, 0), v_delivered, v_taken_direct;
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
