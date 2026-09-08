-- 0077_data_migration_centre_schema
-- Data Import & Migration Centre + Export Centre — ported from the Sovereign
-- Legacy Capital codebase (its migrations 0069 + 0071), adapted to Vertex's
-- single-company model (profiles.company_id / get_my_company_id() — NOT the
-- company_memberships/active_company_id concepts SLC later diverged to).
--
-- Additive only. Does not touch any existing table's RLS, does not alter
-- posted-accounting tables, does not change the existing generic import
-- framework (src/features/import/) or its five working adapters. Follows the
-- two proven precedents already in Vertex's schema:
--   - bank_statements/bank_statement_lines (0020): plain `company_id =
--     get_my_company_id()` RLS "for all", no bespoke RPC for metadata rows.
--   - company_documents (0071): private Storage bucket + metadata table +
--     SECURITY DEFINER RPC for the flows that touch Storage (company-prefixed
--     path validation matters there).
--
-- Import batches never write directly into posted accounting. They are
-- audit/tracking metadata for a migration run; the actual accounting writes
-- happen through the SAME services/RPCs every other part of the app already
-- uses (accountService.createAccount, customerService.createCustomer,
-- openingStockBatchService, …) — called from the ImportAdapter
-- implementations, nothing new at the DB layer. (Trial Balance / GL detail /
-- AR-AP opening adapters are NOT part of this migration — they require a
-- manual-journal-draft lifecycle Vertex does not have yet.)

-- ---------------------------------------------------------------------
-- 1. import_mapping_profiles (created first — import_batches references it)
-- ---------------------------------------------------------------------

create table public.import_mapping_profiles (
  id uuid primary key default gen_random_uuid(),
  -- NULL = system profile (shared by every tenant, seeded via migration
  -- only — same nullable-company_id-means-shared convention as
  -- public.roles). A system profile is never insertable by a client: the
  -- insert policy below always requires company_id = get_my_company_id(),
  -- which can never be NULL for an authenticated caller.
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  source_system text not null default 'generic',
  import_type text not null,
  -- Declarative JSON config only ("no executable scripts").
  -- column_mappings: fieldKey -> source header. account_mappings:
  -- externalAccountCode -> { accountId | 'create' | 'ignore' }.
  -- tax_mappings: externalTaxCode -> { taxRateId }. format_settings:
  -- { dateFormat, decimalFormat }.
  column_mappings jsonb not null default '{}'::jsonb,
  format_settings jsonb not null default '{}'::jsonb,
  account_mappings jsonb not null default '{}'::jsonb,
  tax_mappings jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_mapping_profiles_system_pairing check (is_system = (company_id is null))
);

create unique index import_mapping_profiles_system_name_unique
  on public.import_mapping_profiles (name) where company_id is null;
create unique index import_mapping_profiles_company_name_unique
  on public.import_mapping_profiles (company_id, name) where company_id is not null;
create index import_mapping_profiles_company_id_idx on public.import_mapping_profiles (company_id);
create index import_mapping_profiles_import_type_idx on public.import_mapping_profiles (import_type);

alter table public.import_mapping_profiles enable row level security;

create policy import_mapping_profiles_select on public.import_mapping_profiles
  for select to authenticated using (
    company_id is null or company_id = (select public.get_my_company_id())
  );
create policy import_mapping_profiles_write_own_company on public.import_mapping_profiles
  for all to authenticated using (
    company_id = (select public.get_my_company_id())
  ) with check (
    company_id = (select public.get_my_company_id())
  );

-- ---------------------------------------------------------------------
-- 2. import_batches
-- ---------------------------------------------------------------------

create type import_batch_status as enum (
  'uploaded', 'mapping', 'validation_failed', 'ready', 'importing',
  'completed', 'completed_with_warnings', 'failed', 'cancelled'
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- e.g. 'chart_of_accounts' | 'customers' | 'suppliers' | 'products' |
  -- 'opening_stock' — matches each ImportAdapter's own `id`.
  import_type text not null,
  -- 'generic' | 'pastel_sage' | 'xero' | 'syspro' | 'vertex_package'
  source_system text not null default 'generic',
  file_name text not null,
  -- Path within the 'import-sources' bucket; null for a Vertex-package
  -- re-import, which stores nothing new (it reads an existing export).
  storage_path text,
  mime_type text,
  file_size bigint,
  -- SHA-256 of the file content, hex — used for "already imported"
  -- duplicate-file detection, never a security control on its own.
  file_hash text,
  status import_batch_status not null default 'uploaded',
  row_count integer not null default 0,
  valid_count integer not null default 0,
  warning_count integer not null default 0,
  error_count integer not null default 0,
  imported_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  mapping_profile_id uuid references public.import_mapping_profiles(id) on delete set null,
  column_mapping jsonb not null default '{}'::jsonb,
  duplicate_strategy text,
  -- Final ImportExecutionSummary, counts only — never raw row content.
  result_summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  validated_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_batches_file_size_check check (file_size is null or file_size between 1 and 10485760)
);

