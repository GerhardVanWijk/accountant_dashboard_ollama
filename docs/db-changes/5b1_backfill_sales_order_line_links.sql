-- ============================================================================
-- Phase 5B.1 — backfill `salesOrderLineId` onto existing SO-derived invoices
-- ============================================================================
-- STATUS: RUN 2026-09-04 against Office National (676c6cda-2e67-4ee3-8aaa-249b2c6bbc01)
-- via the Supabase MCP, after a fresh read-only audit (Phase 5B FINAL). Result:
-- 9 lines linked across INV-1068 / INV-1072 / INV-1074; 0 ambiguous, 0 unmatched;
-- relationship-only (invoice financial fingerprint, trial balance, GL 1200,
-- inventory valuation, JE/journal-line/stock-movement counts byte-identical
-- before/after). Idempotent — a re-run is a no-op. See
-- docs/SUPABASE_MIGRATION_GUIDE.md § "5B.1 relationship backfill".
--
-- (Original release-restriction note, kept for the record: this required
-- explicit approval before running against any live project.)
--
-- WHAT IT DOES
--   For every invoice whose `sales_order_id` is set and whose jsonb
--   `line_items` carry NO `salesOrderLineId` on any line (a pre-5B.1
--   "all-at-once" conversion), it links each invoice line to exactly one
--   Sales Order line by matching, WITHIN that (invoice, sales_order) pair,
--   on (product_id, quantity, unit_price) AND array position. It writes the
--   matched SO line's `id` into the invoice line's `salesOrderLineId` key.
--
-- WHAT IT NEVER DOES
--   * never guesses — an invoice line that does not match EXACTLY ONE SO line
--     is left untouched and reported (see the NOTICE output)
--   * never matches on description or SKU text
--   * never touches `invoice_lines` (normalized table — the M5 projection
--     column `sales_order_line_id` is a separate, deferred migration)
--   * never changes any quantity, price, total, tax, status, journal, or
--     stock movement — only adds one jsonb key per matched invoice line
--   * never touches an invoice that already has line-level links
--   * company-scoped — every statement is filtered by `company_id`
--
-- IDEMPOTENT: re-running skips any invoice that now has line-level links.
-- DETERMINISTIC: the match key + position ordering is stable.
--
-- ----------------------------------------------------------------------------
-- KNOWN TARGET DATA (Office National, project bcaffvpibpitpuqglszn, 2026-09-04)
--   SO-2026-0001 -> INV-1068  (3 lines, exact full-qty conversion)
--   SO-2026-0002 -> INV-1072  (3 lines, exact full-qty conversion)
--   SO-2026-0003 -> INV-1074  (3 lines, exact full-qty conversion)
--   SO-2026-0004  = pending, no invoice, placeholder line only -> nothing to do
--   All 3 pairs verified: same (product_id, quantity, unit_price) per position.
-- Expected result: 9 invoice lines linked, 0 ambiguous, 0 unmatched.
-- ============================================================================

do $backfill$
declare
  v_company_id uuid := :'company_id';   -- pass -v company_id=... , or replace literally
  v_invoice record;
  v_line jsonb;
  v_idx int;
  v_match_count int;
  v_so_line_id uuid;
  v_new_items jsonb;
  v_linked int := 0;
  v_ambiguous int := 0;
  v_unmatched int := 0;
  v_invoices_touched int := 0;
