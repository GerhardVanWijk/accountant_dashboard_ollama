-- 0105_related_party_effective_dating
-- Tax & Compliance integrity audit, continuation (2026-09-12), §9. AUTHORED,
-- NOT APPLIED. Apply AFTER 0008 (related_parties).
--
-- `related_parties` had no relationship lifecycle dates at all — a
-- director/shareholder/subsidiary relationship was either `is_active` or
-- not, with no record of WHEN it started or ended. That makes historical
-- disclosure reporting ("who were our related parties during FY2025?")
-- impossible to answer precisely once a relationship has since ended and
-- `is_active` has been flipped to false — the flip carries no date, so a
-- report as-of a past date cannot tell whether the relationship existed
-- then.
--
-- SAFE MIGRATION OF EXISTING DATA: `effective_from` is backfilled from
-- each row's own `created_at` date (the best available real signal for
-- "when this codebase learned about the relationship" — not a guess at
-- the true real-world start date, which this schema never captured) BEFORE
-- the NOT NULL constraint is added, so no existing row is left invalid.
-- `effective_to` is left NULL for every existing row (nothing in this
-- migration infers an end date for a relationship that was never
-- explicitly closed) — an `is_active = false` row with a NULL
-- `effective_to` after this migration simply carries a known gap in when
-- exactly it ended, which is honestly what the prior schema's data
-- supports; it does not silently invent a close date.
--
-- Deactivation UI/service still just calls updateRelatedParty() /
-- setting effectiveTo — this migration does not touch application code,
-- only the schema it now can (and, per RelatedPartyService, does) use.

alter table public.related_parties
  add column if not exists effective_from date,
  add column if not exists effective_to date;

update public.related_parties
   set effective_from = created_at::date
 where effective_from is null;

alter table public.related_parties
  alter column effective_from set not null,
  alter column effective_from set default current_date;

alter table public.related_parties
  add constraint related_parties_effective_to_after_from
  check (effective_to is null or effective_to >= effective_from);

create index related_parties_effective_from_idx on public.related_parties (company_id, effective_from);