create index import_batches_company_id_idx on public.import_batches (company_id, created_at desc);
create index import_batches_status_idx on public.import_batches (company_id, status);
create index import_batches_hash_idx on public.import_batches (company_id, file_hash);
create index import_batches_import_type_idx on public.import_batches (company_id, import_type);

alter table public.import_batches enable row level security;

-- Plain company-scoped "for all", same shape as bank_statements (0020) —
-- these rows are tracking metadata, not accounting postings. Cancellation is
-- a status update to 'cancelled' (no naive DELETE), so there is deliberately
-- no delete policy at all.
create policy import_batches_all_own_company on public.import_batches
  for all to authenticated using (
    company_id = (select public.get_my_company_id())
  ) with check (
    company_id = (select public.get_my_company_id())
  );

-- ---------------------------------------------------------------------
-- 3. import_batch_issues
-- ---------------------------------------------------------------------

create type import_issue_severity as enum ('error', 'warning', 'info');
create type import_issue_resolution_status as enum ('open', 'resolved', 'ignored');

create table public.import_batch_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  severity import_issue_severity not null,
  issue_code text not null,
  category text not null,
  row_number integer,
  field_name text,
  source_value text,
  message text not null,
  resolution_hint text,
  resolution_status import_issue_resolution_status not null default 'open',
  resolution_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  constraint import_batch_issues_source_value_len check (source_value is null or char_length(source_value) <= 500),
  constraint import_batch_issues_message_len check (char_length(message) <= 1000)
);

create index import_batch_issues_batch_id_idx on public.import_batch_issues (batch_id, severity);
create index import_batch_issues_company_id_idx on public.import_batch_issues (company_id);
create index import_batch_issues_resolution_idx on public.import_batch_issues (company_id, resolution_status);

alter table public.import_batch_issues enable row level security;

create policy import_batch_issues_all_own_company on public.import_batch_issues
  for all to authenticated using (
    company_id = (select public.get_my_company_id())
  ) with check (
    company_id = (select public.get_my_company_id())
  );

-- ---------------------------------------------------------------------
-- 4. import-sources Storage bucket (original uploaded file, private,
--    company-scoped path — company_id/uuid-filename). Preserved, never
--    deleted by a client — no delete policy at all. Bucket-level
--    file_size_limit + allowed_mime_types make the client-side CSV/XLS/XLSX
--    + 10MB rule (fileParser.ts) unbypassable at the Storage layer too.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'import-sources', 'import-sources', false, 10485760,
  array[
    'text/csv', 'application/csv', 'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

create policy import_sources_storage_select on storage.objects
  for select to authenticated using (
    bucket_id = 'import-sources'
    and exists (
      select 1 from public.import_batches b
      where b.storage_path = name and b.company_id = (select public.get_my_company_id())
    )
  );

create policy import_sources_storage_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'import-sources'
    and (storage.foldername(name))[1] = (select public.get_my_company_id())::text
  );

-- RPC used only for the initial write (path-prefix validation matters).
-- Every later status/count/mapping update goes through the plain RLS policy.
create or replace function public.create_import_batch(
  p_import_type text,
  p_source_system text,
  p_file_name text,
  p_storage_path text,
  p_mime_type text,
  p_file_size bigint,
  p_file_hash text
)
returns public.import_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.get_my_company_id();
  v_actor uuid := auth.uid();
  v_batch public.import_batches;
begin
  if v_company is null or v_actor is null then raise exception 'An authenticated active-company user is required'; end if;
  if p_storage_path is not null and p_storage_path !~ ('^' || v_company::text || '/') then
    raise exception 'Import source storage path must be scoped to the active company';
  end if;

  insert into public.import_batches (company_id, import_type, source_system, file_name, storage_path, mime_type, file_size, file_hash, uploaded_by)
  values (v_company, p_import_type, p_source_system, p_file_name, p_storage_path, p_mime_type, p_file_size, p_file_hash, v_actor)
  returning * into v_batch;

  insert into public.audit_log_entries (company_id, user_id, action, module, record_type, record_id, new_value)
  values (v_company, v_actor::text, 'created', 'import', 'ImportBatch', v_batch.id::text,
    jsonb_build_object('file_name', p_file_name, 'import_type', p_import_type, 'source_system', p_source_system));

  return v_batch;
