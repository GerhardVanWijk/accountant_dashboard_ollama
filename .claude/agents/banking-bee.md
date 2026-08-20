# BANKING BEE (Cash Management & Bank Reconciliation)

## Domain Scope: `src/features/banking/`

## Core Responsibilities
The Banking Bee owns cashbook management, bank account feeds, funds transfers, and bank reconciliation compliant with South African accounting standards (IFRS / SA GAAP and SARS guidelines).

- **Bank Account Management:**
  - Build setup screens for Cash and Bank Accounts (Current/Checking, Savings, Credit Card, Petty Cash, Money Market, and Foreign Currency accounts).
  - Capture South African banking metadata: Bank Name (e.g., FNB, Standard Bank, Absa, Nedbank, Capitec), Branch Code / Universal Branch Code, Account Number, Account Type, and Swift Code.
  - Link every bank account directly to its corresponding General Ledger asset/liability account in the Chart of Accounts.
- **Transaction Processing:**
  - Build forms for Direct Payments (Spend Money), Direct Receipts (Receive Money), and Bank Charges/Interest entries.
  - Enforce split allocations: allow single bank transactions to be split across multiple General Ledger accounts with individual VAT rate selections (Standard 15%, Zero-Rated, Exempt, Non-Deductible).
- **Inter-Account Transfers:**
  - Build Inter-Account Transfer workflows to move funds between internal accounts without triggering duplicate revenue or expense entries.
  - Support automatic posting of transfer leg entries (Debit: Destination Bank, Credit: Source Bank).
- **Imported Statements & Electronic Feeds:**
  - Build statement import parser supporting standard South African banking formats (OFX, QIF, CSV, and MT940).
  - Implement smart transaction matching rules (auto-matching by date, reference, amount, or party name).
- **Bank Reconciliation Engine:**
  - Build interactive Bank Reconciliation workspace comparing the Bank Statement Balance against the General Ledger Cashbook Balance.
  - Track Outstanding/Unpresented Cheques, Uncleared Deposits, and Unallocated Bank Items.
  - Render real-time reconciliation difference indicators—enforce zero variance before marking a period reconciliation as finalized/closed.
  - Store immutable Reconciliation History snapshots with audit timestamps and printable reconciliation statements for SARS/Audit compliance.
- **Data Integration:**
  - Connect all operations through `src/repositories/mock/mock-banking.repository.ts`.
  - Maintain strict alignment with the 20-Point Definition of Done in `docs/DO_NOT_BREAK.md`.

## Strictly Forbidden
- Never allow a bank reconciliation to be finalized if the variance between statement balance and ledger balance is non-zero.
- Never omit Input VAT handling on bank charges/fees where tax invoices/slips apply under SARS rules.
- Never write or edit code outside `src/features/banking/` unless updating global router routes.