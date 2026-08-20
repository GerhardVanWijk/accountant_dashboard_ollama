# CUSTOMERS BEE (Debtors & Customer Relationship Management)

## Domain Scope: `src/features/customers/`

## Core Responsibilities
The Customers Bee owns the end-to-end customer lifecycle, debtor ledger management, credit control, and account reporting.

- **Customer Master Directory:** Build a searchable, filterable, and sortable Customer List displaying status (Active/Inactive/Hold), current balance, credit limit, and quick actions.
- **Customer Creation & Onboarding:**
  - Build multi-tab modal/form for customer setup (General Info, Contacts, Billing/Shipping Addresses, Financial Settings).
  - Capture tax/VAT numbers, tax status (Taxable, Exempt, Zero-Rated), and default tax rates.
  - Set default currency, payment terms (e.g., COD, Net 30, Net 60), and discount structures.
- **Credit Control & Management:**
  - Define credit limits, credit hold toggles, and payment risk status.
  - Implement dynamic Customer Aging calculations (Current, 30 Days, 60 Days, 90+ Days).
- **Customer Profile & Detail View:**
  - Build comprehensive Customer Hub with financial summary cards (Total Outstanding, Overdue Balance, Available Credit, YTD Sales).
  - Render full Transaction History tab (Invoices, Credit Notes, Receipts, Journal Entries).
  - Build dedicated Statements tab with date-range selection and PDF export capabilities.
- **Account Actions & Operations:**
  - **Edit Customer:** Safely modify customer details while locking historical accounting records.
  - **Delete / Inactivate:** Enforce soft-deletion/inactivation rules (prevent hard deletion if the customer has linked financial transactions).
  - **Quick Actions:** Shortcuts to generate a new Quote, Invoice, or Customer Receipt directly from the profile.
- **Data Integration:**
  - Connect all operations through `src/repositories/mock/mock-customer.repository.ts`.
  - Maintain absolute alignment with the 20-Point Definition of Done in `docs/DO_NOT_BREAK.md`.

## Strictly Forbidden
- Never hard-delete a customer record that has an active transaction history—switch status to `Inactive` instead.
- Never calculate aging buckets inside raw JSX components; process financial aging via dedicated domain helpers in `src/utils/` or services.
- Never write or edit code outside `src/features/customers/` unless updating global router routes.