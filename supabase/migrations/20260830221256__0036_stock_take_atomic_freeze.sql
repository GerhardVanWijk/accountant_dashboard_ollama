-- 0036_stock_take_atomic_freeze
-- Inventory Accounting Module — Phase 3C. AUTHORED, then APPLIED 2026-08-30 under the
-- controlled Review 3C-A procedure (per-migration verification; recorded versions
-- 20260830221042..20260830221256). Additive; 0 business rows changed except the
-- journal_number_counters seed + the 5060 account seed.
--
--
-- `public.freeze_stock_take(p_stock_take_id uuid) returns jsonb` — the ONE
-- atomic snapshot operation for a physical count (item 6).
--
-- Before 0036 `stockTakeService.freeze()` trusted the caller's line
-- `expectedQty` / `unitCost`, and even a DB-driven version done client-side
-- (`for each product: read balance`) would read a MIXED-TIME snapshot: an
-- unrelated receipt / sale / transfer committing between the per-product reads
-- would land some lines pre- and some post-movement.
--
-- 0036 does it in ONE transaction:
--   1. resolve the company from `get_my_company_id()` (never the client),
--   2. load + validate the take (must belong to the company, must be `draft`,
--      must not already be frozen),
--   3. LOCK every scoped product row `FOR UPDATE` in `id` order (no deadlock,
--      and no receipt/issue for those products can interleave the snapshot),
--   4. replace the take's lines with the authoritative snapshot in a single
--      `INSERT ... SELECT` — `expected_qty` from `stock_balances` for the
--      take's warehouse (0, not a skipped line, where the product has no
--      balance row), `unit_cost` from `products.cost_price` (the frozen WAC),
--   5. stamp `frozen_at = now()`, `status = 'counting'`.
--
-- The caller supplies SCOPE only (`stock_takes.scope` + `scope_ref`):
--   'all'      → every tracked product in the company
--   'category' → tracked products whose `category_id` = `scope_ref->>'categoryId'`
--   'items'    → tracked products whose id is in `scope_ref->'productIds'`
--
-- Once frozen the expected quantity and unit cost are immutable — later
-- movement never rewrites them; `counted_qty` is the only counting input, and
-- posting uses `counted_qty - expected_qty` at the frozen `unit_cost`
-- (stockTakeService + migration 0032's `unit_cost_override`).
--
-- SECURITY INVOKER (default): the caller's RLS applies to every table touched
-- (`stock_takes`, `stock_take_lines`, `products`, `stock_balances`). EXECUTE
-- granted to `authenticated` only. Locked `search_path = 'public'`.

create or replace function public.freeze_stock_take(p_stock_take_id uuid)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_company uuid := (select public.get_my_company_id());
  v_take public.stock_takes;
  v_scope text;
  v_category uuid;
  v_line_count integer;
  v_frozen_at timestamptz := now();
begin
  if v_company is null then
    raise exception 'freeze_stock_take: no company context';
  end if;

  select * into v_take from public.stock_takes
    where id = p_stock_take_id and company_id = v_company;
  if not found then
    raise exception 'freeze_stock_take: stock take % not found', p_stock_take_id;
  end if;
  if v_take.status <> 'draft' then
    raise exception 'freeze_stock_take: "%" must be draft to freeze (current status: %)',
      v_take.stock_take_number, v_take.status;
  end if;
  if v_take.frozen_at is not null then
    raise exception 'freeze_stock_take: "%" is already frozen at %',
      v_take.stock_take_number, v_take.frozen_at;
  end if;

  v_scope := coalesce(v_take.scope, 'all');
  v_category := nullif(v_take.scope_ref->>'categoryId','')::uuid;

  -- Lock every scoped product so no receipt / issue / transfer for those
  -- products can commit between here and the INSERT below — the snapshot is
  -- one coherent database state.
  perform 1 from public.products p
    where p.company_id = v_company
      and p.track_inventory = true
      and (
        v_scope = 'all'
        or (v_scope = 'category' and p.category_id = v_category)
        or (v_scope = 'items'
            and p.id::text in (
              select jsonb_array_elements_text(coalesce(v_take.scope_ref->'productIds', '[]'::jsonb))
            ))
      )
    order by p.id
    for update;

  -- The freeze OWNS the line set — any lines a draft take accumulated are
  -- replaced by the authoritative snapshot. (A draft take has no posted GL
  -- history, so this destroys nothing financial.)
  delete from public.stock_take_lines
    where stock_take_id = p_stock_take_id and company_id = v_company;

  insert into public.stock_take_lines
    (company_id, stock_take_id, line_number, product_id, warehouse_id,
     expected_qty, counted_qty, unit_cost, variance_qty, variance_value)
  select
    v_company,
    p_stock_take_id,
    row_number() over (order by p.sku, p.id),
    p.id,
    v_take.warehouse_id,
    coalesce(sb.quantity_on_hand, 0),
    null,
    p.cost_price,
    0,
    0
  from public.products p
  left join public.stock_balances sb
    on sb.product_id = p.id
   and sb.warehouse_id = v_take.warehouse_id
   and sb.company_id = v_company
  where p.company_id = v_company
    and p.track_inventory = true
    and (
      v_scope = 'all'
      or (v_scope = 'category' and p.category_id = v_category)
      or (v_scope = 'items'
          and p.id::text in (
            select jsonb_array_elements_text(coalesce(v_take.scope_ref->'productIds', '[]'::jsonb))
          ))
    );

  get diagnostics v_line_count = row_count;

  update public.stock_takes
     set frozen_at = v_frozen_at,
         status = 'counting',
         total_variance_value = 0,
         updated_at = now()
   where id = p_stock_take_id and company_id = v_company;

  return jsonb_build_object(
    'stock_take_id', p_stock_take_id,
    'frozen_at', v_frozen_at,
    'line_count', v_line_count,
    'status', 'counting'
  );
end;
$$;

revoke all on function public.freeze_stock_take(uuid) from public, anon;
grant execute on function public.freeze_stock_take(uuid) to authenticated;
