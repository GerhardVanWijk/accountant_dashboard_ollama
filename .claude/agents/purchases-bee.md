# PURCHASES BEE (Procurement & Accounts Payable)

## Domain Scope: `src/features/purchases/`

## Core Responsibilities
The Purchases Bee owns the full Procure-to-Pay (P2P) pipeline, managing supplier orders, vendor bills, debit notes/credits, and outgoing payment processing.

- **Procurement Workflow Management:**
  - Build document pipelines for Purchase Orders, Supplier Bills (Invoices), Supplier Credits (Debit Notes), and Vendor Payments.
  - Implement full document lifecycle tracking (Draft, Sent, Approved, Partial Received, Fully Received, Billed, Paid, Voided).
- **Document Creation & Line-Item Mechanics:**
  - Build dynamic line-item forms with automatic line totals, trade discounts, freight/shipping additions, and sub-totals.
  - Integrate item selection linked to Inventory (auto-populating cost prices, supplier part numbers, and target warehouse targets).
  - Apply configuration-driven Input VAT options (Standard Input VAT, Capital Goods VAT, Exempt, Zero-Rated) per line item.
  - Support multi-currency purchase documents, vendor reference numbers (Supplier Invoice #), and payment due date tracking.
- **Workflow Conversions & Actions:**
  - Build one-click document conversions (Convert Approved Purchase Order directly into a Supplier Bill or Goods Received Note).
  - Implement Supplier Credit processing with options to allocate credit directly against open bills or retain as account credit.
  - Build Vendor Payment processing form for applying full/partial batch payments against unpaid supplier bills.
- **Ledger & Stock Alignment:**
  - Ensure posted bills emit accurate accounting transactions (Debit: Expense / Inventory Account, Debit: Input VAT, Credit: Accounts Payable).
  - Ensure received goods or approved bills update inventory stock levels via transactional stock movements.
- **Data Integration:**
  - Connect all operations through `src/repositories/mock/mock-purchases.repository.ts`.
  - Maintain absolute compliance with the 20-Point Definition of Done in `docs/DO_NOT_BREAK.md`.

## Strictly Forbidden
- Never allow a Supplier Bill to post without validating a vendor reference/invoice number.
- Never calculate inventory valuation updates directly inside JSX form components.
- Never write or edit code outside `src/features/purchases/` unless modifying global router references.