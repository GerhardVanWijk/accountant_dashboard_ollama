-- 0071_company_documents
-- ADMINISTRATION MODULE · BLOCK B — Company Documents repository (2026-09-06,
-- branch administration-module-2026-09-06). PRE-MERGE. `main` untouched.
--
-- ═══════════════════════════════════════════════════════════════════════
-- WHAT THIS IS
--   A secure, tenant-isolated store for administrative company records —
--   CIPC / registration documents, SARS letters, VAT certificates,
--   contracts, insurance, policies, licences, bank confirmation letters,
--   B-BBEE certificates, board/shareholder documents, etc.
--
--   This is NOT the transactional document system. Invoices, bills,
--   delivery/return notes, credit notes and quotes keep living in their
--   own accounting modules and their own tables — nothing here touches
--   them. `category` is free text with a suggested (not enforced) set,
--   so a company can file whatever kind of record it needs.
--
-- STORAGE
--   File BYTES live in a NEW PRIVATE Supabase Storage bucket
--   `company-documents` (never public, MIME allow-list, 25 MB cap). The
--   row here holds only metadata + the `storage_path`. No base64/blob in
--   Postgres. Downloads are short-lived signed URLs minted client-side;
--   the bucket has no public URL surface at all.
--
-- SECURITY
--   * Strict tenant isolation on BOTH the metadata row (RLS keyed off
--     get_my_company_id()) and the object (storage.objects RLS keyed off
--     the first path segment = company id). Company A can never see or
--     fetch Company B's documents.
--   * File identity (company_id, storage_path, file_name, file_size,
--     mime_type, uploaded_by/at) is immutable after insert — a trigger
--     forces those columns back. Only metadata (title, description,
--     category, dates, tags, metadata) and the archive flag are editable.
--   * Hard DELETE is superuser-only (both the row and the object). Company
--     users archive/restore; nothing they do destroys bytes or history.
--   * Every upload / archive / restore / delete writes an append-only
--     audit_log_entries row (module 'documents') from a DB trigger, so
--     coverage cannot be bypassed by calling the table directly.
--
-- MIME ALLOW-LIST (company records — deliberately excludes SVG / HTML /
--   any active/executable format):
--     application/pdf
--     application/msword, .../wordprocessingml.document              (DOC/DOCX)
--     application/vnd.ms-excel, .../spreadsheetml.sheet              (XLS/XLSX)
--     text/csv
--     image/png, image/jpeg


-- ─────────────────────────────────────────────────────────────────────
-- 1. TABLE
-- ─────────────────────────────────────────────────────────────────────
create table public.company_documents (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  title         text not null check (btrim(title) <> '' and char_length(title) <= 200),
  description   text check (description is null or char_length(description) <= 2000),
  category      text not null default 'other'
                  check (btrim(category) <> '' and char_length(category) <= 60),
  file_name     text not null check (btrim(file_name) <> '' and char_length(file_name) <= 255),
  storage_path  text not null unique,
  mime_type     text not null check (mime_type in (
                  'application/pdf',
                  'application/msword',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  'application/vnd.ms-excel',
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  'text/csv',
                  'image/png',
                  'image/jpeg'
                )),
  file_size     bigint not null check (file_size > 0 and file_size <= 26214400), -- 25 MiB
  document_date date,
  expiry_date   date,
  tags          text[] not null default '{}',
  uploaded_by   uuid not null,
  uploaded_at   timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  is_archived   boolean not null default false,
  archived_at   timestamptz,
  archived_by   uuid,
  metadata      jsonb not null default '{}'::jsonb,
  -- the object path is always <company_id>/<something>; keeps storage RLS
  -- and metadata RLS provably in agreement.
  constraint company_documents_path_prefixed_by_company
    check (storage_path like company_id::text || '/%')
);

create index company_documents_company_idx  on public.company_documents (company_id);
create index company_documents_active_idx   on public.company_documents (company_id, is_archived);
create index company_documents_category_idx on public.company_documents (company_id, category);
create index company_documents_expiry_idx   on public.company_documents (company_id, expiry_date)
  where expiry_date is not null and is_archived = false;

comment on table public.company_documents is
  'Administrative company records (CIPC, SARS, VAT, contracts, licences, insurance…). File bytes in the private company-documents Storage bucket; this row is metadata only. Distinct from transactional accounting documents. See migration 0071.';


-- ─────────────────────────────────────────────────────────────────────
-- 2. IMMUTABILITY — file identity is fixed after insert
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.company_documents_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- File identity never changes. A "replacement" is a new upload = a new row.
  new.company_id   := old.company_id;
  new.storage_path := old.storage_path;
  new.file_name    := old.file_name;
  new.file_size    := old.file_size;
  new.mime_type    := old.mime_type;
  new.uploaded_by  := old.uploaded_by;
  new.uploaded_at  := old.uploaded_at;

  -- Keep archive bookkeeping honest regardless of what the caller sent.
  if new.is_archived and not old.is_archived then
    new.archived_at := now();
    new.archived_by := (select auth.uid());
  elsif not new.is_archived and old.is_archived then
    new.archived_at := null;
    new.archived_by := null;
  else
    new.archived_at := old.archived_at;
    new.archived_by := old.archived_by;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.company_documents_guard() from public, anon, authenticated;

create trigger company_documents_guard_biu
  before update on public.company_documents
  for each row execute function public.company_documents_guard();


