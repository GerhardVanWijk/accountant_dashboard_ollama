# ACCOUNTING DOMAIN RULES

## Core Accounting Invariants
1. **Double-Entry Balance:** Every journal transaction must satisfy:
   $$\sum \text{Debits} = \sum \text{Credits}$$
   Unbalanced postings are rejected at the service layer.
2. **Chart of Accounts (CoA) Structure:**
   - `1000 - 1999`: Assets (Debits increase)
   - `2000 - 2999`: Liabilities (Credits increase)
   - `3000 - 3999`: Equity (Credits increase)
   - `4000 - 4999`: Revenue / Income (Credits increase)
   - `5000 - 6999`: Expenses / Cost of Sales (Debits increase)
3. **Control Accounts:** Direct postings to System Control Accounts (Accounts Receivable `1200`, Accounts Payable `2100`, Bank `1050`, Output VAT `2200`, Input VAT `1300`) via manual general journals are strictly forbidden unless marked as explicitly permitted adjustments.
4. **Immutability:** Posted journals cannot be deleted or directly edited. Corrections require Reversing Journal entries.