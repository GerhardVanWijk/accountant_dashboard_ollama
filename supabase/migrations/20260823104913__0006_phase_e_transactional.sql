-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260823104913 · name: 0006_phase_e_transactional


-- Phase E (docs/SUPABASE_MIGRATION_GUIDE.md): transactional documents —
-- Sales, Purchases, Banking, Inventory.
--
-- DESIGN DEVIATION from the dispatch brief, flagged not silently decided:
-- every document's line items (Quote/SalesOrder/Invoice/CreditNote/
-- PurchaseOrder/Bill all carry `lineItems: DocumentLineItem[]`,
-- src/types/common.ts) are stored as a single `line_items jsonb` column,
-- NOT a separate child table the way Phase C's journal_lines is. Reason:
-- journal_lines is the GL itself — needs FK integrity to accounts, is
-- queried relationally (getAccountLedger), and must be immutable at the DB
-- layer. A document's line items are a pre-GL source manifest: nothing in
-- this codebase queries them at the SQL level today — every consumer
-- (postInvoice/postBill/aging calculators/dashboard) reads the whole
-- document object and works over lineItems in JS, the same treatment
-- Phase D already gave CustomerContact/SupplierBankDetails/
-- EmployeeAllowance/EmployeeDeduction. Trade-off, accepted deliberately:
-- no FK enforcement on a line's productId/taxRateId, and no SQL-level
-- per-product sales reporting — revisit if either becomes a real need.
-- This also means each document is a single-row write (header+lines
-- together), so there is no header/lines atomicity concern to solve here
-- the way Phase C's RPC solved it for the ledger.

create type public.quote_status as enum ('draft', 'sent', 'accepted', 'declined', 'expired');
create type public.sales_order_status as enum ('pending', 'confirmed', 'fulfilled', 'cancelled');
create type public.invoice_status as enum ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void');
create type public.credit_note_status as enum ('draft', 'issued', 'allocated', 'void');
create type public.credit_note_reason as enum ('return', 'pricing_error', 'discount', 'other');
create type public.purchase_order_status as enum ('draft', 'sent', 'partially_received', 'received', 'cancelled');
create type public.bill_status as enum ('draft', 'awaiting_payment', 'partially_paid', 'paid', 'overdue', 'void');
-- ReceiptMethod and PaymentMethod (src/types/customerReceipt.ts,
-- src/types/payment.ts) are identical unions — one shared enum.
create type public.payment_receipt_method as enum ('eft', 'cash', 'card', 'cheque', 'other');
create type public.bank_transaction_status as enum ('unreconciled', 'matched', 'reconciled');
create type public.bank_transaction_source as enum ('manual', 'transfer', 'import');
create type public.stock_movement_type as enum (
  'goods_received', 'sale', 'sales_return', 'transfer_in', 'transfer_out', 'adjustment', 'opening'
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_number text not null,
  customer_id uuid not null references public.customers(id),
  issue_date timestamptz not null,
  expiry_date timestamptz not null,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  currency text not null default 'ZAR',
  status public.quote_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, quote_number)
);

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_number text not null,
  customer_id uuid not null references public.customers(id),
  quote_id uuid references public.quotes(id),
  order_date timestamptz not null,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  currency text not null default 'ZAR',
  status public.sales_order_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, order_number)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_number text not null,
  customer_id uuid not null references public.customers(id),
  sales_order_id uuid references public.sales_orders(id),
  issue_date timestamptz not null,
  due_date timestamptz not null,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  amount_paid numeric(14, 2) not null default 0,
  currency text not null default 'ZAR',
  status public.invoice_status not null default 'draft',
  notes text,
  journal_entry_id uuid references public.journal_entries(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, invoice_number)
);

