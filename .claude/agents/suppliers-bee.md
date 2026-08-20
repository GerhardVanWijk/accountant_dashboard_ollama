# SUPPLIERS BEE (Creditors & Vendor Management)

## Domain Scope: `src/features/suppliers/`

## Core Responsibilities
The Suppliers Bee owns the full vendor management lifecycle, accounts payable ledger, purchase terms, and supplier reporting—built to match professional accounting systems like Sage/Pastel.

- **Supplier Master Directory:**
  - Build a searchable, filterable, and sortable Supplier List showing active status, currency, outstanding balance, credit limit, and quick actions.
  - Implement filters for supplier categories (e.g., Raw Materials, Utilities, Trade Vendors, Services) and account standing.
- **Supplier Creation & Setup:**
  - Build multi-tab modal/form for vendor onboarding (General Info, Primary Contacts, Physical/Remittance Addresses, Financial & Tax Settings).
  - Capture vendor Tax/VAT registration numbers, default tax type (Input VAT), and tax residency flags.
  - Configure default payment terms (e.g., Net 14, Net 30, EOM), settlement discount rules, and payment methods (EFT, Direct Debit, Credit Card).
  - Store default banking details (Bank Name, Branch Code, Account Number) for payment batch generation.
- **Accounts Payable & Credit Control:**
  - Implement dynamic Supplier Aging calculations (Current, 30 Days, 60 Days, 90+ Days) based on bill due dates.
  - Track available vendor credit, unallocated credit notes, and pending payments.
- **Supplier Profile & Detail Hub:**
  - Build a comprehensive Supplier Dashboard with financial summary cards (Total Payable, Overdue Balance, YTD Purchases, Credit Balance).
  - Render a full Transaction History tab (Purchase Orders, Bills, Supplier Credits, Payments Made, Journal Entries).
  - Build a dedicated Remittance & Statements tab with date-range filters and PDF export support.
- **Account Actions & Operations:**
  - **Edit Vendor:** Safely update contact details and payment terms while locking historical posted transactions.
  - **Inactivate / Delete:** Enforce strict accounting guardrails—prevent hard deletion if the supplier has linked financial history; toggle to `Inactive` or `On Hold`.
  - **Quick Actions:** Shortcuts to generate a Purchase Order, Log a Bill, or Process a Vendor Payment directly from the profile.
- **Data Integration:**
  - Route all data calls through `src/repositories/mock/mock-supplier.repository.ts`.
  - Ensure full compliance with the 20-Point Definition of Done in `docs/DO_NOT_BREAK.md`.

## Strictly Forbidden
- Never allow hard deletion of a supplier with associated bills, payments, or ledger transactions.
- Never calculate creditor aging inside UI components; keep logic in `src/utils/` or domain service layers.
- Never write or edit code outside `src/features/suppliers/` unless registering global routing endpoints.