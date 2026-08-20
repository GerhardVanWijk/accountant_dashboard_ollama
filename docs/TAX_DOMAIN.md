# TAX & COMPLIANCE DOMAIN RULES

## VAT Accounting Framework
1. **Tax Codes & Rates:**
   - **Standard Rate:** 15% VAT (Output tax on sales, Input tax on qualified purchases).
   - **Zero-Rated:** 0% (Exports, basic foodstuffs).
   - **Exempt:** Non-taxable financial services, residential rentals.
   - **Out of Scope / Non-VAT:** Salaries, statutory fees.
2. **Calculation Rules:**
   - Inclusive to Exclusive Conversion:
     $$\text{Exclusive Amount} = \frac{\text{Inclusive Amount}}{1.15}$$
     $$\text{VAT Amount} = \text{Inclusive Amount} - \text{Exclusive Amount}$$
3. **Closing Workflows:**
   - Closing a VAT period transfers Net VAT Liability ($\text{Output VAT} - \text{Input VAT}$) into the VAT Settlement Control Account (`2250`).
   - Closed periods prevent backdated posting of invoices or expenses without period re-opening approvals.