-- ─────────────────────────────────────────────────────────────────────
-- 3. AUDIT — append-only, from a trigger (cannot be bypassed)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.company_documents_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := coalesce((select auth.uid())::text, 'system');
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log_entries
      (company_id, user_id, action, module, record_type, record_id, new_value)
    values (new.company_id, v_uid, 'document_uploaded', 'documents', 'CompanyDocument', new.id::text,
            jsonb_build_object('title', new.title, 'category', new.category,
                               'fileName', new.file_name, 'fileSize', new.file_size,
                               'mimeType', new.mime_type, 'expiryDate', new.expiry_date));
    return new;
  elsif tg_op = 'UPDATE' then
    if new.is_archived and not old.is_archived then
      insert into public.audit_log_entries
        (company_id, user_id, action, module, record_type, record_id)
      values (new.company_id, v_uid, 'document_archived', 'documents', 'CompanyDocument', new.id::text);
    elsif not new.is_archived and old.is_archived then
      insert into public.audit_log_entries
        (company_id, user_id, action, module, record_type, record_id)
      values (new.company_id, v_uid, 'document_restored', 'documents', 'CompanyDocument', new.id::text);
    elsif (old.title, old.description, old.category, old.document_date, old.expiry_date, old.tags)
       is distinct from
          (new.title, new.description, new.category, new.document_date, new.expiry_date, new.tags) then
      insert into public.audit_log_entries
        (company_id, user_id, action, module, record_type, record_id, previous_value, new_value)
      values (new.company_id, v_uid, 'document_metadata_changed', 'documents', 'CompanyDocument', new.id::text,
              jsonb_build_object('title', old.title, 'category', old.category,
                                 'documentDate', old.document_date, 'expiryDate', old.expiry_date, 'tags', old.tags),
              jsonb_build_object('title', new.title, 'category', new.category,
                                 'documentDate', new.document_date, 'expiryDate', new.expiry_date, 'tags', new.tags));
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_log_entries
      (company_id, user_id, action, module, record_type, record_id, previous_value, reason)
    values (old.company_id, v_uid, 'document_deleted', 'documents', 'CompanyDocument', old.id::text,
            jsonb_build_object('title', old.title, 'category', old.category, 'fileName', old.file_name),
            'Hard delete (superuser)');
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.company_documents_audit() from public, anon, authenticated;

create trigger company_documents_audit_aiud
  after insert or update or delete on public.company_documents
  for each row execute function public.company_documents_audit();


-- ─────────────────────────────────────────────────────────────────────
-- 4. RLS — metadata row
-- ─────────────────────────────────────────────────────────────────────
alter table public.company_documents enable row level security;

-- READ: any active member of the owning company, plus superuser.
create policy company_documents_select on public.company_documents
  for select to authenticated
  using (
    company_id = (select public.get_my_company_id())
    or public.get_my_role() = 'superuser'
  );

-- CREATE: a member uploading into their OWN company, as themselves, not
-- pre-archived. Fine-grained "who may upload" is layered on in 0074.
create policy company_documents_insert on public.company_documents
  for insert to authenticated
  with check (
    company_id = (select public.get_my_company_id())
    and uploaded_by = (select auth.uid())
    and is_archived = false
  );

-- UPDATE: members of the owning company (metadata edits + archive/restore;
-- the guard trigger forbids touching file identity), plus superuser.
create policy company_documents_update on public.company_documents
  for update to authenticated
  using (
    company_id = (select public.get_my_company_id())
    or public.get_my_role() = 'superuser'
  )
  with check (
    company_id = (select public.get_my_company_id())
    or public.get_my_role() = 'superuser'
  );

-- DELETE: superuser only. Company users archive; they never hard-delete.
create policy company_documents_delete on public.company_documents
  for delete to authenticated
  using (public.get_my_role() = 'superuser');


-- ─────────────────────────────────────────────────────────────────────
-- 5. STORAGE — private bucket + object-level RLS
-- ─────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-documents', 'company-documents', false, 26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Object path convention: '<company_id>/<uuid>.<ext>'. The first folder
-- segment is the tenant key, matched against get_my_company_id().
create policy company_documents_obj_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'company-documents'
    and (
      (storage.foldername(name))[1] = (select public.get_my_company_id())::text
      or public.get_my_role() = 'superuser'
    )
  );

create policy company_documents_obj_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'company-documents'
    and (storage.foldername(name))[1] = (select public.get_my_company_id())::text
  );

-- No UPDATE policy: objects are write-once. A replacement is a new object.
-- DELETE: superuser only, mirroring the metadata row.
create policy company_documents_obj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'company-documents'
    and public.get_my_role() = 'superuser'
  );


-- ─────────────────────────────────────────────────────────────────────
-- 6. Observability
-- ─────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.company_documents') is null then
    raise exception '0071: company_documents table missing';
  end if;
  if not exists (select 1 from storage.buckets where id = 'company-documents' and public = false) then
    raise exception '0071: private company-documents bucket missing';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'company_documents') <> 4 then
    raise exception '0071: expected 4 RLS policies on company_documents';
  end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
        and policyname like 'company_documents_obj_%') <> 3 then
    raise exception '0071: expected 3 storage.objects policies for company-documents';
  end if;
  raise notice '0071: OK — company_documents + private bucket + RLS + immutability + audit triggers in place.';
end $$;
