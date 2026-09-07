-- 0076_product_category_company_integrity
-- PRODUCT CATEGORIES + PRODUCT PICKER INTEGRATION (2026-09-07, branch
-- product-catalog-picker-2026-09-07). PRE-MERGE. `main` untouched.
--
-- ═══════════════════════════════════════════════════════════════════════
-- CONTEXT
--   `products.category_id` (FK to `product_categories`, migration 0024) is
--   the authoritative product→category link; `products.category` (text) is
--   a denormalized mirror kept in step by the app. The application layer
--   was, until this change, blind to `category_id` (the Supabase product
--   repository never mapped the column), so the link existed only in seed
--   data. Now that the app reads and writes it, two small guards:
--
--   1. COMPANY INTEGRITY — a BEFORE INSERT/UPDATE trigger that rejects a
--      `category_id` belonging to a different company. Mirrors the
--      `user_roles_company_integrity` guard from 0065. The category picker
--      is already RLS-scoped to the caller's own company, so this only
--      matters for a direct API call.
--
--   2. GUARDED SELF-HEAL BACKFILL — for any product with a free-text
--      `category` but no `category_id`, set `category_id` ONLY when exactly
--      one same-company `product_categories` row matches the name exactly
--      (case-insensitive, trimmed). No fuzzy matching, no inference from
--      the product name. Ambiguous / unmatched rows are left untouched.
--      On the live Vertex project this touches ZERO rows (all 50 products
--      are already linked and name-consistent) — it is here so a fresh
--      install or a future import can't silently leave the two systems out
--      of step.
--
-- ZERO accounting effect: no journal, no stock movement, no posted-record
-- mutation. Category only drives GL-account *resolution* for FUTURE
-- postings (product → category → generic) and report grouping.


-- ─────────────────────────────────────────────────────────────────────
-- 1. Company-integrity trigger
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.enforce_product_category_company_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cat_company uuid;
begin
  if new.category_id is null then
    return new;
  end if;
  select company_id into v_cat_company
  from public.product_categories
  where id = new.category_id;

  if v_cat_company is null then
    raise exception 'products.category_id % does not exist', new.category_id
      using errcode = '23503';
  end if;
  if v_cat_company is distinct from new.company_id then
    raise exception 'products.category_id % belongs to another company', new.category_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_product_category_company_integrity() from public, anon, authenticated;

drop trigger if exists products_category_company_integrity on public.products;
create trigger products_category_company_integrity
  before insert or update of category_id, company_id on public.products
  for each row execute function public.enforce_product_category_company_integrity();


-- ─────────────────────────────────────────────────────────────────────
-- 2. Guarded self-heal backfill (exact same-company name match only)
-- ─────────────────────────────────────────────────────────────────────
with candidate as (
  select p.id as product_id,
         (array_agg(pc.id))[1] as category_id,
         count(*) as match_count
  from public.products p
  join public.product_categories pc
    on pc.company_id = p.company_id
   and lower(btrim(pc.name)) = lower(btrim(p.category))
  where p.category_id is null
    and coalesce(btrim(p.category), '') <> ''
  group by p.id
)
update public.products p
set category_id = c.category_id
from candidate c
where p.id = c.product_id
  and c.match_count = 1;


-- ─────────────────────────────────────────────────────────────────────
-- 3. Observability
-- ─────────────────────────────────────────────────────────────────────
do $$
declare v_total int; v_linked int; v_unmatched int; v_cross int;
begin
  select count(*), count(*) filter (where category_id is not null),
         count(*) filter (where category_id is null and coalesce(btrim(category),'') <> '')
    into v_total, v_linked, v_unmatched
  from public.products;

  select count(*) into v_cross
  from public.products p join public.product_categories pc on pc.id = p.category_id
  where p.company_id is distinct from pc.company_id;

  if v_cross <> 0 then
    raise exception '0076: % product(s) linked to another company''s category — aborting', v_cross;
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'products_category_company_integrity') then
    raise exception '0076: company-integrity trigger missing';
  end if;
  raise notice '0076: OK — products % total / % category-linked / % still free-text-only. Cross-company links: 0.',
    v_total, v_linked, v_unmatched;
end $$;