create table public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  credit_note_number text not null,
  customer_id uuid not null references public.customers(id),
  invoice_id uuid references public.invoices(id),
  issue_date timestamptz not null,
  reason public.credit_note_reason not null,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  amount_allocated numeric(14, 2) not null default 0,
  currency text not null default 'ZAR',
  status public.credit_note_status not null default 'draft',
  -- CreditNoteAllocation[] — small nested list, same jsonb treatment as
  -- Phase D's CustomerContact.
  allocations jsonb not null default '[]'::jsonb,
  journal_entry_id uuid references public.journal_entries(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, credit_note_number)
);

create table public.customer_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  receipt_number text not null,
  customer_id uuid not null references public.customers(id),
  bank_account_id uuid references public.bank_accounts(id),
  date timestamptz not null,
  method public.payment_receipt_method not null,
  reference text,
  amount numeric(14, 2) not null default 0,
  allocations jsonb not null default '[]'::jsonb,
  unallocated_amount numeric(14, 2) not null default 0,
  currency text not null default 'ZAR',
  journal_entry_id uuid references public.journal_entries(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, receipt_number)
);

-- purchase_orders.bill_id and bills.purchase_order_id are mutually
-- referential (a PO tracks the Bill it was converted to; a Bill tracks the
-- PO it came from) — bill_id's FK constraint is added via ALTER TABLE
-- after bills exists, same order-of-creation problem Phase A never hit
-- but is a standard circular-FK pattern.
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  po_number text not null,
  supplier_id uuid not null references public.suppliers(id),
  order_date timestamptz not null,
  expected_date timestamptz,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  currency text not null default 'ZAR',
  status public.purchase_order_status not null default 'draft',
  notes text,
  bill_id uuid,
  received_date timestamptz,
  journal_entry_id uuid references public.journal_entries(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, po_number)
);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bill_number text not null,
  supplier_id uuid not null references public.suppliers(id),
  purchase_order_id uuid references public.purchase_orders(id),
  issue_date timestamptz not null,
  due_date timestamptz not null,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  amount_paid numeric(14, 2) not null default 0,
  currency text not null default 'ZAR',
  status public.bill_status not null default 'draft',
  journal_entry_id uuid references public.journal_entries(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, bill_number)
);

alter table public.purchase_orders
  add constraint purchase_orders_bill_id_fkey foreign key (bill_id) references public.bills(id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payment_number text not null,
  supplier_id uuid not null references public.suppliers(id),
  bank_account_id uuid references public.bank_accounts(id),
  date timestamptz not null,
  method public.payment_receipt_method not null,
  reference text,
  amount numeric(14, 2) not null default 0,
  allocations jsonb not null default '[]'::jsonb,
  unallocated_amount numeric(14, 2) not null default 0,
  currency text not null default 'ZAR',
  journal_entry_id uuid references public.journal_entries(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, payment_number)
);

-- bank_transactions: editable up until cleared by a finalized
-- reconciliation (enforced by BankTransactionService, not the DB —
-- BankReconciliation itself stays Mock, out of this phase's scope, so
-- reconciliation_id/matched_entity_id are plain uuid columns with no FK
-- target to reference yet).
create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id),
  date timestamptz not null,
  description text not null,
  reference text,
  amount numeric(14, 2) not null default 0,
  direction public.debit_credit not null,
  status public.bank_transaction_status not null default 'unreconciled',
  matched_entity_id uuid,
  category text,
  source public.bank_transaction_source,
  journal_entry_id uuid references public.journal_entries(id),
  transfer_pair_id uuid references public.bank_transactions(id),
  reconciliation_id uuid,
  -- BankTransactionAllocation[] (split-allocation lines) — same jsonb
  -- treatment as every other small nested list this migration handles.
  allocations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- stock_movements: append-only perpetual-inventory ledger — same
-- append-only shape as Phase C's journal_lines (no status field on the
-- real type at all; RLS + revoked grants enforce immutability, not an
-- application-level convention).
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id),
  warehouse_id uuid not null references public.warehouses(id),
  type public.stock_movement_type not null,
  quantity_delta numeric(14, 3) not null,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes on every FK an RLS policy or query filters on (Phase A convention).
