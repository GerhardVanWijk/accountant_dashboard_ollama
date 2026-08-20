# INVENTORY DOMAIN RULES

## Stock Control Protocol
1. **Perpetual Inventory Tracking:** Stock balance quantities update immediately upon posting Goods Received Notes (GRN), Sales Invoices, or Approved Stock Adjustments.
2. **Valuation Engine:**
   - Supported Valuation: FIFO (First-In, First-Out) or Weighted Average Costing (WAC).
   - Valuation adjustments generate corresponding General Ledger entries to Inventory Asset (`1400`) and Inventory Variance / Adjustment Expense (`5500`).
3. **Stock Quantity Attributes:**
   $$\text{Quantity Available} = \text{Quantity on Hand} - \text{Quantity Committed} + \text{Quantity on Order}$$
4. **Stock Take Procedure:** Physical counts lock item balances during audit, record variances, and require explicit manager sign-off prior to journal posting.