end;
$$;

revoke all on function public.create_import_batch(text, text, text, text, text, bigint, text) from public, anon;
grant execute on function public.create_import_batch(text, text, text, text, text, bigint, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. import_evidence_documents + import-evidence Storage bucket —
--    supporting documents. Evidence only: no accounting entry is ever
--    created from this table or bucket.
-- ---------------------------------------------------------------------

create table public.import_evidence_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  batch_id uuid references public.import_batches(id) on delete set null,
  document_name text not null,
  document_type text not null default 'other',
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  notes text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (company_id, storage_path),
  constraint import_evidence_documents_file_size_check check (file_size is null or file_size between 1 and 10485760),
  constraint import_evidence_documents_mime_type_check check (mime_type is null or mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/jpg'))
);

create index import_evidence_documents_company_id_idx on public.import_evidence_documents (company_id, created_at desc);
create index import_evidence_documents_batch_id_idx on public.import_evidence_documents (batch_id);

alter table public.import_evidence_documents enable row level security;
create policy import_evidence_documents_select_own_company on public.import_evidence_documents
  for select to authenticated using (company_id = (select public.get_my_company_id()));
revoke all on public.import_evidence_documents from anon;
revoke insert, update, delete, truncate on public.import_evidence_documents from authenticated;
grant select on public.import_evidence_documents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'import-evidence', 'import-evidence', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

create policy import_evidence_storage_select on storage.objects
  for select to authenticated using (
    bucket_id = 'import-evidence'
    and exists (
      select 1 from public.import_evidence_documents doc
      where doc.storage_path = name and doc.company_id = (select public.get_my_company_id())
    )
  );

create policy import_evidence_storage_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'import-evidence'
    and (storage.foldername(name))[1] = (select public.get_my_company_id())::text
  );

create policy import_evidence_storage_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'import-evidence'
    and exists (
      select 1 from public.import_evidence_documents doc
      where doc.storage_path = name and doc.company_id = (select public.get_my_company_id())
    )
  );

create or replace function public.create_import_evidence_document(
  p_document_name text,
  p_document_type text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint,
  p_batch_id uuid,
  p_notes text
)
returns public.import_evidence_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.get_my_company_id();
  v_actor uuid := auth.uid();
  v_doc public.import_evidence_documents;
begin
  if v_company is null or v_actor is null then raise exception 'An authenticated active-company user is required'; end if;
  if p_storage_path !~ ('^' || v_company::text || '/') then
    raise exception 'Evidence storage path must be scoped to the active company';
  end if;
  if p_batch_id is not null and not exists (select 1 from public.import_batches where id = p_batch_id and company_id = v_company) then
    raise exception 'Import batch not found for this company';
  end if;

  insert into public.import_evidence_documents (company_id, batch_id, document_name, document_type, storage_path, file_name, mime_type, file_size, notes, uploaded_by)
  values (v_company, p_batch_id, p_document_name, coalesce(p_document_type, 'other'), p_storage_path, p_file_name, p_mime_type, p_file_size, p_notes, v_actor)
  returning * into v_doc;

  insert into public.audit_log_entries (company_id, user_id, action, module, record_type, record_id, new_value)
  values (v_company, v_actor::text, 'created', 'import', 'ImportEvidenceDocument', v_doc.id::text,
    jsonb_build_object('document_name', v_doc.document_name, 'document_type', v_doc.document_type, 'batch_id', p_batch_id));

  return v_doc;
end;
$$;

create or replace function public.remove_import_evidence_document(p_document_id uuid)
returns public.import_evidence_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.get_my_company_id();
  v_actor uuid := auth.uid();
  v_doc public.import_evidence_documents;
begin
  if v_company is null or v_actor is null then raise exception 'An authenticated active-company user is required'; end if;

  delete from public.import_evidence_documents
    where id = p_document_id and company_id = v_company
    returning * into v_doc;
  if not found then raise exception 'Evidence document not found'; end if;

  insert into public.audit_log_entries (company_id, user_id, action, module, record_type, record_id, previous_value)
  values (v_company, v_actor::text, 'deleted', 'import', 'ImportEvidenceDocument', v_doc.id::text,
    jsonb_build_object('document_name', v_doc.document_name, 'file_name', v_doc.file_name));

  return v_doc;
end;
$$;

revoke all on function public.create_import_evidence_document(text, text, text, text, text, bigint, uuid, text) from public, anon;
revoke all on function public.remove_import_evidence_document(uuid) from public, anon;
grant execute on function public.create_import_evidence_document(text, text, text, text, text, bigint, uuid, text) to authenticated;
grant execute on function public.remove_import_evidence_document(uuid) to authenticated;