create index quotes_company_id_idx on public.quotes (company_id);
create index quotes_customer_id_idx on public.quotes (customer_id);
create index sales_orders_company_id_idx on public.sales_orders (company_id);
create index sales_orders_customer_id_idx on public.sales_orders (customer_id);
create index sales_orders_quote_id_idx on public.sales_orders (quote_id);
create index invoices_company_id_idx on public.invoices (company_id);
create index invoices_customer_id_idx on public.invoices (customer_id);
create index invoices_sales_order_id_idx on public.invoices (sales_order_id);
create index invoices_journal_entry_id_idx on public.invoices (journal_entry_id);
create index credit_notes_company_id_idx on public.credit_notes (company_id);
create index credit_notes_customer_id_idx on public.credit_notes (customer_id);
create index credit_notes_invoice_id_idx on public.credit_notes (invoice_id);
create index credit_notes_journal_entry_id_idx on public.credit_notes (journal_entry_id);
create index customer_receipts_company_id_idx on public.customer_receipts (company_id);
create index customer_receipts_customer_id_idx on public.customer_receipts (customer_id);
create index customer_receipts_bank_account_id_idx on public.customer_receipts (bank_account_id);
create index customer_receipts_journal_entry_id_idx on public.customer_receipts (journal_entry_id);
create index purchase_orders_company_id_idx on public.purchase_orders (company_id);
create index purchase_orders_supplier_id_idx on public.purchase_orders (supplier_id);
create index purchase_orders_bill_id_idx on public.purchase_orders (bill_id);
create index purchase_orders_journal_entry_id_idx on public.purchase_orders (journal_entry_id);
create index bills_company_id_idx on public.bills (company_id);
create index bills_supplier_id_idx on public.bills (supplier_id);
create index bills_purchase_order_id_idx on public.bills (purchase_order_id);
create index bills_journal_entry_id_idx on public.bills (journal_entry_id);
create index payments_company_id_idx on public.payments (company_id);
create index payments_supplier_id_idx on public.payments (supplier_id);
create index payments_bank_account_id_idx on public.payments (bank_account_id);
create index payments_journal_entry_id_idx on public.payments (journal_entry_id);
create index bank_transactions_company_id_idx on public.bank_transactions (company_id);
create index bank_transactions_bank_account_id_idx on public.bank_transactions (bank_account_id);
create index bank_transactions_journal_entry_id_idx on public.bank_transactions (journal_entry_id);
create index bank_transactions_transfer_pair_id_idx on public.bank_transactions (transfer_pair_id);
create index stock_movements_company_id_idx on public.stock_movements (company_id);
create index stock_movements_product_id_idx on public.stock_movements (product_id);
create index stock_movements_warehouse_id_idx on public.stock_movements (warehouse_id);

alter table public.quotes enable row level security;
alter table public.sales_orders enable row level security;
alter table public.invoices enable row level security;
alter table public.credit_notes enable row level security;
alter table public.customer_receipts enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.bills enable row level security;
alter table public.payments enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.stock_movements enable row level security;

create policy quotes_all_own_company on public.quotes for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy sales_orders_all_own_company on public.sales_orders for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy invoices_all_own_company on public.invoices for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy credit_notes_all_own_company on public.credit_notes for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy customer_receipts_all_own_company on public.customer_receipts for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy purchase_orders_all_own_company on public.purchase_orders for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy bills_all_own_company on public.bills for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy payments_all_own_company on public.payments for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));
create policy bank_transactions_all_own_company on public.bank_transactions for all to authenticated
  using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()));

-- stock_movements: SELECT + INSERT only (no update/delete policy at all),
-- same append-only RLS shape as Phase C's journal_lines.
create policy stock_movements_select_own_company on public.stock_movements for select to authenticated
  using (company_id = (select public.get_my_company_id()));
create policy stock_movements_insert_own_company on public.stock_movements for insert to authenticated
  with check (company_id = (select public.get_my_company_id()));
revoke update, delete, truncate on public.stock_movements from anon, authenticated;
revoke all on public.stock_movements from anon;
