-- 0042_normalized_line_backfill
-- Phase 9B (docs/ACCOUNTING_RELATIONSHIPS.md §9/§13/§17). AUTHORED, NOT YET
-- APPLIED (Review 9B-A gate).
--
-- EXACT backfill only, per the brief's strict evidence rule: every existing
-- `line_items` jsonb element already carries a stable, required `id`
-- (`DocumentLineItem.id` is non-optional — src/types/common.ts) — this is
-- copied as-is into the new tables' primary key, never regenerated. This
-- was VERIFIED, not assumed, via a read-only query against the live
-- project during the Phase 9B design pass:
--   invoice/bill/PO/credit-note lines missing an `id`:         0
--   lines sharing an `id` with another line in the SAME document: 0
--   an `id` colliding across different documents/tables:       0
--   `productId`/`warehouseId`/`taxRateId` values that do NOT resolve
--     to an existing same-company row:                          0
-- So this migration hit no STOP condition on the live data. It still
-- defends against a dirtier dataset in a different environment: an
-- unresolvable `productId`/`warehouseId`/`taxRateId` is backfilled as NULL
-- (never guessed at, never a reason to fail the whole migration) and
-- counted into a NOTICE so an operator sees it. `unit_cost`/historical
-- `stock_movements.source_document_line_id` are NOT touched by this
-- migration — see docs/ACCOUNTING_RELATIONSHIPS.md §9's IMPOSSIBLE
-- classification for pre-migration-0022 movements; nothing here changes
-- that.
--
-- `line_number` is the element's 1-based position in the jsonb array
-- (`with ordinality`), matching the order the document already displays
-- lines in — the array itself is the only ordering evidence that exists.
--
-- Idempotent: `on conflict (id) do nothing` — safe to re-run (e.g. after a
-- new document was created between an earlier partial run and this one; a
-- genuinely partial run should not happen since each INSERT is one
-- statement over a stable snapshot, but the guard costs nothing).

do $$
declare
  v_orphaned_products  integer;
  v_orphaned_warehouses integer;
  v_orphaned_tax_rates  integer;
