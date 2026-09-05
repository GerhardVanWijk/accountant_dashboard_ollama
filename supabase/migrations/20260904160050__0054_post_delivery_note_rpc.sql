-- 0054_post_delivery_note_rpc
-- Phase 5C-A (docs/DELIVERY_NOTES_DESIGN.md Parts 5, 7, 8, 9, 21, 24, 28).
-- AUTHORED, NOT APPLIED (hardened CP-5C-A gate). Renumbered from 0053
-- during the CP-5C-A hardening pass; function BODY unchanged from the
-- original authoring except for this header (the composite-FK upgrade in
-- 0052 needed no change here — this function never referenced
-- `sales_order_id`/`customer_id` via literal FK syntax, only via `select`
-- against `public.sales_orders`/`public.delivery_notes`, which is
-- unaffected by how those tables' FKs are declared).
--
-- Makes "post an existing DRAFT Delivery Note" a SINGLE atomic,
-- concurrency-safe operation, mirroring `create_invoice_from_sales_order`
-- (0049) for the locking/re-derivation pattern, and reusing the EXISTING,
-- UNCHANGED `post_inventory_transaction` (0031) for the actual stock/GL
-- write — the design doc's own Part 1/28 finding is that the posting
-- engine needs ZERO logic change for Delivery Notes, so this migration
-- makes none: it calls the engine exactly the way `invoiceService.postInvoice()`
-- and `purchaseOrderService.recordReceipt()` already do, just from SQL
-- instead of from a second round-trip through TypeScript.
--
-- ══════════════════════════════════════════════════════════════════════
-- CP-5C-A HARDENING — CRITICAL FINDING, NOT FIXED HERE, FLAGGED FOR
-- EXPLICIT DECISION (docs/KNOWN_ISSUES.md, docs/DELIVERY_NOTES_DESIGN.md
-- § "CP-5C-A HARDENING" scenario F):
--
-- This function correctly re-derives `remainingToDeliver` against BOTH
-- other posted Delivery Notes AND directly-invoiced quantity (the query
-- below, unchanged). But `create_invoice_from_sales_order` (0049, ALREADY
-- LIVE, a Phase 5B artifact, NOT modified by this migration) re-derives
-- its own "taken" quantity ONLY against other invoices — it has NO
-- knowledge that `delivery_notes` exists at all, because it predates
-- Phase 5C entirely. Consequence, proven step-by-step in the design doc:
-- deliver 6 of a 10-unit SO line via a posted Delivery Note, then call
-- `create_invoice_from_sales_order` for the FULL 10 units on a DIRECT
-- (no-Delivery-Note) line — 0049's own remaining check sees 0 units
-- "taken" (it never looks at `delivery_notes`) and ALLOWS creating +
-- posting a 10-unit direct invoice, for a combined
-- `deliveredQty(6) + directlyInvoicedQty(10) = 16` against `ordered(10)` —
-- a genuine, NON-concurrent, purely SEQUENTIAL over-issue that this
-- migration set cannot close on its own, because the fix belongs inside
-- 0049's own function body (a live, already-applied Phase 5B RPC), and
-- CP-5C-0 explicitly forbids reopening Phase 5B without separate,
-- explicit authorization. THIS FUNCTION (`post_delivery_note`) remains
-- internally sound on its own — the gap runs the OTHER direction (an
-- invoice over-committing against already-delivered stock), not this
-- one. Recommended fix (NOT authored here, pending approval): a narrow,
-- additive `create or replace function public.create_invoice_from_sales_order`
-- migration that also subtracts posted `delivery_notes` line quantity
-- from its own "taken" computation — fully backward compatible (when no
-- `delivery_notes` rows exist, the subtraction is 0, byte-identical to
-- today). DO NOT apply 0050-0054 to a project where Delivery Notes will
-- go into real use until this companion fix ships alongside 5C-B.
-- ══════════════════════════════════════════════════════════════════════
--
-- SCOPE OF THIS RPC — what it does NOT do:
--   * Draft creation/editing is a PLAIN INSERT/UPDATE through the app
--     repository layer (5C-B, not built yet) — no RPC needed there. A
--     draft Delivery Note has ZERO accounting effect and, per the design
--     doc's own Part 8 formula, does NOT reduce `remainingToDeliver` (only
--     a POSTED one does) — so, unlike Phase 5B's draft invoices (which DO
--     count as "taken" and therefore need the atomic guard AT CREATION),
--     two concurrent Delivery Note DRAFTS are harmless: nothing commits
--     until one of them actually POSTS. This is exactly why the atomic
--     guard belongs HERE, at posting, not at draft creation — the reverse
--     of where 0049 put it, for a reason specific to this document.
--   * Cancelling a draft is a plain UPDATE (`status = 'cancelled'`, only
--     from `draft` — Part 3). No RPC needed; nothing has posted.
--
-- WHY THIS RPC CALLS post_inventory_transaction DIRECTLY (SQL calling SQL,
-- new to this codebase but safe): `post_inventory_transaction` is itself
-- `SECURITY INVOKER` (0031's own comment: "runs as the calling user, so
-- every table's RLS applies") with no `SECURITY DEFINER` anywhere in its
-- definition. Calling it from within this ALSO-`SECURITY INVOKER` function,
-- in the SAME session/transaction, executes it with the exact same caller
-- identity and RLS as a direct RPC call from TypeScript would — there is no
-- privilege change, no new grant needed on that function beyond what
-- `authenticated` already holds, and it gets TRUE atomicity (the
-- sales_orders row lock is held across the entire remaining-check AND the
-- engine write, in one transaction) that the two-network-call TypeScript
-- pattern (create draft via RPC, post later via a second RPC call) cannot
-- offer. This is the FIRST such SQL-calls-SQL composition in this codebase.
--
-- RPC COMPOSITION PROPERTIES — VERIFIED (CP-5C-A hardening, item 4):
--   * Transaction atomicity: `post_delivery_note` has no explicit
--     BEGIN/COMMIT (none is used or needed — a `supabase.rpc(...)` call, or
--     any direct SQL call to a plpgsql function, executes inside ONE
--     implicit transaction for the whole function body, matching 0031's
--     and 0049's own style exactly). The call into
--     `post_inventory_transaction` happens INSIDE that same implicit
--     transaction — there is no nested transaction, no savepoint, no
--     separate commit boundary. Any exception raised anywhere in either
--     function unwinds the ENTIRE combined operation.
--   * SECURITY INVOKER behaviour: both functions run as the calling
--     (authenticated) user throughout — RLS is evaluated exactly as if the
--     caller had made two separate top-level RPC calls in one transaction.
--     No SECURITY DEFINER is introduced anywhere in this migration set.
--   * search_path behaviour: both functions independently pin
--     `set search_path to 'public'` — `post_delivery_note`'s own pin is not
--     "inherited" from the callee or vice versa; each function's pin
--     applies to its own execution, which is the correct, safe pattern
--     (matches every other multi-statement function in this codebase).
--   * RLS behaviour: every table either function touches
--     (`delivery_notes`, `sales_orders`, `invoices`, `accounts`,
--     `products`, `stock_balances`, `stock_movements`, `journal_entries`,
--     `journal_lines`, `audit_log_entries`, `inventory_transaction_log`)
--     enforces its own RLS policy against the SAME calling user for both
--     the outer and the inner function — no table is read or written with
--     elevated privilege at any point in this call chain.
--   * Lock ordering: `delivery_notes` row FIRST, then `sales_orders` row —
--     fixed, deterministic order. `post_inventory_transaction` (called
--     third, after both locks are already held) additionally locks every
--     referenced `products` row in `order by id` (0031's own deadlock-safe
--     convention, unchanged) — a strictly more specific lock acquired
--     LAST in the chain, so no lock-ordering cycle is possible between
--     `post_delivery_note` and any other caller of
--     `post_inventory_transaction` (they all reach the products lock via
--     the same `order by id` rule, regardless of which document type
--     called them).
--   * Error propagation: a `raise exception` inside
--     `post_inventory_transaction` propagates as an ordinary PL/pgSQL
--     exception up through the `select public.post_inventory_transaction(...)
--     into v_result` call in `post_delivery_note` — uncaught (no
--     `exception when others` block anywhere in `post_delivery_note`), so
--     it aborts the whole outer transaction exactly as a direct top-level
--     failure would. The caller (TypeScript, via `supabase.rpc(...)`) sees
--     one PostgREST error either way; it cannot distinguish "the outer
--     validation failed" from "the inner engine failed" without parsing
--     the error message text — acceptable, matches how every other
--     multi-step RPC in this codebase already surfaces failures.
--   * Posting-key / idempotency: `post_delivery_note` derives ONE
--     deterministic key, `'delivery_note:' || v_dn.id || ':post'`, and
--     passes it straight through to `post_inventory_transaction`, which
--     owns the actual idempotency mechanism (the `inventory_transaction_log`
--     UNIQUE (company_id, posting_key) — unchanged, 0031). A SECOND
--     invocation of `post_delivery_note` for the SAME already-posted DN
--     never reaches that idempotency check at all — it is rejected earlier,
--     at THIS function's own `status <> 'draft'` guard (step 1) — a
--     belt-and-suspenders double guard, not a single point of failure.
--   * Journal ownership: `post_delivery_note` builds no `journal_entries`/
--     `journal_lines` rows itself — it supplies `p_lines` (the inventory
--     leg) and `p_extra_journal := '[]'::jsonb` (explicitly no additional
--     leg) to `post_inventory_transaction`, which is the SOLE writer of
--     both tables, unchanged. `post_delivery_note` only ever READS the
--     resulting `journal_entry_id` back out of that call's return value to
--     stamp `delivery_notes.journal_entry_id`.
--   * `stock_movements` evidence fields: `source_document_type` is fixed
--     to `'delivery_note'`, `source_document_id` to the Delivery Note's own
--     `id` (never the Sales Order's), and `source_document_line_id` to the
--     INDIVIDUAL Delivery Note line's `id` (never the Sales Order line's
--     id) — the same "the document being posted owns the evidence, not its
--     parent" convention `postInvoice()` already follows for
--     `sourceDocumentLineId`.
--   * No nested-transaction assumption: confirmed above — neither function
--     opens its own transaction block; both rely entirely on the ONE
--     implicit transaction PostgREST/plpgsql already provides for a single
--     RPC call, composed by ordinary function call, not `dblink`/
--     `pg_background`/any cross-transaction mechanism.
--   * No possibility of a partially-posted Delivery Note: the ONLY write to
--     `delivery_notes` in this entire function is the single `update ...
--     set status = 'posted', journal_entry_id = ..., updated_at = now()`
--     at the very end, AFTER `post_inventory_transaction` has already
--     returned successfully. If that engine call raises, the transaction
--     aborts before this update ever runs, so `delivery_notes.status` is
--     NEVER observed as `'posted'` without a fully-written, balanced
--     journal entry and its stock movements already committed alongside
--     it in the SAME transaction — "posted" and "has real GL/stock
--     evidence" are structurally inseparable, by construction.
--
-- SAFETY PHILOSOPHY (mirrors 0049 / 0031 / 0046):
--   * SECURITY INVOKER — every table's RLS applies as the calling user.
--   * v_company := get_my_company_id() — the client NEVER supplies
--     company_id.
--   * LOCK the delivery_notes row FOR UPDATE first — the double-post /
--     concurrent-post-of-the-SAME-DN guard (status must be 'draft'; a
--     second concurrent call for the same DN blocks on this lock, then
--     sees 'posted' and is rejected — no duplicate stock/GL write is
--     possible).
--   * LOCK the sales_orders row FOR UPDATE next — serialises against every
--     OTHER concurrent post_delivery_note call touching lines of the SAME
--     order (does NOT serialise against `create_invoice_from_sales_order`'s
--     own DRAFT-creation step for a DIRECT invoice — see the CRITICAL
--     FINDING banner above; it DOES correctly account for already-POSTED
--     direct invoices via the `directlyInvoicedQty` term below).
--   * Every DN LINE's product_id / quantity / salesOrderLineId is read from
--     the delivery note's OWN stored, already-validated `line_items` — the
--     caller supplies ONLY the per-line `inventoryAccountId` (real
--     category-mapped account-resolution knowledge that belongs in
--     TypeScript, not reimplemented here) plus one shared
--     `contraAccountId` for the whole document (the clearing account is a
--     single company-level account, never category-mapped). Re-validated
--     defensively anyway (qty > 0, ≤ 3dp, no duplicate/missing line ids,
--     every account id must actually belong to this company) — "never
--     trust client data", the same standard every RPC in this codebase
--     since 0046/0049 holds to.
--   * `remainingToDeliver` is RE-COMPUTED inside the transaction as
--     `orderedQty − deliveredElsewhere − directlyInvoicedQty` (design doc
--     Part 8's commitment formula, generalized): `deliveredElsewhere` sums
--     every OTHER already-POSTED delivery note's line quantity for the same
--     Sales Order line; `directlyInvoicedQty` sums every POSTED invoice
--     line for that SO line carrying NO `deliveryNoteLineId` (the
--     invoice-before-delivery bypass path, unrestricted per Part 13 — this
--     RPC does not touch or constrain that path in any way). This is the
--     specific query PROVEN, scenario by scenario, in
--     docs/DELIVERY_NOTES_DESIGN.md § "CP-5C-A HARDENING" to never
--     double-subtract a delivered-then-invoiced quantity: a line that
--     carries `deliveryNoteLineId` is counted ONCE, inside `deliveredQty`
--     (via the OTHER-delivery-notes sum), and explicitly EXCLUDED from
--     `directlyInvoicedQty` by the `not (l.value ? 'deliveryNoteLineId')`
--     filter below — regardless of how many separate invoices eventually
--     bill that one delivered quantity.
--   * `movement_type: 'delivery'` and `costing_mode: 'issue'` — issues
--     stock at the product's CURRENT WAC, frozen onto the resulting
--     `stock_movements` row exactly like every other 'issue' movement
--     (Part 7's WAC-immutability guarantee comes from `stock_movements`
--     itself, unchanged, not from anything new here).
--   * A `sales_orders.status` of `cancelled` or `closed` blocks posting — a
--     closed order has abandoned its un-invoiced remainder (0048); nothing
--     should physically leave the warehouse against it after that.
--
-- NO VAT / revenue / AR posting — the delivery entry is a pure
-- reclassification (`DR contra_account / CR inventory_account`), built
-- entirely by the EXISTING `post_inventory_transaction`'s own inventory-leg
-- logic (this migration supplies no `extra_journal`). Clearing this amount
-- into COGS at invoice time is 5C-B `invoiceService.postInvoice()` work,
-- not touched here.

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
  --    calls against the SAME order (see the CRITICAL FINDING banner above
  --    re: create_invoice_from_sales_order's own, separate, unmodified
  --    concurrency contract).
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

    v_remaining := round(v_ordered - v_delivered_elsewhere - v_direct_invoiced, 3);
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
  --    returned successfully (see "No possibility of a partially-posted
  --    Delivery Note" above). Sales Order status is NOT touched (mirrors
  --    0049 — commercial status transitions happen at a separate, later
  --    layer, not here).
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
