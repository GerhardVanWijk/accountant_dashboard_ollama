# Company Documents

**Route:** `/documents` · **Nav:** Administration → Documents
**Migration:** `0071_company_documents` (applied to production 2026-09-07)
**Feature dir:** `src/features/documents/`

A secure, tenant-isolated store for **administrative company records** —
CIPC / registration documents, SARS letters, VAT certificates, tax
documents, contracts, insurance policies, company policies, licences,
agreements, bank confirmation letters, B-BBEE certificates, board /
shareholder documents, employment & HR records, and anything else a
company needs to keep.

## What this is NOT

It is **not** the transactional document system. Invoices, bills,
delivery notes, return notes, credit notes and quotes keep living in their
own accounting modules and their own tables. Nothing in Company Documents
touches them, and they never appear here.

## Data model

`public.company_documents` — metadata only. File **bytes** live in the
private Supabase Storage bucket `company-documents`.

| column | notes |
|---|---|
| `company_id` | tenant key; `on delete cascade` |
| `title`, `description` | free text (≤200 / ≤2000 chars) |
| `category` | free text, ≤60 chars, default `other`. `DOCUMENT_CATEGORY_SUGGESTIONS` is a **hint list**, not an allow-list |
| `file_name` | sanitised original name (path components stripped, unsafe chars → `_`) |
| `storage_path` | `<company_id>/<uuid>.<ext>` — unique, immutable, CHECK-constrained to start with the company id |
| `mime_type` | CHECK-constrained to the allow-list |
| `file_size` | bytes, CHECK `> 0 and <= 26214400` (25 MiB) |
| `document_date`, `expiry_date` | optional |
| `tags` | `text[]` |
| `uploaded_by` / `uploaded_at` | set at insert, immutable |
| `is_archived` / `archived_at` / `archived_by` | archive bookkeeping, maintained by the guard trigger |
| `metadata` | `jsonb`, reserved |

### MIME allow-list (company records)

`application/pdf`, `application/msword`,
`…wordprocessingml.document` (.docx), `application/vnd.ms-excel`,
`…spreadsheetml.sheet` (.xlsx), `text/csv`, `image/png`, `image/jpeg`.

**Deliberately excluded:** SVG, HTML, and every other active / executable
format. Enforced in three places — client (`validateUploadFile`), the
bucket's `allowed_mime_types`, and the table CHECK.

## Security

- **Tenant isolation on two layers.** RLS on `company_documents` (keyed
  off `get_my_company_id()`) *and* RLS on `storage.objects` (keyed off the
  first path segment = company id). Company A can neither list nor fetch
  Company B's documents. Cross-company path inserts are also blocked by
  the `company_documents_path_prefixed_by_company` CHECK.
- **File identity is immutable.** `company_documents_guard()` (BEFORE
  UPDATE) forces `company_id`, `storage_path`, `file_name`, `file_size`,
  `mime_type`, `uploaded_by`, `uploaded_at` back to their stored values.
  Only metadata + the archive flag can change. A "replacement" is a new
  upload = a new row.
- **Downloads are short-lived signed URLs** (`createSignedUrl`, 5 min).
  The bucket is private — `public = false` — and has no permanent public
  URL surface. Filename secrecy is never relied on.
- **No public bucket, ever.** The `on conflict` clause in the migration
  re-asserts `public = false` if the row already existed.

## Delete policy

**Archive, don't delete.** Company users (with the manage permission)
archive and restore. **Permanent deletion is superuser-only** — enforced
by RLS (`company_documents_delete` → `get_my_role() = 'superuser'`) and by
the storage `company_documents_obj_delete` policy. Every hard delete
writes a `document_deleted` audit row *before* the row disappears (the
trigger is `AFTER DELETE` and inserts from `OLD`).

## Audit

`company_documents_audit()` (AFTER INSERT/UPDATE/DELETE) writes append-only
rows to `audit_log_entries` with `module = 'documents'`:

| event | action | payload |
|---|---|---|
| upload | `document_uploaded` | title, category, fileName, fileSize, mimeType, expiryDate |
| archive | `document_archived` | — |
| restore | `document_restored` | — |
| metadata edit | `document_metadata_changed` | before/after of title, category, dates, tags |
| hard delete | `document_deleted` | title, category, fileName + reason |

Because this is a trigger, coverage cannot be bypassed by writing the
table directly.

## Expiry

`expiry_date` is optional — only meaningful for licences, certificates,
insurance and compliance records. `documentExpiryStatus()` classifies a
document as `none` / `ok` / `expiring_soon` (≤30 days) / `expired`, shown
as a badge and a table filter. **Notification generation for upcoming
expiry (30 / 14 / 7 days / expired, deduplicated) is wired in Block D**
once the notification engine exists — see `docs/NOTIFICATIONS.md`.

## Architecture

```
DocumentsPage
  → useCompanyDocuments (hook)
    → companyDocumentService (validation + upload orchestration + signed URLs)
      → SupabaseCompanyDocumentRepository   (company_documents rows)
      → SupabaseCompanyDocumentStorage      (company-documents bucket)
```

Upload orchestration: `validate → storage.upload(bytes) → repo.create(row)`.
If the row write fails, the just-uploaded object is removed (best effort)
so no orphan is left.

## Permissions

Until migration `0074` (Block G) adds a `documents` feature to the
permission catalogue, the upload / edit / archive controls are gated on
`useCanAccess('documents', 'create')`, which resolves to **admin /
superuser only**. Everyone with company membership can still *read and
download* (route is auth-only, like `/settings`). RLS already allows any
active member to insert, so 0074 will open managed access to bookkeeper /
accountant roles and make `viewer` explicitly read-only.

## Tests

`src/features/documents/services/companyDocumentService.test.ts` — 16
tests: file validation (size, extension, MIME spoofing), filename
sanitisation (path traversal, unsafe chars), upload orchestration + orphan
cleanup, archive/restore, `updateMetadata` never touching the archive
flag, `deleteForever`, signed-URL delegation.

Migration 0071 was verified live, rollback-wrapped: guard preserves file
identity + archive bookkeeping, all five audit actions fire, the
path-prefix CHECK rejects cross-company paths, the MIME CHECK rejects SVG.

## Block G re-check (2026-09-07) — PASS

Re-verified against the live project as part of the Administration
hardening block (full table in `SECURITY.md` § "Document security"):
private bucket, signed-URL-only downloads, path/company isolation on both
the metadata row and the storage object, MIME allow-list, 25 MiB cap,
archive-not-delete for company users, superuser-only hard delete,
immutable file identity, audit trigger on every state change. A signed
download URL **cannot** be generated for another company's document — the
`storage.objects` SELECT policy keys on `foldername[1] =
get_my_company_id()`.

**Notification integration (0073):** a non-archived document with
`expiry_date` within 30 days raises a `warning` notification; once past,
`critical`. dedupe_key `document_expiry:<id>`; resolves automatically when
the document is archived, deleted, or its expiry date is moved out.
