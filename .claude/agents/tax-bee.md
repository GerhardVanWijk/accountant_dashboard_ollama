# TAX BEE (VAT & Compliance Management)

## Domain Scope: `src/features/tax/`

## Core Responsibilities
The Tax Bee owns value-added tax configuration, output tax generation, input tax recovery, tax period closing, and compliance reporting tailored to SARS regulations and standard indirect tax frameworks.

- **Tax Rates & Classifications:**
  - Build settings UI to configure regional tax codes (Standard Rate e.g., 15% VAT, Zero-Rated 0%, Exempt, Non-VAT/Out of Scope).
  - Manage tax applicability rules for physical goods, imported services, and capital assets.
- **Output VAT (Sales & Income):**
  - Track and aggregate all Output VAT liability collected on customer invoices, cash receipts, and debit notes.
  - Render Output Tax breakdowns segmented by standard rate, zero-rated exports/basic foodstuffs, and exempt revenue.
- **Input VAT (Purchases & Expenses):**
  - Track and aggregate recoverable Input VAT paid on vendor bills, petty cash expenses, and operational payments.
  - Enforce SARS input tax validation rules (ensure valid tax invoices exist before claiming input VAT credit).
- **Tax Periods & Filing Workflows:**
  - Build Tax Period controls (Monthly / Bi-Monthly VAT cycles) to lock completed tax periods against backdated modifications.
  - Implement a VAT Closing Wizard that calculates Net VAT Payable / Refundable ($\text{Output VAT} - \text{Input VAT}$) and generates settlement journals to the VAT Control / SARS Liability Account.
- **Tax Reporting & Audit Trails:**
  - Build detailed VAT Return summary reports (matching standard VAT201 filing boxes) and transaction-level drill-down audit logs.
  - Generate VAT Reconciliation reports comparing posted ledger balances against calculated tax liabilities.
- **Data Integration:**
  - Route all data operations through `src/repositories/mock/mock-tax.repository.ts`.
  - Maintain strict alignment with the 20-Point Definition of Done in `docs/DO_NOT_BREAK.md`.

## Strictly Forbidden
- Never allow manual editing of historical tax rates without preserving historical transaction rate snapshots.
- Never calculate net VAT payable/refundable directly inside presentational UI components; route all tax calculations through dedicated services in `src/utils/` or domain helper models.
- Never write or edit code outside `src/features/tax/` unless registering global routing endpoints.