-- 0082_vat_source_entries_uniqueness
-- Fixed Assets accounting-integrity Review 4 (Final Transactional Completion).
-- AUTHORED, NOT APPLIED. Apply AFTER 0080 (this migration alters its table).
--
-- Migration 0080 gave `vat_source_entries` an index on
-- (company_id, source_type, source_id) but no uniqueness — nothing stopped a
-- retried write from inserting the same taxable event's VAT evidence twice.
--
-- One logical source (e.g. one asset disposal) can currently only ever
-- produce ONE original VAT source row — assetDisposalService writes exactly
-- one per taxable disposal. A reversal/correction is a NEW row pointing back
-- at the original via `reverses_entry_id` (append-only, never a second
-- "original"), so the uniqueness must apply to ORIGINAL rows only —
-- `reverses_entry_id is null` — or Postgres's normal "NULLs are distinct"
-- unique-index semantics would let an unlimited number of contra rows (which
-- also carry `reverses_entry_id is null`... no: a contra row always HAS
-- `reverses_entry_id` set, non-null) collide, which is fine, and would ALSO
-- (wrongly, if we used a plain unique constraint instead of a partial index)
-- allow unlimited ORIGINALS since a plain UNIQUE constraint would still
-- reject only exact duplicate tuples, not enforce "at most one null". A
-- partial unique index scoped to `reverses_entry_id is null` is the correct
-- tool: it rejects a second ORIGINAL for the same (company, source_type,
-- source_id) while leaving reversal rows (reverses_entry_id not null)
-- completely unconstrained by it.
create unique index vat_source_entries_original_unique
  on public.vat_source_entries (company_id, source_type, source_id)
  where reverses_entry_id is null;
