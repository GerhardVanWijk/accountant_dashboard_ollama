-- 0047_company_document_profile
-- Phase 4B-2 — Company Document Profile + Professional Document Hardening.
-- AUTHORED, NOT APPLIED (Review 4B-2 gate). Apply order: any time after the
-- Phase A `companies` table and the Phase D `bank_accounts` table exist —
-- it has no dependency on 0045/0046.
--
-- Adds the fields a professionally branded Quote / Sales Order / Tax Invoice /
-- Credit Note / Purchase Order needs to identify its issuer from ONE
-- authoritative source (the company row), instead of the Phase 4B stopgaps
-- (plain-text wordmark, no address block, "exactly one active bank account"
-- guess for the payment block).
--
-- STORAGE DECISION — logo is a base64 data-URL TEXT column, NOT Supabase Storage
-- --------------------------------------------------------------------------
-- This project has never used Supabase Storage: `storage.buckets` is empty and
-- there are no `storage.objects` policies. Adding a bucket means adding (and
-- security-reviewing) its own RLS policy set, a cross-company enumeration
-- surface, and a fetch + CSP path at print time. A single nullable TEXT column
-- holding a `data:image/...;base64,...` URL instead:
--   * inherits the `companies` row's existing tenant isolation exactly — no new
--     bucket, no new policy, no new object-listing surface;
--   * renders in the print view with zero network fetch and zero CSP risk;
--   * is the smallest additive change.
-- The Company Settings form enforces the mime allow-list (png / jpeg / webp /
-- svg) and a 512 KB pre-encode size cap CLIENT-SIDE. A private Storage bucket
-- remains a valid future choice (see docs/BUSINESS_DOCUMENTS.md § "Alternative:
-- private Storage bucket") — it just needs its own review cycle and is not
-- built here.
--
-- ADDRESS MODEL — reuses the established jsonb-Address pattern
-- --------------------------------------------------------------------------
-- `customers.billing_address` / `customers.shipping_address` are jsonb columns
-- holding a whole Address object (`src/types/common.ts`:
-- line1, line2?, city, state?, postalCode?, country). `companies.document_address`
-- follows that exact shape — one jsonb column, not seven scalar columns.
--
-- ADDITIVE ONLY. Every column is nullable with no default and no backfill.
-- A company with every new column NULL renders documents EXACTLY as it does
-- today: name wordmark, no address block, no contact lines, no default terms,
-- and (payment block) omitted unless documents_bank_account_id is later set.
--
-- OFFICE NATIONAL LIVE ROW: this migration does NOT populate any of these
-- columns for the existing `Office National Demo (Pty) Ltd` company (or any
-- other row). No trading name / logo / address / phone / email / website /
-- terms / bank-account pointer is invented. They all stay NULL until an admin
-- sets them through Company Settings.

alter table companies
  add column if not exists trading_name              text,
  add column if not exists logo                      text,   -- base64 data URL (data:image/png;base64,…); NULL = no logo, render the name as a wordmark
  add column if not exists document_address          jsonb,  -- an Address object, same shape as customers.billing_address
  add column if not exists phone                     text,
  add column if not exists email                     text,
  add column if not exists website                   text,
  add column if not exists document_terms            text,   -- default T&Cs / footer terms printed on quotes, invoices, etc.
  add column if not exists documents_bank_account_id uuid
    references bank_accounts(id) on delete set null;

comment on column companies.logo is
  'Base64 data URL of the issuing company''s logo for formal documents. NULL renders the trading/legal name as a wordmark. Mime + size are enforced client-side in Company Settings (png/jpeg/webp/svg, <= 512 KB pre-encode).';
comment on column companies.trading_name is
  'Trading-as name shown as the issuer wordmark / identity on formal documents when set; falls back to companies.name.';
comment on column companies.document_address is
  'jsonb Address (line1, line2?, city, state?, postalCode?, country) — the issuer address block on formal documents. Same shape as customers.billing_address.';
comment on column companies.document_terms is
  'Default terms & conditions / footer terms text printed on quotes, invoices, credit notes and purchase orders. A document-specific override takes precedence where one exists (none do today).';
comment on column companies.documents_bank_account_id is
  'Bank account whose human details (bank name, account number, branch) print in the invoice payment-information block. NULL omits the block — there is no fallback guessing. The FK id itself is NEVER rendered on a document.';

-- on delete set null: deleting a bank account must not orphan this pointer or
-- block the delete — the payment block simply stops rendering until a new
-- account is chosen in Company Settings.