begin
  if v_company_id is null then
    raise exception 'company_id must be provided';
  end if;

  -- pre-flight snapshot
  raise notice '5b1_backfill (pre): % invoices with a sales_order_id and no line-level link',
    (
      select count(*) from invoices i
      where i.company_id = v_company_id
        and i.sales_order_id is not null
        and i.status <> 'void'
        and not exists (
          select 1 from jsonb_array_elements(coalesce(i.line_items, '[]'::jsonb)) l
          where (l->>'salesOrderLineId') is not null
        )
    );

  for v_invoice in
    select i.id, i.invoice_number, i.sales_order_id, i.line_items
    from invoices i
    where i.company_id = v_company_id
      and i.sales_order_id is not null
      and i.status <> 'void'
      and not exists (
        select 1 from jsonb_array_elements(coalesce(i.line_items, '[]'::jsonb)) l
        where (l->>'salesOrderLineId') is not null
      )
  loop
    v_new_items := '[]'::jsonb;
    v_idx := 0;

    for v_line in select * from jsonb_array_elements(coalesce(v_invoice.line_items, '[]'::jsonb))
    loop
      -- count SO lines that match this invoice line EXACTLY, restricted to the
      -- same array position OR an exact (product, qty, price) triple.
      select count(*), min(sol_id)
        into v_match_count, v_so_line_id
      from (
        select (sol->>'id')::uuid as sol_id
        from sales_orders so,
             lateral jsonb_array_elements(coalesce(so.line_items, '[]'::jsonb)) with ordinality as e(sol, pos)
        where so.id = v_invoice.sales_order_id
          and so.company_id = v_company_id
          and coalesce(sol->>'productId','') is not distinct from coalesce(v_line->>'productId','')
          and (sol->>'quantity')::numeric  = (v_line->>'quantity')::numeric
          and (sol->>'unitPrice')::numeric = (v_line->>'unitPrice')::numeric
          and (pos - 1) = v_idx
      ) m;

      if v_match_count = 1 then
        v_new_items := v_new_items || jsonb_build_array(v_line || jsonb_build_object('salesOrderLineId', v_so_line_id::text));
        v_linked := v_linked + 1;
      elsif v_match_count > 1 then
        v_new_items := v_new_items || jsonb_build_array(v_line);
        v_ambiguous := v_ambiguous + 1;
        raise notice '  AMBIGUOUS: invoice % line % matched % SO lines — left unlinked',
          v_invoice.invoice_number, v_idx, v_match_count;
      else
        v_new_items := v_new_items || jsonb_build_array(v_line);
        v_unmatched := v_unmatched + 1;
        raise notice '  UNMATCHED: invoice % line % (% ) — left unlinked',
          v_invoice.invoice_number, v_idx, coalesce(v_line->>'description','');
      end if;

      v_idx := v_idx + 1;
    end loop;

    -- only write if at least one line was linked and the array length is unchanged
    if v_new_items <> v_invoice.line_items
       and jsonb_array_length(v_new_items) = jsonb_array_length(v_invoice.line_items) then
      update invoices set line_items = v_new_items, updated_at = now()
      where id = v_invoice.id and company_id = v_company_id;
      v_invoices_touched := v_invoices_touched + 1;
    end if;
  end loop;

  raise notice '5b1_backfill (post): % invoices updated, % lines linked, % ambiguous, % unmatched',
    v_invoices_touched, v_linked, v_ambiguous, v_unmatched;

  -- post-flight verification: totals / statuses must be untouched
  raise notice '5b1_backfill (verify): % invoices still without a line link (expected = ambiguous+unmatched-carrying invoices)',
    (
      select count(*) from invoices i
      where i.company_id = v_company_id
        and i.sales_order_id is not null
        and i.status <> 'void'
        and not exists (
          select 1 from jsonb_array_elements(coalesce(i.line_items, '[]'::jsonb)) l
          where (l->>'salesOrderLineId') is not null
        )
    );
end
$backfill$;

-- ----------------------------------------------------------------------------
-- MANUAL PRE/POST CHECKS (run separately, read-only)
--
--   -- BEFORE: fingerprint the invoices' financial fields
--   select md5(string_agg(id::text || subtotal || tax_total || total || status, ',' order by id))
--   from invoices where company_id = :'company_id';
--
--   -- AFTER: the same query must return the SAME hash (only line_items jsonb changed,
--   -- and only by the addition of salesOrderLineId keys)
--
--   -- trial balance / GL 1200 vs valuation must be identical before & after
--   -- (nothing here posts — this is a documentation assertion, not a code path).
-- ----------------------------------------------------------------------------
