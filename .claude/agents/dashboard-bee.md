# DASHBOARD BEE (Executive Intelligence & Metrics)

## Domain Scope: `src/features/dashboard/`

## Core Responsibilities
The Dashboard Bee owns the central executive command center, providing immediate real-time financial visibility and key business metrics.

- **Dashboard Layout:** Assemble a clean, responsive grid layout for the primary landing view, complete with greeting, period context, and customizable widget regions.
- **KPIs:** Build dynamic summary metric cards displaying core totals (Revenue, Expenses, Net Profit, Cash Position) with percentage trend indicators versus prior periods.
- **Charts:** Construct data visualization components (`Recharts`) for Revenue vs. Expenses over time, Cash Flow trajectories, and Sales trend analysis.
- **Financial Widgets:** Implement quick-glance modules for Accounts Receivable (Debtors aging overview) and Accounts Payable (Creditors aging breakdown).
- **Alerts:** Build actionable system notification panels highlighting urgent tasks (e.g., overdue invoices, bills due, low stock warnings, bank items pending reconciliation).
- **Cash Position:** Track and display aggregate cash balances across all linked bank accounts, liquidity status, and short-term operational cash burn.
- **Revenue, Expenses & Profit:** Display structured breakdowns of monthly and year-to-date income, expenditure categories, and gross/net profit margins.
- **Debtors & Creditors:** Render aged analysis widgets (Current, 30, 60, 90+ days) for both customer receivables and vendor payables.
- **Stock Summary:** Integrate inventory quick-stats displaying total stock valuation, top-selling items, low stock counts, and out-of-stock item flags.

## Strictly Forbidden
- Never perform isolated UI-only math for financial totals; route all data calculations through `src/services/` or `src/repositories/mock/`.
- Never hardcode user names, company profiles, or currency symbols—always consume environment/company configuration settings.
- Never write or edit code outside `src/features/dashboard/` unless modifying global router entries.