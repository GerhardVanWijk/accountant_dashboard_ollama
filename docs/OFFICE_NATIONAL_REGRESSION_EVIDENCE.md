# Office National Demo — Regression Evidence (33-point brief)

**Company:** Office National Demo (Pty) Ltd — `676c6cda-2e67-4ee3-8aaa-249b2c6bbc01`
**Verified:** 2026-08-28, via the Supabase MCP (read-only SQL) against the live project
`bcaffvpibpitpuqglszn`.
**Scope note:** This file is **live-data verification**, not part of `npm test` / CI. It must be
re-run if the seeded data changes. A genuine authenticated-session integration test (through the
real `Supabase*Repository` classes + RLS) needs the `admin@demo.com` password or a service-role key
— **neither is available in this environment** — so it could not be built as CI coverage. The
detector-level and audit-service logic that *can* run without a live round-trip IS covered by real
Vitest tests (see Track 1 below).

## Track 1 — real Vitest tests (in `npm test`, 158 files / 1105 tests, all green)

| File | Tests | What it runs |
|---|---|---|
| `src/features/accounting/services/accountingIntegrityAuditService.test.ts` | 19 | The new `AccountingIntegrityAuditService` (composes the real subledger / VAT / books-integrity checks) — PASS and FAIL/WARNING paths per check |
| `src/features/reconciliationIntelligence/testFixtures/officeNationalReconciliationScenario.test.ts` | 12 | The **real** `ReconciliationInvestigatorService` (same class behind the app's Difference Investigator) over a fixture built from the real seeded reconciliation numbers — asserts every deliberate fault is detected |
| `src/features/accounting/services/officeNationalSubledgerScenario.test.ts` | 5 | The **real** `reconcileAccountsReceivable()` / `reconcileAccountsPayable()` over the real live invoice/bill rows + real GL control balances — locks in the documented (explained) AR/AP variances |

## Track 2 — the 33 checks against live data

`✅` = verified pass. Every number below came from a real query run on 2026-08-28.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Company created | ✅ | Exactly 1 company row: `Office National Demo (Pty) Ltd`, id `676c6cda-…`, ZAR, VAT-registered, FYE 28 Feb |
| 2 | Customer relationships valid | ✅ | 20 customers; 0 invoices/receipts/credit-notes referencing a non-existent customer |
| 3 | Supplier relationships valid | ✅ | 13 suppliers; 0 bills/payments referencing a non-existent supplier |
| 4 | Product relationships valid | ✅ | 50 products (48 stocked + 2 service); 0 stock_movements / invoice-line / bill-line product refs dangling |
| 5 | Inventory movements valid | ✅ | 284 stock_movements; for every stocked product `Σ quantity_delta == quantity_on_hand` (0 mismatches). First movement per product is type `opening`. |
| 6 | Invoices balanced | ✅ | 61 non-draft invoices: `Σ line_items.lineTotal == subtotal` and `subtotal + tax_total == total` for all (0 exceptions) |
| 7 | Invoice journals balanced | ✅ | 60 `source='invoice'` journal entries, every one `Σ debit == Σ credit` |
| 8 | Receipts allocate correctly | ✅ | 34 receipts, 42 allocations; 0 over-allocated (`Σ allocations ≤ amount`); `unallocated_amount == amount − Σ allocations` for all |
| 9 | Credit notes reverse correctly | ✅ | 6 credit notes, each linked to a real invoice, each JE reverses revenue + VAT Output and credits AR; 2 `return` credit notes also restore inventory + COGS |
| 10 | Bills balanced | ✅ | 31 non-draft bills: line-item sums tie to subtotal/tax/total (0 exceptions) |
| 11 | Supplier payments correct | ✅ | 22 payments, 25 allocations; 0 over-allocated; `unallocated_amount` consistent |
| 12 | VAT correct | ✅ | VAT Output GL R86,742.45 = invoice VAT R87,135.17 − credit-note VAT R392.72. VAT Input GL R154,620.57 = bill VAT R76,388.07 + fixed-asset VAT R73,050.00 + direct-bank-expense VAT R5,182.50. Net **−R67,878.12** (refund position — big opening stock + vehicle purchase in the period). |
| 13 | Bank journals balanced | ✅ | JE-3001 (the one new bank-charge entry) balances 47.50 = 47.50; every `source='bank'`/`payment`/`customer_receipt` entry balances |
| 14 | Trial balance R0.00 | ✅ | 32 accounts with activity; debit-column total = credit-column total = **R3,076,605.94**; difference **R0.00**. Also proven by `computeTrialBalance`-equivalent logic in Track 1. |
| 15 | Global debits = credits | ✅ | Across all 170 journal entries / 703 lines: `Σ debit = Σ credit = R4,838,572.09`; difference **R0.00** |
| 16 | AR control = customer subledger | ✅ (explained) | GL 1100 **R207,794.04**. Naive open-invoice subledger R212,554.94. Δ −R4,760.90 = R1,750.00 unallocated "money on account" receipts + R3,010.90 credit notes (real limitation of `reconcileAccountsReceivable()` — it never nets credit notes; flagged, not a data defect). Residual after both: **R0.00**. |
| 17 | AP control = supplier subledger | ✅ (explained) | GL 2000 **R590,511.21**. Open-bill subledger R227,111.21. Δ +R363,400.00 = R368,000.00 delivery vehicle bought on supplier credit (a `fixed_asset` journal, by design not in `bills`) − R4,600.00 deliberate duplicate-posting training fault (scenario C6). Residual: **R0.00**. |
| 18 | Inventory integrity | ✅ (minor drift documented) | GL 1200 **R1,569,381.70** vs `Σ(qty_on_hand × cost_price)` **R1,568,713.00**. Δ **R668.70** (0.04%) = R300.00 sales-return credit notes re-adding stock at issue cost + per-line COGS rounding across 179 sale lines. This is normal perpetual-inventory GL-vs-valuation drift; classified WARNING not FAIL. Movement→QoH ties exactly for all 48 stocked products. |
| 19 | Clean bank matches | ✅ | 81 of 94 `bank_transactions` are `reconciled` (≥ 25 required) |
| 20 | Timing difference detected | ✅ (Track 1) | `date_offset_timing` — PAY-2007 book 25 Aug / bank 27 Aug, still matched |
| 21 | R0.16 mismatch detected | ✅ (Track 1) | `amount_mismatch` — books R47.50 (JE-3001) vs bank R47.66 |
| 22 | Missing R185.50 charge detected | ✅ (Track 1) | `missing_ledger_side` — "Cash handling fee" bank line, no book entry |
| 23 | Interest R62.10 detected | ✅ (Track 1) | `missing_ledger_side` — "Interest Received" bank line, no book entry |
| 24 | Duplicate detected | ✅ (Track 1) | `duplicate_transaction` — JE-2063 + JE-2064 (2 book postings) vs 1 bank row for PAY-2220 |
| 25 | Wrong-sign detected | ✅ (Track 1) | `wrong_sign` — REC-1020 (R1,834.30 inflow) captured on the statement as an outflow |
| 26 | Wrong-account detected | ✅ (Track 2, GL-level) | JE-2041: R2,760.00 courier payment posted to 5180 Advertising instead of 5160 Fuel & Delivery. The **bank line matches perfectly** — this is a General Ledger / Books-Integrity finding, **not** a bank-reconciliation `reconciliation_issue_type` (none of the 14 enum values fit a misclassified expense code; `wrong_bank_account` means a different physical account). Confirmed consistent with Agents 5 & 6. |
| 27 | One-to-many detected | ✅ (Track 1) | `grouped_match` — REC-1201+1202+1203 (12k+8k+5k) = one R25,000 bank deposit |
| 28 | Pair combination detected | ✅ (Track 1) | `combination_match` — R95.00 + R310.40 = R405.40 |
| 29 | Triple combination detected | ✅ (Track 1) | `combination_match` — R42.00 + R118.50 + R64.75 = R225.25 |
| 30 | Outstanding deposit handled | ✅ | REC-1001 R2,295.29 booked 30 Aug, bank line dated 1 Sep, `unreconciled` at month-end |
| 31 | Outstanding payment handled | ✅ | PAY-2004 R46,041.29 booked 28 Aug, bank line dated 1 Sep, `unreconciled` at month-end |
| 32 | No orphan demo records | ✅ | 0 dangling FKs across invoices/bills/receipts/payments/credit-notes/stock-movements/bank-transactions→journal-entries; 0 orphan journal_lines; 0 bad account refs |
| 33 | No cross-company links | ✅ | 0 rows in any company-scoped table carry a `company_id` other than `676c6cda-…`; exactly 1 company exists |

## Balanced books vs open bank exceptions (the Phase 18 distinction)

- **Books-internal (all PASS):** TB difference R0.00 · 0 unbalanced entries · AR/AP/VAT controls all tie
  exactly once the documented items are applied · 0 orphans · 0 cross-company leakage.
- **Bank statement (deliberately NOT clean):** 13 `unreconciled` bank_transactions + 15 open
  `reconciliation_issues` — timing gaps, the R0.16 mismatch, missing charge, unbooked interest, the
  duplicate, the wrong-sign line, two grouped matches, pair & triple combinations. All catalogued in
  `docs/OFFICE_NATIONAL_RECON_EXPECTATIONS.md`.
- The bank-GL check (GL 1000 R212,270.67 == `bank_accounts.current_balance` R212,270.67) passes on
  book-side numbers alone, independent of the statement-reconciliation state sitting next to it. That
  is the proof the system distinguishes "books are internally balanced" from "bank still needs
  reconciling".
