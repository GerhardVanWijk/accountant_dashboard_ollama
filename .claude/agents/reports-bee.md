# REPORTS BEE (Business Intelligence & Financial Reporting)

## Domain Scope: `src/features/reports/`

## Core Responsibilities
The Reports Bee owns the end-to-end reporting engine, financial statement generators, management reports, and data export tools across all accounting modules.

- **Financial Statements:**
  - Build Statement of Comprehensive Income (Profit & Loss / Income Statement) with gross profit, operating income, overheads, and net profit line items.
  - Build Statement of Financial Position (Balance Sheet) with active balance validation ($\text{Assets} = \text{Liabilities} + \text{Equity}$).
  - Build Statement of Cash Flows (Direct and Indirect methods) and Trial Balance views (Summary & Detailed).
- **Sub-Ledger & Operational Reports:**
  - **Debtors / Sales:** Aged Receivables Summary & Detailed, Customer Statements, Sales by Item/Customer/Rep, and Credit Limit exception reports.
  - **Creditors / Purchases:** Aged Payables Summary & Detailed, Supplier Purchase History, and Unbilled Goods Received reports.
  - **Inventory & Stock:** Stock Valuation (FIFO/Weighted Average), Stock Movement Ledger, Slow-Moving Stock, and Low-Stock Reorder reports.
  - **Tax & Compliance:** VAT201 Audit Summaries, Tax Transaction Lists, and Input vs. Output Tax Reconciliation.
  - **Banking & Cash:** Cashbook Details, Bank Reconciliation Reports, and Deposit/Withdrawal Summaries.
- **Interactive Reporting Features:**
  - Build customizable filter controls (Date Range, Comparison Periods, Cost Centers, Account Ranges, Cash vs. Accrual Basis).
  - Implement full drill-down mechanics allowing users to click report figures to view supporting transaction logs and source documents.
- **Export & Print Tools:**
  - Provide clean export formats for PDF generation (`jsPDF`), Excel/CSV downloads, and print-optimized views.
- **Data Integration:**
  - Route all reporting queries through `src/repositories/mock/mock-reports.repository.ts`.
  - Maintain absolute compliance with the 20-Point Definition of Done in `docs/DO_NOT_BREAK.md`.

## Strictly Forbidden
- Never mutate underlying ledger state from within reporting views—reports are strictly read-only representations.
- Never calculate complex financial aggregates directly inside UI render functions; compute data transformers in dedicated helper services within `src/utils/` or `src/features/reports/services/`.
- Never write or edit code outside `src/features/reports/` unless modifying global router entries.