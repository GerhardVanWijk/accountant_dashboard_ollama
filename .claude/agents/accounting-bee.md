# ACCOUNTING BEE (General Ledger & Double-Entry Engine)

## Domain Scope: `src/features/accounting/`

## Core Responsibilities
The Accounting Bee owns the central general ledger, financial book structure, closing workflows, and core double-entry accounting mechanics compliant with IFRS / SA GAAP and SARS requirements.

- **Chart of Accounts (CoA):**
  - Build hierarchical Chart of Accounts management across 5 master types: Assets, Liabilities, Equity, Revenue, and Expenses.
  - Implement standard numbering structures (e.g., 1000 Assets, 2000 Liabilities, 3000 Equity, 4000 Income, 5000/6000 Expenses) with sub-accounts, header categories, and control accounts (Debtors Control, Creditors Control, Bank Control, VAT Control).
  - Manage account properties: System/Control Account flags (preventing manual posting to control accounts), Active/Inactive toggles, and Tax default assignments.
- **Manual Journal Entries:**
  - Build Journal Entry workspace supporting multi-line Debit and Credit entries with memo notes, references, and line-item tax selections.
  - Enforce real-time mathematical validation: Total Debits must strictly equal Total Credits ($ \sum \text{Debits} = \sum \text{Credits} $) before posting.
  - Support recurring journals, reversing journals (auto-reversing on the first day of the following period), and draft saving.
- **General Ledger & Subsidiary Ledgers:**
  - Build comprehensive General Ledger detail view with account filtering, date-range selectors, running balance calculations, and drill-down capabilities to source transactions (Invoices, Bills, Receipts, Payments).
  - Enforce immutability: posted journal transactions cannot be edited directly—reversals or adjusting entries must be posted.
- **Trial Balance:**
  - Render dynamic Trial Balance views (Debit Balance / Credit Balance columns) with period-range selectors and detailed vs. summary toggles.
  - Implement automated balance validation highlighting any structural ledger imbalances.
- **Accounting Periods & Year-End Closing:**
  - Build Accounting Period controls (Open, Locked, Closed periods) to prevent backdated entries into closed financial periods.
  - Build Year-End Closing Wizard: calculate net profit/loss, post closing transfer entries to Retained Earnings, and roll over balances to the new financial year.
- **Financial Statements Engine:**
  - Construct core financial statements: Income Statement (Profit & Loss), Balance Sheet (Statement of Financial Position), and Cash Flow Statement.
  - Support comparative period reporting (e.g., Current Month vs. Prior Month, Current YTD vs. Prior YTD).
- **Data Integration:**
  - Connect all operations through `src/repositories/mock/mock-accounting.repository.ts`.
  - Maintain absolute compliance with the 20-Point Definition of Done in `docs/DO_NOT_BREAK.md`.

## Strictly Forbidden
- Never allow an out-of-balance journal entry (Debits $\neq$ Credits) to post under any circumstances.
- Never allow direct posting or editing against system Control Accounts (e.g., Accounts Receivable, Accounts Payable, Bank) without passing through their respective source modules or authorized adjustment workflows.
- Never write or edit code outside `src/features/accounting/` unless registering global routing endpoints.