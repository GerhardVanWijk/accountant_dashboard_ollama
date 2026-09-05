-- 0063_normalized_line_warehouse_parity_correction
-- FINAL CORE HARDENING (2026-09-05): pre-flip parity correction for the
-- controlled activation of NORMALIZED_DOCUMENT_LINES_ENABLED
-- (docs/CURRENT_TASKS.md § P3, docs/PHASE_9B_DESIGN.md § "Rollout").
--
-- ══════════════════════════════════════════════════════════════════════
-- THE DIVERGENCE
--   A pre-flip DocumentLineParityChecker sweep (run as read-only SQL that
--   replicates the checker's field-by-field comparison) found the normalized
--   line tables are a faithful copy of the authoritative jsonb `line_items`
--   in every respect EXCEPT one: 58 rows carry a non-NULL `warehouse_id`
--   where the authoritative jsonb line has no `warehouseId` key at all —
--       invoice_lines        40  (16 invoices)
--       bill_lines           10
--       purchase_order_lines  7
--       credit_note_lines     1
--   Every other compared field (description, quantity, unit_price,
--   tax_amount, line_total, product_id, tax_rate_id, line_number,
--   original_invoice_line_id, fixed_asset_details) matches exactly, and
--   there are ZERO orphans, duplicates, line-count mismatches or
--   cross-company rows.
--
-- ROOT CAUSE
--   These 58 rows were written by the 2026-09-02 "September 2026" data seed,
--   which inserted the normalized line rows DIRECTLY (with a resolved
--   warehouse) rather than through `SupabaseDocumentLineProjector`, and
--   inconsistently with the jsonb `line_items` it wrote for the same
--   documents (which omit the per-line warehouse). Migration 0042's backfill
--   would have written NULL for these lines (`case when l->>'warehouseId'
--   is not null and exists(...) then ... end`), and so does the live
--   projector: `SupabaseDocumentLineProjector.sync()` writes
--   `warehouse_id: line.warehouseId ?? null`, reading ONLY the jsonb line —
--   it never consults `stock_movements` or a default warehouse.
--
--   (Observed but deliberately NOT acted on here: all 40 divergent invoice
--   lines DO have a posted, immutable `stock_movements` row linked by
--   `source_document_line_id`, and every one posted against the same
--   warehouse now sitting in the normalized row — "Main Distribution Centre
--   - Montague Gardens". So the value is not wrong in fact; it is simply not
--   present in the AUTHORITATIVE representation. Enriching the jsonb
--   `line_items` from those movements is a separate, explicit data-quality
--   decision — it mutates the authoritative source and is out of scope for a
--   controlled, non-destructive source-of-truth activation. Tracked in
--   docs/KNOWN_ISSUES.md.)
--
-- THE CORRECTION (exact, non-fuzzy, reversible, jsonb untouched)
--   Bring the NON-authoritative projection into exact agreement with what a
--   fresh re-projection of the authoritative jsonb produces: set
--   `warehouse_id = NULL` on precisely the rows whose parent document's
--   jsonb line (matched by line id) has no `warehouseId`. Nothing reads the
--   normalized tables yet (NORMALIZED_DOCUMENT_LINES_ENABLED is still false
--   at apply time; the flag only gates the WRITE side), so this has zero
--   functional impact today; it makes the pre-flip parity sweep clean.
--
--   Rollback: the 58 (document line id -> warehouse id) pairs are listed in
--   the NOTICE this migration raises and in
--   docs/PHASE_9B_DESIGN.md § "0063 rollback". Re-applying that mapping is a
--   trivial UPDATE if the enrichment decision is later taken.

do $$
declare
  v_inv integer;
  v_bill integer;
  v_po integer;
  v_cn integer;
  v_pairs text;
begin
  -- Capture the exact (line id -> warehouse id) mapping being cleared, for rollback evidence.
  select string_agg(format('%s=%s', lid, wid), ', ')
    into v_pairs
  from (
    select il.id::text lid, il.warehouse_id::text wid
      from public.invoice_lines il
      join public.invoices i on i.id = il.invoice_id
     where il.warehouse_id is not null
       and not exists (
         select 1 from jsonb_array_elements(coalesce(i.line_items, '[]'::jsonb)) l
          where (l->>'id')::uuid = il.id and (l->>'warehouseId') is not null
       )
    union all
    select bl.id::text, bl.warehouse_id::text
      from public.bill_lines bl
      join public.bills b on b.id = bl.bill_id
     where bl.warehouse_id is not null
       and not exists (
         select 1 from jsonb_array_elements(coalesce(b.line_items, '[]'::jsonb)) l
          where (l->>'id')::uuid = bl.id and (l->>'warehouseId') is not null
       )
    union all
    select pl.id::text, pl.warehouse_id::text
      from public.purchase_order_lines pl
      join public.purchase_orders p on p.id = pl.purchase_order_id
     where pl.warehouse_id is not null
       and not exists (
         select 1 from jsonb_array_elements(coalesce(p.line_items, '[]'::jsonb)) l
          where (l->>'id')::uuid = pl.id and (l->>'warehouseId') is not null
       )
    union all
    select cl.id::text, cl.warehouse_id::text
      from public.credit_note_lines cl
      join public.credit_notes c on c.id = cl.credit_note_id
     where cl.warehouse_id is not null
       and not exists (
         select 1 from jsonb_array_elements(coalesce(c.line_items, '[]'::jsonb)) l
          where (l->>'id')::uuid = cl.id and (l->>'warehouseId') is not null
       )
  ) s;

  update public.invoice_lines il
     set warehouse_id = null
    from public.invoices i
   where i.id = il.invoice_id
     and il.warehouse_id is not null
     and not exists (
       select 1 from jsonb_array_elements(coalesce(i.line_items, '[]'::jsonb)) l
        where (l->>'id')::uuid = il.id and (l->>'warehouseId') is not null
     );
  get diagnostics v_inv = row_count;

  update public.bill_lines bl
     set warehouse_id = null
    from public.bills b
   where b.id = bl.bill_id
     and bl.warehouse_id is not null
     and not exists (
       select 1 from jsonb_array_elements(coalesce(b.line_items, '[]'::jsonb)) l
        where (l->>'id')::uuid = bl.id and (l->>'warehouseId') is not null
     );
  get diagnostics v_bill = row_count;

  update public.purchase_order_lines pl
     set warehouse_id = null
    from public.purchase_orders p
   where p.id = pl.purchase_order_id
     and pl.warehouse_id is not null
     and not exists (
       select 1 from jsonb_array_elements(coalesce(p.line_items, '[]'::jsonb)) l
        where (l->>'id')::uuid = pl.id and (l->>'warehouseId') is not null
     );
  get diagnostics v_po = row_count;

  update public.credit_note_lines cl
     set warehouse_id = null
    from public.credit_notes c
   where c.id = cl.credit_note_id
     and cl.warehouse_id is not null
     and not exists (
       select 1 from jsonb_array_elements(coalesce(c.line_items, '[]'::jsonb)) l
        where (l->>'id')::uuid = cl.id and (l->>'warehouseId') is not null
     );
  get diagnostics v_cn = row_count;

  raise notice '0063 parity correction: nulled warehouse_id on invoice_lines=%, bill_lines=%, purchase_order_lines=%, credit_note_lines=% (expected 40/10/7/1).', v_inv, v_bill, v_po, v_cn;
  raise notice '0063 rollback mapping (line_id=warehouse_id): %', coalesce(v_pairs, '(none)');

  if v_inv <> 40 or v_bill <> 10 or v_po <> 7 or v_cn <> 1 then
    raise exception '0063: unexpected row counts (got %/%/%/%, expected 40/10/7/1) — aborting so a human can re-inspect.', v_inv, v_bill, v_po, v_cn;
  end if;
end $$;