begin
  insert into public.invoice_lines
    (id, company_id, invoice_id, line_number, product_id, warehouse_id, description, quantity, unit_price, tax_rate_id, tax_amount, line_total)
  select
    (l->>'id')::uuid,
    i.company_id,
    i.id,
    ord,
    case when l->>'productId' is not null and exists (select 1 from public.products p where p.id = (l->>'productId')::uuid and p.company_id = i.company_id)
      then (l->>'productId')::uuid end,
    case when l->>'warehouseId' is not null and exists (select 1 from public.warehouses w where w.id = (l->>'warehouseId')::uuid and w.company_id = i.company_id)
      then (l->>'warehouseId')::uuid end,
    coalesce(l->>'description', ''),
    coalesce((l->>'quantity')::numeric, 0),
    coalesce((l->>'unitPrice')::numeric, 0),
    case when l->>'taxRateId' is not null and exists (select 1 from public.tax_rates t where t.id = (l->>'taxRateId')::uuid and t.company_id = i.company_id)
      then (l->>'taxRateId')::uuid end,
    coalesce((l->>'taxAmount')::numeric, 0),
    coalesce((l->>'lineTotal')::numeric, 0)
  from public.invoices i, jsonb_array_elements(i.line_items) with ordinality as t(l, ord)
  where coalesce(l->>'quantity','0')::numeric > 0  -- table has `check (quantity > 0)`; a zero/negative legacy line is skipped, not coerced
  on conflict (id) do nothing;

  insert into public.bill_lines
    (id, company_id, bill_id, line_number, product_id, warehouse_id, description, quantity, unit_price, tax_rate_id, tax_amount, line_total, fixed_asset_details)
  select
    (l->>'id')::uuid,
    b.company_id,
    b.id,
    ord,
    case when l->>'productId' is not null and exists (select 1 from public.products p where p.id = (l->>'productId')::uuid and p.company_id = b.company_id)
      then (l->>'productId')::uuid end,
    case when l->>'warehouseId' is not null and exists (select 1 from public.warehouses w where w.id = (l->>'warehouseId')::uuid and w.company_id = b.company_id)
      then (l->>'warehouseId')::uuid end,
    coalesce(l->>'description', ''),
    coalesce((l->>'quantity')::numeric, 0),
    coalesce((l->>'unitPrice')::numeric, 0),
    case when l->>'taxRateId' is not null and exists (select 1 from public.tax_rates t where t.id = (l->>'taxRateId')::uuid and t.company_id = b.company_id)
      then (l->>'taxRateId')::uuid end,
    coalesce((l->>'taxAmount')::numeric, 0),
    coalesce((l->>'lineTotal')::numeric, 0),
    l->'fixedAssetDetails'
  from public.bills b, jsonb_array_elements(b.line_items) with ordinality as t(l, ord)
  where coalesce(l->>'quantity','0')::numeric > 0
  on conflict (id) do nothing;

  insert into public.purchase_order_lines
    (id, company_id, purchase_order_id, line_number, product_id, warehouse_id, description, quantity, unit_price, tax_rate_id, tax_amount, line_total)
  select
    (l->>'id')::uuid,
    po.company_id,
    po.id,
    ord,
    case when l->>'productId' is not null and exists (select 1 from public.products p where p.id = (l->>'productId')::uuid and p.company_id = po.company_id)
      then (l->>'productId')::uuid end,
    case when l->>'warehouseId' is not null and exists (select 1 from public.warehouses w where w.id = (l->>'warehouseId')::uuid and w.company_id = po.company_id)
      then (l->>'warehouseId')::uuid end,
    coalesce(l->>'description', ''),
    coalesce((l->>'quantity')::numeric, 0),
    coalesce((l->>'unitPrice')::numeric, 0),
    case when l->>'taxRateId' is not null and exists (select 1 from public.tax_rates t where t.id = (l->>'taxRateId')::uuid and t.company_id = po.company_id)
      then (l->>'taxRateId')::uuid end,
    coalesce((l->>'taxAmount')::numeric, 0),
    coalesce((l->>'lineTotal')::numeric, 0)
  from public.purchase_orders po, jsonb_array_elements(po.line_items) with ordinality as t(l, ord)
  where coalesce(l->>'quantity','0')::numeric > 0
  on conflict (id) do nothing;

  -- original_invoice_line_id: only settable where invoice_lines already has
  -- a matching row (it was just populated above in the SAME transaction) —
  -- never inferred from anything else. A credit note line with no
  -- `originalInvoiceLineId` in its jsonb, or one whose value doesn't match
  -- an existing invoice_lines.id, backfills NULL — exactly the AMBIGUOUS
  -- case the brief says must stay NULL, not guessed at.
  insert into public.credit_note_lines
    (id, company_id, credit_note_id, line_number, product_id, warehouse_id, description, quantity, unit_price, tax_rate_id, tax_amount, line_total, original_invoice_line_id)
  select
    (l->>'id')::uuid,
    cn.company_id,
    cn.id,
    ord,
    case when l->>'productId' is not null and exists (select 1 from public.products p where p.id = (l->>'productId')::uuid and p.company_id = cn.company_id)
      then (l->>'productId')::uuid end,
    case when l->>'warehouseId' is not null and exists (select 1 from public.warehouses w where w.id = (l->>'warehouseId')::uuid and w.company_id = cn.company_id)
      then (l->>'warehouseId')::uuid end,
    coalesce(l->>'description', ''),
    coalesce((l->>'quantity')::numeric, 0),
    coalesce((l->>'unitPrice')::numeric, 0),
    case when l->>'taxRateId' is not null and exists (select 1 from public.tax_rates t where t.id = (l->>'taxRateId')::uuid and t.company_id = cn.company_id)
      then (l->>'taxRateId')::uuid end,
    coalesce((l->>'taxAmount')::numeric, 0),
    coalesce((l->>'lineTotal')::numeric, 0),
    case when l->>'originalInvoiceLineId' is not null
           and exists (select 1 from public.invoice_lines il where il.id = (l->>'originalInvoiceLineId')::uuid and il.company_id = cn.company_id)
      then (l->>'originalInvoiceLineId')::uuid end
  from public.credit_notes cn, jsonb_array_elements(cn.line_items) with ordinality as t(l, ord)
  where coalesce(l->>'quantity','0')::numeric > 0
  on conflict (id) do nothing;

  select count(*) into v_orphaned_products from (
    select l->>'productId' pid, i.company_id from public.invoices i, jsonb_array_elements(i.line_items) l where l->>'productId' is not null
    union all select l->>'productId', b.company_id from public.bills b, jsonb_array_elements(b.line_items) l where l->>'productId' is not null
    union all select l->>'productId', po.company_id from public.purchase_orders po, jsonb_array_elements(po.line_items) l where l->>'productId' is not null
    union all select l->>'productId', cn.company_id from public.credit_notes cn, jsonb_array_elements(cn.line_items) l where l->>'productId' is not null
  ) x where not exists (select 1 from public.products p where p.id = x.pid::uuid and p.company_id = x.company_id);

  if v_orphaned_products > 0 then
    raise notice 'normalized_line_backfill: % line(s) had a productId that does not resolve to a same-company product — backfilled as NULL, not guessed at.', v_orphaned_products;
  end if;
end $$;
