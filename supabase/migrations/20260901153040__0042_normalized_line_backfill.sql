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
-- unresolvable `productId`/`warehouseId`/`taxRateId`/`originalInvoiceLineId`
-- is backfilled as NULL (never guessed at, never a reason to fail the whole
-- migration) and counted into a NOTICE so an operator sees exactly how many
-- of each did not resolve — both BEFORE the backfill (products / warehouses
-- / tax rates, straight from the jsonb) and AFTER it (original invoice
-- lines, which can only be judged once `invoice_lines` is populated in this
-- same transaction). `unit_cost` / historical
-- `stock_movements.source_document_line_id` are NOT touched by this
-- migration — see docs/ACCOUNTING_RELATIONSHIPS.md §9's IMPOSSIBLE
-- classification for pre-migration-0022 movements; nothing here changes
-- that, and nothing here fabricates a historical WAC or cost.
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
  v_orphaned_products               integer;
  v_orphaned_warehouses             integer;
  v_orphaned_tax_rates              integer;
  v_orphaned_original_invoice_lines integer;
begin
  -- ──────────────────────────────────────────────────────────────────────
  -- PRE-BACKFILL observability: every jsonb line reference that will NOT
  -- resolve to a same-company row, and will therefore be written as NULL
  -- (exact-only policy — docs/PHASE_9B_DESIGN.md §2; never guessed at).
  -- Counted over exactly the lines the INSERTs below will consider
  -- (quantity > 0 — a zero/negative legacy line is skipped, not coerced).
  -- ──────────────────────────────────────────────────────────────────────
  with all_lines as (
    select i.company_id,
           l->>'productId'   as product_id,
           l->>'warehouseId' as warehouse_id,
           l->>'taxRateId'   as tax_rate_id
      from public.invoices i,
           jsonb_array_elements(coalesce(i.line_items, '[]'::jsonb)) l
     where coalesce((l->>'quantity')::numeric, 0) > 0
    union all
    select b.company_id, l->>'productId', l->>'warehouseId', l->>'taxRateId'
      from public.bills b,
           jsonb_array_elements(coalesce(b.line_items, '[]'::jsonb)) l
     where coalesce((l->>'quantity')::numeric, 0) > 0
    union all
    select po.company_id, l->>'productId', l->>'warehouseId', l->>'taxRateId'
      from public.purchase_orders po,
           jsonb_array_elements(coalesce(po.line_items, '[]'::jsonb)) l
     where coalesce((l->>'quantity')::numeric, 0) > 0
    union all
    select cn.company_id, l->>'productId', l->>'warehouseId', l->>'taxRateId'
      from public.credit_notes cn,
           jsonb_array_elements(coalesce(cn.line_items, '[]'::jsonb)) l
     where coalesce((l->>'quantity')::numeric, 0) > 0
  )
  select
    count(*) filter (where al.product_id   is not null and p.id is null),
    count(*) filter (where al.warehouse_id is not null and w.id is null),
    count(*) filter (where al.tax_rate_id  is not null and t.id is null)
  into v_orphaned_products, v_orphaned_warehouses, v_orphaned_tax_rates
  from all_lines al
  left join public.products   p on p.id = nullif(al.product_id, '')::uuid   and p.company_id = al.company_id
  left join public.warehouses w on w.id = nullif(al.warehouse_id, '')::uuid and w.company_id = al.company_id
  left join public.tax_rates  t on t.id = nullif(al.tax_rate_id, '')::uuid  and t.company_id = al.company_id;

  raise notice 'normalized_line_backfill (pre): unresolved references across invoice/bill/PO/credit-note jsonb lines — productId=%, warehouseId=%, taxRateId=%. Each is written as NULL, never guessed at.',
    v_orphaned_products, v_orphaned_warehouses, v_orphaned_tax_rates;

  -- ──────────────────────────────────────────────────────────────────────
  -- BACKFILL
  -- ──────────────────────────────────────────────────────────────────────
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
  from public.invoices i, jsonb_array_elements(coalesce(i.line_items, '[]'::jsonb)) with ordinality as t(l, ord)
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
  from public.bills b, jsonb_array_elements(coalesce(b.line_items, '[]'::jsonb)) with ordinality as t(l, ord)
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
  from public.purchase_orders po, jsonb_array_elements(coalesce(po.line_items, '[]'::jsonb)) with ordinality as t(l, ord)
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
  from public.credit_notes cn, jsonb_array_elements(coalesce(cn.line_items, '[]'::jsonb)) with ordinality as t(l, ord)
  where coalesce(l->>'quantity','0')::numeric > 0
  on conflict (id) do nothing;

  -- ──────────────────────────────────────────────────────────────────────
  -- POST-BACKFILL observability: credit-note lines whose jsonb
  -- `originalInvoiceLineId` did NOT resolve to an invoice_lines row (the
  -- referenced invoice pre-dates migration 0038, so it has no normalized
  -- line to point at — 0041's column comment). Left NULL, not guessed at.
  -- Judged only now, after invoice_lines was populated above.
  -- ──────────────────────────────────────────────────────────────────────
  select count(*) into v_orphaned_original_invoice_lines
  from public.credit_notes cn,
       jsonb_array_elements(coalesce(cn.line_items, '[]'::jsonb)) l
  where l->>'originalInvoiceLineId' is not null
    and coalesce((l->>'quantity')::numeric, 0) > 0
    and not exists (
      select 1 from public.invoice_lines il
      where il.id = (l->>'originalInvoiceLineId')::uuid and il.company_id = cn.company_id
    );

  raise notice 'normalized_line_backfill (post): % credit-note line(s) carried an originalInvoiceLineId with no matching invoice_lines row — left NULL (referenced invoice pre-dates 0038), not guessed at.',
    v_orphaned_original_invoice_lines;

  -- Loud, per-kind restatement so a non-zero count is impossible to miss.
  if v_orphaned_products > 0 then
    raise notice 'normalized_line_backfill: % line(s) had a productId that does not resolve to a same-company product — backfilled as NULL, not guessed at.', v_orphaned_products;
  end if;
  if v_orphaned_warehouses > 0 then
    raise notice 'normalized_line_backfill: % line(s) had a warehouseId that does not resolve to a same-company warehouse — backfilled as NULL, not guessed at.', v_orphaned_warehouses;
  end if;
  if v_orphaned_tax_rates > 0 then
    raise notice 'normalized_line_backfill: % line(s) had a taxRateId that does not resolve to a same-company tax rate — backfilled as NULL, not guessed at.', v_orphaned_tax_rates;
  end if;
  if v_orphaned_original_invoice_lines > 0 then
    raise notice 'normalized_line_backfill: % credit-note line(s) had an originalInvoiceLineId with no normalized invoice line — backfilled as NULL, not guessed at.', v_orphaned_original_invoice_lines;
  end if;
end $$;
