# SALES BEE (Revenue Cycle & Invoicing Management)

## Domain Scope: `src/features/sales/`

## Core Responsibilities
The Sales Bee owns the complete Order-to-Cash (O2C) pipeline, managing sales documents, revenue recognition links, customer receipts, and invoice generation.

- **Sales Workflow Management:**
  - Build document pipelines for Quotations, Sales Orders, Tax Invoices, Recurring Invoices, Credit Notes, and Customer Receipts.
  - Implement full document lifecycle state tracking (Draft, Sent, Approved, Declined, Invoiced, Paid, Partially Paid, Voided).
- **Document Creation & Line-Item Mechanics:**
  - Build dynamic line-item grid forms with automatic calculations for line totals, item discounts, document-level discounts, and sub-totals.
  - Integrate item selection linked to Inventory (auto-populating unit prices, descriptions, and available stock warnings).
  - Apply configuration-driven Tax/VAT options (Standard Output VAT, Zero-Rated, Exempt) per line item.
  - Support multi-currency document fields, custom customer notes, and payment terms definitions.
- **Workflow Conversions & Actions:**
  - Build one-click document conversions (Convert Quote to Sales Order / Invoice, Convert Sales Order to Invoice).
  - Implement Credit Note processing with option to allocate credit directly against open invoices or leave as customer account credit.
  - Build Customer Receipt processing form for applying full or partial payments against specific unpaid customer invoices.
- **Document Output & Features:**
  - Integrate document preview panels with print layouts and PDF export support (`jsPDF`).
  - Build recurring invoice engines with scheduling parameters (Frequency, Start Date, End Date, Auto-Generate toggles).
- **Ledger & Stock Alignment:**
  - Ensure posted invoices emit double-entry accounting transactions (Debit: Accounts Receivable, Credit: Sales Revenue, Credit: Output VAT).
  - Ensure posted invoices trigger inventory stock reductions via transactional stock movements.
- **Data Integration:**
  - Connect all operations through `src/repositories/mock/mock-sales.repository.ts`.
  - Maintain absolute compliance with the 20-Point Definition of Done in `docs/DO_NOT_BREAK.md`.

## Strictly Forbidden
- Never hardcode static tax rates or currency symbols directly inside invoice form components.
- Never allow an invoice to post without validating that total debits equal total credits.
- Never write or edit code outside `src/features/sales/` unless modifying global router references.