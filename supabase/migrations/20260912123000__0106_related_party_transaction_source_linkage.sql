-- 0106_related_party_transaction_source_linkage
-- Tax & Compliance integrity audit, continuation (2026-09-12), §10/§11.
-- AUTHORED, NOT APPLIED. Apply AFTER 0008 (related_party_transactions),
-- 0004 (journal_entries), 0006 (invoices/customer_receipts/bills/payments).
--
-- CONTEXT. `related_party_transactions.source_reference` was free text —
-- "NOT a real foreign-key relationship enforced anywhere" per its own
-- prior doc comment. A related-party disclosure amount could silently
-- drift from the real accounting record it supposedly represented, with
-- nothing to catch it, and no way to navigate from the disclosure back to
-- the real evidence behind it.
--
-- This migration adds a REAL, validated (if polymorphic) link:
-- `source_document_type` names WHICH of five tables this codebase
-- actually has (invoices/bills/journal_entries/customer_receipts/
-- payments — deliberately not an open-ended list; no fake source type is
-- invented for a table that doesn't exist), and `source_document_id`
-- names the row. A genuine multi-table foreign key isn't possible in
-- Postgres, so a BEFORE INSERT/UPDATE trigger does the equivalent check:
-- when a source is set, the referenced row must actually exist AND
-- belong to the SAME company as the related-party transaction itself —
-- closing both the "does this record even exist" gap and a cross-company
-- reference gap in one check.
--
-- `source_document_type`/`source_document_id` are NULLABLE TOGETHER — a
-- transaction with neither set is the explicit, honest "Manual/Other"
-- route (§10's own requirement: "retain an explicit Manual/Other route
-- rather than forcing fake linkage"). The CHECK constraint below enforces
-- they are set together (both or neither), never one without the other.
--
-- This migration does NOT touch `amount`/`transaction_date` derivation —
-- that stays a TypeScript concern (relatedPartyTransactionService.ts's
-- resolveSource()), consistent with every other "DB enforces existence/
-- integrity, TypeScript owns business logic" split in this codebase.
-- Posting a related-party transaction NEVER writes to the GL — this
-- migration adds a read-only reference, not a second ledger.

alter table public.related_party_transactions
  add column if not exists source_document_type text,
  add column if not exists source_document_id uuid;

alter table public.related_party_transactions
  add constraint related_party_transactions_source_type_check
  check (source_document_type is null or source_document_type in ('invoice', 'bill', 'journal_entry', 'customer_receipt', 'payment'));

alter table public.related_party_transactions
  add constraint related_party_transactions_source_pair_check
  check ((source_document_type is null) = (source_document_id is null));

create index related_party_transactions_source_idx
  on public.related_party_transactions (company_id, source_document_type, source_document_id);

create or replace function public.validate_related_party_transaction_source()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_found boolean;
begin
  if new.source_document_type is null then
    return new;
  end if;

  case new.source_document_type
    when 'invoice' then
      select exists(select 1 from public.invoices where id = new.source_document_id and company_id = new.company_id) into v_found;
    when 'bill' then
      select exists(select 1 from public.bills where id = new.source_document_id and company_id = new.company_id) into v_found;
    when 'journal_entry' then
      select exists(select 1 from public.journal_entries where id = new.source_document_id and company_id = new.company_id) into v_found;
    when 'customer_receipt' then
      select exists(select 1 from public.customer_receipts where id = new.source_document_id and company_id = new.company_id) into v_found;
    when 'payment' then
      select exists(select 1 from public.payments where id = new.source_document_id and company_id = new.company_id) into v_found;
    else
      raise exception 'related_party_transactions: unsupported source_document_type "%"', new.source_document_type;
  end case;

  if not v_found then
    raise exception 'related_party_transactions: source_document_type "%" / source_document_id "%" does not exist in this company — cannot link to a record that does not exist or belongs to another company.', new.source_document_type, new.source_document_id;
  end if;

  return new;
end;
$$;

create trigger related_party_transactions_validate_source
  before insert or update on public.related_party_transactions
  for each row execute function public.validate_related_party_transaction_source();
