# ROUTE REGISTRY

> **Record-page overlays (2026-09-03, increment 3):** every `*DetailPage` below marked
> "(record page)" also accepts `{ recordId, embedded }` (`RecordPageProps`) and can be
> rendered by `<RelatedRecordPreview>` as a large over-the-page overlay — no new route, no
> second renderer. Used by the Inventory Item movement ledger so clicking INV-/BILL-/TRF-…
> opens the document without leaving the product page. Previewable types: invoice, bill,
> purchase order, credit note, sales order, quote, supplier return, stock transfer, stock
> adjustment, stock take, opening stock.

| Route Endpoint | Feature Domain | Page Title | Navigation Section |
|---|---|---|---|
| `/` | `dashboard` / `marketing` | Executive Overview (authenticated) / Homepage (unauthenticated, M6) | Sidebar Top |
| `/accounting/coa` | `accounting` | Chart of Accounts | Accounting |
| `/accounting/journals` | `accounting` | General Journals | Accounting |
| `/accounting/ledger` | `accounting` | General Ledger Detail | Accounting |
| `/accounting/trial-balance` | `accounting` | Trial Balance | Accounting |
| `/sales/customers` | `sales` | Customer Directory | Sales |
| `/sales/quotes` | `sales` | Quotes | Sales |
| `/sales/quotes/:quoteId` | `sales` | Quote detail (full page — replaces `?record=`) | — (record page) |
| `/sales/orders` | `sales` | Sales Orders | Sales |
| `/sales/orders/:orderId` | `sales` | Sales Order detail (full page — replaces `?record=`) | — (record page) |
| `/sales/invoices` | `sales` | Sales Invoices | Sales |
| `/sales/invoices/:invoiceId` | `sales` | Invoice detail (full page — replaces `?record=`) | — (record page) |
| `/sales/credit-notes` | `sales` | Credit Notes | Sales |
| `/sales/credit-notes/:creditNoteId` | `sales` | Credit Note detail (full page — replaces `?record=`) | — (record page) |
| `/sales/receipts` | `sales` | Customer Receipts | Sales |
| `/sales/receipts/:receiptId` | `sales` | Customer Receipt detail (full page — replaces `?record=`) | — (record page) |
| `/purchases/vendors` | `purchases` | Vendor Directory | Purchases |
| `/purchases/orders` | `purchases` | Purchase Orders | Purchases |
| `/purchases/orders/:purchaseOrderId` | `purchases` | Purchase Order detail (full page — replaces `?record=`) | — (record page) |
| `/purchases/bills` | `purchases` | Supplier Bills | Purchases |
| `/purchases/bills/:billId` | `purchases` | Bill detail (full page — replaces `?record=`) | — (record page) |
| `/purchases/payments` | `purchases` | Payment Register | Purchases |
| `/purchases/payments/:paymentId` | `purchases` | Supplier Payment detail (full page — replaces `?record=`) | — (record page) |
| `/purchases/aging` | `purchases` | Vendor Aging | Purchases |
| `/banking/accounts` | `banking` | Bank Accounts | Banking |
| `/banking/transactions` | `banking` | Bank Transactions | Banking |
| `/banking/reconciliation` | `banking` | Bank Reconciliation | Banking |
| `/inventory` | `inventory` | Inventory (module overview) | Inventory / Organisation |
| `/inventory/products` | `inventory` | Products & Services | Inventory |
| `/inventory/products/:productId` | `inventory` | Inventory Item detail (full page, 8 tabs — replaces `?record=`) | — (record page) |
| `/inventory/adjustments/:adjustmentId` | `inventory` | Stock Adjustment detail (full page — replaces `?record=`) | — (record page) |
| `/inventory/transfers/:transferId` | `inventory` | Stock Transfer detail (full page — replaces `?record=`) | — (record page) |
| `/inventory/stock-takes/:stockTakeId` | `inventory` | Stock Take detail (full page — replaces `?record=`) | — (record page) |
| `/inventory/supplier-returns/:supplierReturnId` | `inventory` | Supplier Return detail (full page — replaces `?record=`) | — (record page) |
| `/inventory/opening-stock/:batchId` | `inventory` | Opening Stock batch detail (full page — replaces `?record=`) | — (record page) |
| `/inventory/warehouses`| `inventory` | Multi-Warehouse Stock | Inventory |
| `/assets/register` | `assets` | Asset Register | Fixed Assets |
| `/assets/depreciation` | `assets` | Depreciation | Fixed Assets |
| `/assets/disposals` | `assets` | Disposals | Fixed Assets |
| `/assets/tax-register` | `assets` | Tax Register | Fixed Assets |
| `/payroll/employees` | `employees` | Employee Directory | Payroll |
| `/payroll/runs` | `employees` | Payroll Runs | Payroll |
| `/payroll/emp201` | `employees` | EMP201 Monthly Return | Payroll |
| `/payroll/emp501` | `employees` | EMP501 Reconciliation | Payroll |
| `/tax/rates` | `tax` | Tax Rates | Tax |
| `/tax/vat-return` | `tax` | VAT201 Reporting | Tax |
| `/tax/deferred-tax` | `tax` | Deferred Tax | Tax |
| `/tax/expected-credit-losses` | `tax` | Expected Credit Losses | Tax |
| `/reports` | `reports` | Report Library (Reporting Centre, M9) | Reports |
| `/reports/income-statement` | `reports` | Income Statement | Reports |
| `/reports/balance-sheet` | `reports` | Balance Sheet | Reports |
| `/reports/cash-flow` | `reports` | Statement of Cash Flows | Reports |
| `/reports/customer-aging` | `reports` | Accounts Receivable Aging | Reports |
| `/reports/supplier-aging` | `reports` | Accounts Payable Aging | Reports |
| `/compliance/dashboard` | `compliance` | Compliance Dashboard | Compliance |
| `/compliance/public-interest-score` | `compliance` | Public Interest Score | Compliance |
| `/compliance/reporting-standards` | `compliance` | Reporting Standards | Compliance |
| `/related-parties/register` | `relatedParties` | Related Party Register | Related Parties |
| `/related-parties/transactions` | `relatedParties` | Related Party Transactions | Related Parties |
| `/foreign-exchange/rates` | `foreignExchange` | Exchange Rates | Foreign Exchange |
| `/foreign-exchange/calculator` | `foreignExchange` | FX Calculator | Foreign Exchange |
| `/leases/register` | `leases` | Lease Register | Leases |
| `/leases/amortization` | `leases` | Lease Amortization | Leases |
| `/admin/users` | `admin` | User & Role Management | Admin |
| `/admin/audit-trail` | `admin` | Audit Trail (business changes, M10) | Admin |
| `/admin/audit` | `admin` | Access Log (access checkpoints, M10) | Admin |
| `/settings` | `settings` | Settings (Profile/Password/Preferences/Company, M10) | Admin |
| `/settings/accounting` | `settings` | Accounting Settings (link hub, M10) | Admin |
| `/help` | `help` | Help Centre (M10) | Help |
| `/login` | `auth` | Sign In | *(unauthenticated, no nav entry)* |
| `/signup` | `auth` | Create Account | *(unauthenticated, no nav entry)* |
| `/forgot-password` | `auth` | Reset Your Password | *(unauthenticated, no nav entry, M6)* |
| `/reset-password` | `auth` | Set A New Password | *(unauthenticated — Supabase reset-link callback target, no nav entry, M6)* |
| `/onboarding` | `auth` | Set Up Your Company | *(authenticated, pre-company, no nav entry)* |
| `/admin/superuser` | `admin` | Superuser Dashboard | *(superuser-only, self-contained layout, no top nav)* |