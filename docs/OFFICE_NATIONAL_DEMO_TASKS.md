# OFFICE NATIONAL DEMO — Task Tracker

**Opened:** 2026-08-28
**Owner:** Queen Bee (orchestrator)
**Rule:** Do NOT commit or push until the entire task is complete and the user approves. Stop for review.
**Goal:** Replace the disposable demo business ("Bushveld Trading Solutions") with a realistic,
fully-linked Office National-style office-equipment & stationery wholesaler/retailer, so the whole
accounting system can be exercised with realistic day-to-day trading + a bank-reconciliation
training month.

Statuses: `NOT STARTED` · `IN PROGRESS` · `PASS` · `FIXED` · `BLOCKED` · `N/A`

---

## Environment facts (established Phase 1)

| Item | Value |
|---|---|
| Supabase project | `bcaffvpibpitpuqglszn` (https://bcaffvpibpitpuqglszn.supabase.co) |
| Current company | `Bushveld Trading Solutions (Pty) Ltd` — id `2ca562af-7c70-4d86-8faf-5326b2180f42` |
| Client key type | publishable / anon only (no service-role key in `.env.local`); RLS = "own company" |
| Migrations | 0000–0018 applied; latest `0018_reconciliation_investigator` |
| auth.users / profiles | 6 / 6 |
| FY | FY2026 (2026-01-01 … 2026-12-31), status open |
| Periods | Jun / Jul / Aug 2026 — all open |

---

## PHASE 1 — Environment safety check

| # | Task | Agent | Status | Notes |
|---|---|---|---|---|
| 1.1 | Inspect live Supabase project, list tables + row counts | Queen (schema) | PASS | 58 tables. Financial tables tiny: customers 5, suppliers 4, products 8, invoices 6, journal_entries 16, journal_lines 55, bank_transactions 7, customer_receipts 3, bills 4, payments 2. All other domain tables empty. |
| 1.2 | Identify current companies | Queen | PASS | Exactly 1: "Bushveld Trading Solutions (Pty) Ltd". Reg `2019/123456/07`, VAT `4123456789` — both obviously sequential placeholder values. |
| 1.3 | Determine if any data could be real / non-demo | Queen | PASS | **No.** All rows `created_at` 2026-08-24. Product names are textbook placeholders ("Standard Widget A", "Premium Widget B", "Industrial Fastener Pack"). All customer & supplier `balance` = 0.00. No closed/locked periods. No payroll, tax, assets, leases data at all. |
| 1.4 | Inspect auth users | Queen | PASS | 6: `gerhardvanwijk@gmail.com` (superuser, company_id NULL), `admin@demo.com` (admin, bound to the demo company — signed in 2026-08-28), 3 anonymous `viewer` logins (2026-08-23, no email), 1 `m0-shell-test-…@mailinator.com` automated test account. No third-party real users. |
| 1.5 | Inspect migration state | Queen | PASS | 19 migrations 0000–0018, linear, no drift. Will not be touched. |
| 1.6 | Backup / export options | Queen | PASS | Pre-reset snapshot of every table's rows to be dumped to `scratchpad/pre-reset-snapshot.json` via MCP before any delete. Supabase project also retains PITR per plan tier (not verified). |
| 1.7 | **Safety decision** | Queen | PASS | **SAFE TO RESET.** Connected environment is unambiguously the intended disposable demo. Destructive reset approved to proceed *after user sign-off* (see Phase 2). Preserve: `auth.users`, `profiles`, `roles`, `permissions`, `role_permissions`, `user_roles`, all migrations, all RLS policies, all schema. |

---

## PHASE 2 — Reset strategy

| # | Task | Agent | Status | Notes |
|---|---|---|---|---|
| 2.1 | Pre-reset full snapshot to scratchpad | Queen | PASS | `scratchpad/pre-reset-snapshot-master.json` + `pre-reset-snapshot-transactional.json`. |
| 2.2 | Destructive reset | Queen | PASS | User chose "brand-new company row". Detached `admin@demo.com` profile, then `DELETE FROM companies WHERE id='2ca562af-…'` — all 47 company-scoped FKs are `ON DELETE CASCADE`, so every transactional + master row was removed in one statement. Verified: companies/accounts/journal_entries/journal_lines/customers/suppliers/products/invoices/bills/bank_transactions/tax_rates/fy/periods/bank_accounts/warehouses all = 0. |
| 2.3 | Preserve auth + RBAC + schema | Queen | PASS | After reset: profiles 6, roles 6 (all system, company_id NULL), permissions 29, role_permissions 59, auth.users 6 — untouched. Migrations 0000–0018 untouched. No RLS policy changed. |

---

## PHASE 3 — New company

| # | Task | Agent | Status | Notes |
|---|---|---|---|---|
| 3.1 | Create company `Office National Demo (Pty) Ltd` | Queen | PASS | id `676c6cda-2e67-4ee3-8aaa-249b2c6bbc01`. Reg `2021/456789/07`, VAT `4990123456`, income tax `9012345678` (all clearly fictional). private_company, ZAR/ZAR, FYE 28 Feb, accrual, ifrs_for_smes, VAT registered, bi_monthly filing, invoice basis. `admin@demo.com` profile re-pointed to it. |
| 3.2 | Financial year + periods | Queen | PASS | `FY2027 (Mar 2026 - Feb 2027)` open. Periods: June 2026 & July 2026 = **closed** (pre-migration; gives QA a closed-period case), August 2026 & September 2026 = **open**. |
| 3.3 | VAT config | Queen | PASS | STD 15% / ZERO / EXEMPT re-created for the new company, effective 2018-04-01, SARS-cited. |

---

## PHASE 4 — Chart of Accounts

| # | Task | Agent | Status | Notes |
|---|---|---|---|---|
| 4.1 | Recreate 39-account base chart under new company | Queen | PASS | Same codes/names/types as the app's seeded chart (Bank, AR, Allowance, Inventory, VAT I/O, AP, GRNI, Fixed Assets, Accum Deprn, Share Capital, Retained Earnings, payroll/tax/lease accounts). |
| 4.2 | Add segregated revenue accounts | Queen | PASS | 4010 Sales-Office Furniture, 4020 Sales-Printers & Equipment, 4030 Sales-Stationery, 4040 Sales-Consumables (Toner & Ink), 4050 Delivery & Service Income, 4900 Interest Income. Generic 4000 "Sales Revenue" kept for app-UI compatibility. |
| 4.3 | Add segregated cost-of-sales accounts | Queen | PASS | 5010 COS-Furniture, 5020 COS-Printers & Equipment, 5030 COS-Stationery, 5040 COS-Consumables. Generic 5000 COGS kept. |
| 4.4 | Add operating expense accounts | Queen | PASS | 5110 Rent, 5120 Electricity, 5130 Internet & Telephone, 5140 Bank Charges, 5150 Insurance, 5160 Fuel & Delivery, 5170 Repairs & Maintenance, 5180 Advertising & Marketing, 5190 Software & Subscriptions, 5210 Cleaning & Office Upkeep, 5220 Professional Fees, 5230 Printing & Stationery (own use), 5240 Staff Welfare. (5200 Depreciation, 5400 Salaries already present.) **63 accounts total.** |
| 4.5 | Account-mapping note | Queen | PASS (documented) | The live app's posting **services** resolve a small fixed set of codes (4000/5000/5100 etc.). Seeded historical data deliberately uses the granular 40xx/50xx accounts for realistic financial statements; **new** transactions entered through the running app UI later would post to the generic codes. Recorded as a known deviation (see Known Issues). |

---

## PHASE 5 — Suppliers (target ~12)

| # | Supplier (fictional) | Type | Terms | Status |
|---|---|---|---|---|
| 5.1 | Alpine Office Furniture Wholesalers | Furniture wholesaler | Net30 | NOT STARTED |
| 5.2 | PrintTech Distributors SA | Printer & MFP distributor | Net30 | NOT STARTED |
| 5.3 | Sappi Paper Trade Supplies (fictional) | Paper wholesaler | Net30 | NOT STARTED |
| 5.4 | Nationwide Stationery Traders | Stationery distributor | Net30 | NOT STARTED |
| 5.5 | TonerZone Imaging Supplies | Toner / ink supplier | Net15 | NOT STARTED |
| 5.6 | PeriphIT Accessories | Computer peripherals | Net30 | NOT STARTED |
| 5.7 | BoxRite Packaging | Packaging / envelopes | Net30 | NOT STARTED |
| 5.8 | City of Cape Town / Eskom (fictional utility) | Electricity | COD/DebitOrder | NOT STARTED |
| 5.9 | FibreStream Business Internet | Internet & telephone | DebitOrder | NOT STARTED |
| 5.10 | Century City Property Holdings | Commercial landlord | Net7 | NOT STARTED |
| 5.11 | QuickFuel Fleet Cards | Fuel | Net30 | NOT STARTED |
| 5.12 | RapidCourier Logistics | Courier / delivery | Net30 | NOT STARTED |
| 5.13 | Sanlam Business Insurance (fictional) | Insurance | DebitOrder | NOT STARTED |

Balances must derive from posted bills/payments, never set directly.

---

## PHASE 6 — Customers (target ~20)

Bulk-buying SA business archetypes; mix of COD / Net7 / Net30, some habitually late, some partial payers.
Full list to be finalised in build. Archetypes: law firms, schools, accounting firms, medical practices,
construction cos, logistics cos, property managers, call centres, IT firms, hotels, training centres,
municipal-contractor businesses, retail branch groups, NGOs, franchised dealerships.

| # | Task | Agent | Status |
|---|---|---|---|
| 6.1 | ~20 fictional business customers with realistic contact + terms | Sales/Receivables | NOT STARTED |
| 6.2 | Balances derive only from invoices − receipts − credit notes | Sales/Receivables | NOT STARTED |

---

## PHASE 7 — Product catalogue (target ~50)

| Group | Examples | Status |
|---|---|---|
| Furniture | ergonomic/executive/visitor/reception chairs, straight & corner desks, filing cabinet, pedestal drawer, bookshelf, office storage cupboard, whiteboard | NOT STARTED |
| Printers / Equipment | mono laser, colour laser, MFP, A3 MFP, shredder, laminator, desktop + printing calculator, label printer | NOT STARTED |
| Consumables | black/cyan/magenta/yellow toner, mono & colour ink cartridges, drum unit | NOT STARTED |
| Stationery | A4 & A3 copier paper, notebooks, ballpoint pens, pencils, permanent markers, highlighters, whiteboard markers, staplers, staples, lever-arch files, manila folders, envelopes (DL/A4), sticky notes, printer labels, tape, scissors, guillotine | NOT STARTED |
| Peripherals / accessories | keyboard, mouse, USB hub, webcam, desk lamp, monitor arm, cable set | NOT STARTED |

Each: SKU, description, cost, price, VAT treatment (all STD 15% here), opening qty, reorder level,
category, valuation method (weighted_average default). Opening stock value must flow through the
opening journal, not be set free-standing.

---

## PHASE 8 — Opening position (as at 2026-08-01)

| # | Task | Status | Notes |
|---|---|---|---|
| 8.1 | Single balanced opening journal, Debits == Credits | NOT STARTED | DR Bank, DR Inventory (= Σ opening qty×cost), DR a few opening AR; CR a few opening AP, CR Share Capital, CR Retained Earnings (balancing). |
| 8.2 | Opening AR sub-ledgers reconcile to control | NOT STARTED | 2–3 customers with a single pre-August open invoice each. |
| 8.3 | Opening AP sub-ledgers reconcile to control | NOT STARTED | 2–3 suppliers with a single pre-August open bill each. |

---

## PHASE 9 — Daily sales (August 2026)

| # | Task | Status |
|---|---|---|
| 9.1 | 2–6 invoices per weekday, quieter days, some bulk orders | NOT STARTED |
| 9.2 | Each invoice → invoice + lines + VAT + AR + revenue + COGS + inventory move + journal + lines | NOT STARTED |
| 9.3 | Status mix: paid / partially_paid / sent(unpaid) / overdue / a couple draft / credited | NOT STARTED |
| 9.4 | Receipts: full, partial, one-covers-many, many-for-one, one unallocated | NOT STARTED |
| 9.5 | Credit notes: damaged return, wrong item, qty correction, price correction | NOT STARTED |

---

## PHASE 10 — Daily purchasing (August 2026)

| # | Task | Status |
|---|---|---|
| 10.1 | Replenishment bills across the month (paper, toner, furniture, stationery, freight) | NOT STARTED |
| 10.2 | Each bill → bill + lines + inventory receipt/GRNI + AP + VAT input + journal | NOT STARTED |
| 10.3 | Supplier payments: full, partial, one-covers-many | NOT STARTED |

---

## PHASE 11 — Expenses

Rent, electricity, internet, insurance, fuel, courier, bank charges, advertising, software subs,
repairs, cleaning, telephone — realistic dates + VAT treatment.

| # | Task | Status |
|---|---|---|
| 11.1 | ~15–20 expense transactions posted via bills or direct bank payments | NOT STARTED |

---

## PHASE 12 — Fixed assets

| # | Task | Status |
|---|---|---|
| 12.1 | Delivery vehicle, warehouse racking, office computers ×N, demo MFP | NOT STARTED |
| 12.2 | Capitalisation entries; one month depreciation run if engine supports it cleanly | NOT STARTED |

---

## PHASE 13 — Bank account

One operating account: `Office National Business Cheque` (FNB-style). All statement activity ties to
real accounting transactions.

| # | Task | Status |
|---|---|---|
| 13.1 | Create bank account + GL mapping to 1000 | PASS | `bank_accounts` id `2fb81a17-92b6-4936-9925-456a73a91cd1`, "Office National Business Cheque", FNB, branch `250655`, acct `62884471059`, `gl_account_id`→1000, opening 350,000.00, current_balance 212,270.67 (computed from live GL 1000). |
| 13.2 | Deposits, EFTs, debit orders, card settlements, fees, interest, transfers | PASS | 94 `bank_transactions` rows total: 81 reconciled / 13 unreconciled. |

---

## PHASE 14 — Bank reconciliation training month

| # | Scenario | Status | Notes |
|---|---|---|---|
| 14.1 | ≥25 clean matches | PASS | 81 reconciled rows (incl. 16 large receipts/payments deliberately split into 2 bank tranches each). |
| 14.2 | Timing differences (payment 28 Aug clears 1 Sep; deposit 30 Aug shows 1 Sep; EFT-vs-statement date) | PASS | PAY-2004→2026-09-01 (unreconciled); REC-1001→2026-09-01 (unreconciled); PAY-2007 book 25 Aug/bank 27 Aug (reconciled, date_offset_timing). |
| 14.3 | R0.16 difference (books bank charge R47.50 vs statement R47.66) | PASS | New `JE-3001` (47.50, balanced) vs bank row 47.66, unreconciled, amount_mismatch. |
| 14.4 | Missing bank charge R185.50 (statement only) | PASS | Bank-only row, "Cash handling fee", 2026-08-22, unreconciled, missing_ledger_side. |
| 14.5 | Interest received R62.10 (statement only) | PASS | Bank-only row, "Interest Received", 2026-08-29, unreconciled, missing_ledger_side. |
| 14.6 | One deliberate duplicate posting (detectable) | PASS | PAY-2220: JE-2063 (real, matched) + JE-2064 (duplicate, Agent 4-built) vs ONE bank row → duplicate_transaction. |
| 14.7 | One wrong-sign scenario (detectable) | PASS | REC-1020/JE-1078 (real inflow) vs bank row captured as credit/outflow, unreconciled, wrong_sign. |
| 14.8 | One wrong-account posting (detectable) | PASS | JE-2041 (Agent 4-built, courier misposted 5180 vs 5160) — bank side matches perfectly (reconciled); documented as a GL/Books-Integrity finding, not a bank-matcher finding. |
| 14.9 | One-to-many: one R25,000 deposit = several customer receipts | PASS | REC-1201+1202+1203 (12k+8k+5k) = ONE bank row 2026-08-19, unreconciled, grouped_match. |
| 14.10 | Many-to-one (if domain permits) | PASS | PAY-2210+PAY-2211 (1,300+1,700) = ONE bank debit-order row R3,000.00, unreconciled, grouped_match. |
| 14.11 | Pair-combination variance (exact = two issues) | PASS | R95.00 + R310.40 = R405.40, two bank-only lines, combination_match. |
| 14.12 | Triple-combination variance (exact = three issues) | PASS | R42.00 + R118.50 + R64.75 = R225.25, three bank-only lines, combination_match. |
| 14.13 | Outstanding payment (in books, not yet on bank at month end) | PASS | Same as 14.2 — PAY-2004. |
| 14.14 | Outstanding deposit (in books, not yet on bank at month end) | PASS | Same as 14.2 — REC-1001. |

Also built (nice-to-have, spec §6): 11 `reconciliation_issues` rows (status `open`) covering every
scenario above except 14.8 (deliberately not a bank-matcher issue type — see expectations doc). No
`reconciliations` row was finalized, since the account is deliberately left with open exceptions at
month-end — finalizing one would misrepresent that state.

---

## PHASE 15 — Reconciliation expectations file

`docs/OFFICE_NATIONAL_RECON_EXPECTATIONS.md` — known-answer reference for every deliberate scenario.

| # | Task | Status |
|---|---|---|
| 15.1 | Document each scenario: source record, bank txn, accounting record, expected status, amount, expected investigator result, rationale | PASS — written, all real ids/amounts/verified sums, explicit note that 14.8/C8 is a GL-level finding not a bank-reconciliation one |

---

## PHASE 16 — Full accounting audit (entire company dataset)

All items verified by Agent 6 (live SQL) and re-verified by Queen. Full figures in
`docs/OFFICE_NATIONAL_REGRESSION_EVIDENCE.md`.

| # | Check | Status | Result |
|---|---|---|---|
| 16.1 | Every posted journal balances | PASS | 0 of 170 entries unbalanced |
| 16.2 | Global Σ debits == Σ credits | PASS | R4,838,572.09 == R4,838,572.09, diff **R0.00** |
| 16.3 | Trial balance | PASS | 32 active accounts, DR col R3,076,605.94 == CR col R3,076,605.94, diff **R0.00** |
| 16.4 | GL: valid accounts, no orphan lines, no broken refs | PASS | 0 bad account refs, 0 orphan lines, 0 bad JE refs |
| 16.5 | AR control == customer subledger | PASS (explained) | GL 1100 R207,794.04; naive subledger R212,554.94; Δ −R4,760.90 = R1,750 unallocated receipts + R3,010.90 credit notes → residual **R0.00** |
| 16.6 | AP control == supplier subledger | PASS (explained) | GL 2000 R590,511.21; open bills R227,111.21; Δ +R363,400 = R368,000 vehicle-on-credit − R4,600 duplicate training fault → residual **R0.00** |
| 16.7 | Inventory movements → QoH → GL → COGS | PASS (minor drift) | Movement→QoH ties exactly (0/48 mismatch). GL 1200 R1,569,381.70 vs valuation R1,568,713.00 → **R668.70** (0.04%) perpetual-inventory rounding + return-cost drift — WARNING not FAIL |
| 16.8 | Bank GL balance | PASS | GL 1000 R212,270.67 == `bank_accounts.current_balance` R212,270.67 (statement reconciliation reported separately: 81 reconciled / 13 unreconciled) |
| 16.9 | VAT: output / input / net / control | PASS | Output R86,742.45 (ties to invoice−CN VAT), Input R154,620.57 (ties to bill+asset+direct VAT), Net **−R67,878.12** refund |
| 16.10 | Invoice integrity | PASS | 61 non-draft: 0 line/VAT/total mismatch, 0 missing JE, 0 broken refs |
| 16.11 | Receipt integrity | PASS | 34 receipts: 0 over-allocated, 0 unallocated-amount mismatch |
| 16.12 | Credit-note integrity | PASS | 6 CNs: each → invoice → AR/revenue/VAT reversal; 2 returns also restore inventory/COGS |
| 16.13 | Bill integrity | PASS | 31 non-draft: 0 line/VAT/total mismatch, 0 missing JE |
| 16.14 | Supplier-payment integrity | PASS | 22 payments: 0 over-allocated, AP reduction + bank credit tie |
| 16.15 | Source-to-GL traceability | PASS | 0 non-draft invoices/bills/CNs/receipts/payments without a `journal_entry_id` |
| 16.16 | Relationship / orphan audit | PASS | 0 dangling FKs anywhere in the document→JE→account graph |
| 16.17 | Company isolation | PASS | 0 rows carry a foreign `company_id`; exactly 1 company in the DB |
| 16.18 | Financial-period integrity | PASS | 170/170 entries in a defined period; 165 Aug (open), 5 Sep (open), 0 in closed Jun/Jul |

---

## PHASE 17 — Books health audit service

| # | Task | Status | Notes |
|---|---|---|---|
| 17.1 | `AccountingIntegrityAuditService` | PASS | New: `src/features/accounting/services/accountingIntegrityAuditService.ts` — composes the existing `reconcileAccountsReceivable/Payable`, `reconcileVatControlAccounts`, `checkJournalEntriesBalance/checkTrialBalance/checkBankSubledgerIntegrity/checkOrphanedPostedDocuments/checkDuplicateGlPosting`, plus new inventory-GL / orphan-ref / company-isolation / period-coverage checks. Returns `{check, status: PASS\|WARNING\|FAIL, detail}[]`. Constructor DI, no direct Supabase access, not wired to any route (service layer only). 19 unit tests. |
| 17.2 | Recon faults → WARNING not FAIL | PASS | Double-entry / TB / unresolvable-account escalate to FAIL; subledger/VAT/bank/inventory variances are WARNING. Deliberate bank exceptions never touch double-entry status. |

---

## PHASE 18 — Healthy books vs reconciliation exceptions

| # | Task | Status | Notes |
|---|---|---|---|
| 18.1 | TB balanced + AR/AP/VAT consistent WHILE bank statement has open exceptions | PASS | Proven directly: TB diff R0.00, controls tie, 0 orphans — WHILE 13 unreconciled bank_transactions + 15 open reconciliation_issues stand. Bank-GL check passes on book-side numbers alone, independent of statement state. |

---

## PHASE 19 — Automated tests

| # | Task | Status | Notes |
|---|---|---|---|
| 19.1 | Reusable in-repo scenario builder / fixture | PASS | `officeNationalReconciliationScenario.ts` (real recon numbers, two-sided candidate shape) + `officeNationalSubledgerScenario.ts` (real live invoice/bill rows) |
| 19.2 | 33 regression assertions | PASS | **Track 1** (real Vitest, in CI): 36 new tests across 3 files running the REAL detector / audit / subledger code against Office-National-shaped data. **Track 2**: `docs/OFFICE_NATIONAL_REGRESSION_EVIDENCE.md` — all 33 items as dated live-SQL evidence. A true authenticated-session integration test is **not achievable here** (no service-role key / no `admin@demo.com` password) — documented, not faked. |
| 19.3 | Full suite + type-check + lint + build green | PASS | type-check clean · lint clean (`--max-warnings 0`) · **1105 tests / 158 files** (was 1069/155 → +36 tests, +3 files) · `vite build` exit 0. Ran by Queen post-merge of all agent work. |

---

## PHASE 20 — Final task-file update + report

| # | Task | Status |
|---|---|---|
| 20.1 | Every row above has final status + evidence | PASS |
| 20.2 | 75-point final report produced (figures computed from data) | PASS — delivered in chat |
| 20.3 | Overall status set | **COMPLETE** — audit invariants hold (TB R0.00, global R0.00, controls reconcile, 0 orphans, company isolated); documented WARNINGs: inventory GL drift R668.70, subledger-fn credit-note limitation |
| 20.4 | STOP — await user approval. No commit, no push. | DONE — nothing committed or pushed; awaiting review |

---

## Known issues / decisions log

- **No service-role key / no `admin@demo.com` password available** → the seed is built via Supabase
  MCP SQL, with every journal posting mirroring `src/mock-data/generateSeedPostings.ts` and the
  posting services exactly. Correctness is proven by the Phase 16 audit rather than by routing
  through the live TypeScript services. (Revisit if credentials are provided.)
- Company row is reused in place (not recreated) to preserve `profiles.company_id` FK.

---

## Progress log

- **2026-08-28 Phase 1** PASS — safety check, SAFE, snapshot saved.
- **Phase 2** PASS — user approved "brand-new company row". Cascade reset. Auth/RBAC/migrations/RLS preserved.
- **Phase 3** PASS — company `676c6cda-2e67-4ee3-8aaa-249b2c6bbc01`, FY2027, periods (Jun/Jul closed, Aug/Sep open).
- **Phase 4** PASS — 63-account chart (base 39 + 24 segregated/opex).
- **Canonical build spec** written to scratchpad — locks IDs, enums, number schemes, posting recipes.
- **Phase 5/6/7/8 (Agent 2 — Master Data)** PASS — 20 customers, 13 suppliers, 50 products, 48 opening
  stock movements, 3 opening invoices (R33,925), 3 opening bills (R28,175), opening JE-0001 balanced at
  **R1,875,050.00** (opening inventory R1,487,450; retained earnings R1,342,450). All invariants verified.
- **Phase 10/11/12 (Agent 4 — Purchases + Fixed Assets)** PASS — verified independently: 70 JEs
  (JE-2001..2064, JE-4001..4005, JE-4099), 186 lines, **0 unbalanced entries**, 0 orphan lines. 31 bills
  (28 new + 3 opening cleared), 22 payments, 5 fixed assets + August depreciation (R8,119.46), 57
  goods-received stock movements. VAT Input R150,945.57 ties exactly to bills+direct-expense+asset VAT.
  AP GL movement ties exactly to open-bill subledger + vehicle-on-credit. All 3 earmarked recon faults
  in place (wrong-account courier posting, many-to-one debit-order pair, duplicate payment posting).
- **Phase 9 (Agent 3 — Sales) attempt 1 — FAILED, auto-corrected.** Rate-limited mid-run after building
  all 102 JE-1xxx journal entries as one upfront batch, then inserting invoice/receipt/credit-note
  documents one at a time — got cut off after 16/60 invoices, 0/36 receipts, 0/6 credit notes, 0 stock
  movements. Left 44 "phantom" JEs (real GL revenue/COGS/inventory impact) with no source document and
  no stock movement behind them — would have failed the Phase 16 integrity audit. **Queen caught this
  before any audit/QA wave and purged the entire slice** (all JE-1xxx + all INV-1xxx) — verified back to
  a clean state (71 JEs = JE-0001 + Agent 4's 70; 3 invoices = opening only). No data loss to Agent 2/4's
  confirmed-good work.
- **Phase 9 (Agent 3 — Sales) attempt 2** PASS — relaunched with atomic per-document build order,
  independently re-verified by Queen (not just the agent's self-report): 62 invoices (65 incl. opening),
  34 receipts, 6 credit notes, 98 balanced `JE-1xxx` entries, 507 lines, 179 stock movements. **0**
  unbalanced entries, **0** orphaned JEs either direction (invoice/receipt/credit_note ↔ JE), **0**
  negative stock, **0** duplicate document/entry numbers, **0** lines missing company_id. Invoice status
  mix: draft 4, sent 12, partially_paid 10, paid 29, overdue 7. August sales R551,401.00 subtotal /
  R82,710.17 VAT output. AR variance of R1,750 explained (two receipts carry unallocated "money on
  account" per spec §3.4's model) — not an error.
- **Company-wide check (Queen, after Wave 3)**: `Σdebit == Σcredit` across ALL 169 journal entries
  (JE-0001 + 70 Agent-4 + 98 Agent-3) = **R4,838,524.59 == R4,838,524.59, diff R0.00.**
- **Phase 13/14/15 (Agent 5 — Banking/Reconciliation)** IN PROGRESS.
- **Phase 16/17/18 (Agent 6 — Integrity)** + **Phase 19 (Agent 7 — QA/tests)** BLOCKED on Agent 5.

- **Wave 4 (Agent 5 — Banking/Reconciliation)** PASS — independently re-verified by Queen: 1 bank
  account (GL 1000, current_balance R212,270.67 == live GL 1000 balance exactly), 94 bank_transactions
  (81 reconciled / 13 unreconciled, 0 orphan refs, 0 duplicate rows), 1 new balanced JE-3001, 11
  reconciliation_issues rows. All 14 deliberate scenarios spot-checked directly against raw data and
  confirmed exact: R95.00+R310.40=R405.40 pair, R42.00+R118.50+R64.75=R225.25 triple, R25,000
  one-to-many, R3,000 many-to-one, R185.50/R62.10/R47.66-mismatch/wrong-sign(R1,834.30)/outstanding
  deposit+payment all present with correct dates/status. Company-wide diff still R0.00 after the change.
  `docs/OFFICE_NATIONAL_RECON_EXPECTATIONS.md` written (248 lines).
- **Wave 5 (Agent 6 — Integrity Audit)** PASS — independently re-verified by Queen. Built
  `AccountingIntegrityAuditService` (19 tests). Live 18-point Phase 16 audit: all PASS; the two
  apparent AR (−R4,760.90) / AP (+R363,400.00) variances both reconcile to R0.00 once documented
  items applied. One WARNING: inventory GL vs valuation drift R668.70 (0.04%, perpetual-inventory
  rounding). Flagged (not a data defect): `reconcileAccountsReceivable()` never nets credit notes —
  pre-existing shared-code limitation.
- **Wave 5 (Agent 7 — QA/regression)** — rate-limited mid-run; **Queen finished it directly.**
  Agent 7 had built all 3 fixture/test files (`officeNationalReconciliationScenario.ts` + `.test.ts`
  12 tests, `officeNationalSubledgerScenario.ts`) before hitting the limit. Queen wrote the missing
  `officeNationalSubledgerScenario.test.ts` (5 tests, runs the real subledger-reconciliation fns over
  the real live rows), the Track-2 evidence doc `docs/OFFICE_NATIONAL_REGRESSION_EVIDENCE.md` (33
  items), and ran the full gate: type-check ✅ / lint ✅ / **1105 tests / 158 files** ✅ / build ✅.
- **Wave 6 (Queen — final report + audit)** PASS — full financial picture computed from live data,
  balance sheet balances exactly (Assets R2,622,947.52 == Liab R677,253.66 + Equity R1,945,693.86),
  75-point report delivered.

## Overall status: **Phase 1–20 PASS (dataset approved as testing baseline). Phase 21 (post-audit corrections) IN PROGRESS. NOTHING committed or pushed.**

---

# Phase 21 — Post-Audit Accounting Corrections

User approved the dataset as the new testing baseline (2026-08-28) but requires the report's
"limitations" resolved as real fixes, not accepted. Each item tracked independently.

## 21.1 — Inventory R668.70 difference — trace to zero

| Step | Status | Notes |
|---|---|---|
| Trace every cent of the R668.70 | **PASS** | GL 1200 = 1,487,450.00 opening + 421,953.70 GRN + 300.00 return CN − 340,322.00 invoice COGS = **1,569,381.70**. Valuation (Σ qoh × cost_price) = **1,568,713.00**. Δ **R668.70** = **exactly** `Σ (GRN line quantity × (purchase unitPrice − product.cost_price))` across the 40 of 45 restocked products whose Agent-4 seed purchase price was ±5% off standing cost. Verified by SQL: `total_grn_price_drift = 668.70`. |
| Classify root cause | **PASS** | **Demo-data construction artifact, NOT an application defect.** The app's `InventoryPostingAdapter.recordReceiptMovement()` (src/features/inventory/services/inventoryPostingAdapter.ts:205-207) *does* recompute weighted-average `costPrice` on every receipt: `newAvgCost = (existingQty·existingAvgCost + receivedQty·unitCost) / newQty`. Agent 4's raw SQL seed recorded `goods_received` movements + the GL debit at the real purchase price but never ran that WAC recompute, so `cost_price` stayed frozen at its opening value while GL 1200 absorbed the real (higher/lower) purchase costs. A real GRN through `billService.postBill()` would not drift. |
| Fix | **PASS (Agent 10, verified by Queen)** | Full perpetual weighted-average restatement, computed in SQL via a recursive CTE over each product's reconstructed chronological movement timeline (opening → GRN receipts → sales → 2 returns, interleaved by date, receipts-before-sales on same-date ties). 58 invoice JEs (JE-1001…JE-1058) COGS DR + Inventory CR lines re-posted at running WAC; 2 return CN JEs (JE-1093, JE-1097) re-posted; all 48 stocked `products.cost_price` set to final running WAC. Bill/GRN DR lines and opening JE-0001 **untouched**. |
| Rounding adjustment | **JE-4100 (revised P1.2)** | Migration 0020 widened `products.cost_price` to `numeric(14,4)`; Agent 15 re-restated at 4dp WAC. Old JE-4100 (R5.54) deleted, fresh **JE-4100: DR 5000 R0.07 / CR 1200 R0.07**. GL 1200 now **R1,569,743.20** = valuation exact. |
| Target: inventory valuation difference = R0.00 | **PASS** | After the P1.2 4dp re-restatement: **GL 1200 = round(Σ(qoh × cost_price), 2) = R1,569,743.20, difference R0.00** (was R668.70 apart at the start of Phase 21). Verified by Queen. |
| Side effects (all verified, post-P1.2) | PASS | Global Σdr−Σcr **R0.00**, 0 unbalanced JEs, TB balanced (R4,838,209.61 each side), qoh unchanged (10,169.000), GL 1100 R207,794.04 + GL 1000 R212,270.67 unchanged, 81/13 bank txns + 11 recon issues + outstanding-deposit scenario all intact. |
| P&L impact (final, post-P1.2) | PASS | Cost of Sales R340,022.00 → **R339,660.50**. Gross profit R208,760.82 → **R209,122.32**. Net profit R103,243.86 → **R103,605.36**. Revenue + other expenses unchanged. |
| Regression tests | NOT STARTED | Deferred — the live data is proven correct by the audit; a perpetual-WAC helper + test can be added in a later build pass if wanted. |

## 21.2 — AR reconciliation must net credit notes + receipts

| Step | Status | Notes |
|---|---|---|
| Root cause | **PASS** | `src/features/accounting/services/subledgerReconciliation.ts` — `reconcileAccountsReceivable(journalEntryService, accounts, invoices)` computes `subledgerTotal` from `invoicesToOpenItems(invoices)` **only** (`total − amountPaid` per open invoice). It never sees credit notes or receipts, so: (a) issued credit notes (which post DR Revenue/VAT, CR AR — reducing the GL control) appear as an unexplained −R3,010.90; (b) unallocated "money on account" receipts (which post CR AR for the full amount) appear as −R1,750.00. Called from 4 sites: `useSubledgerReconciliation`, `accountingIntegrityAuditService`, `useComplianceDashboard`, `runBooksIntegrityCheck`. |
| Fix the general domain logic (not Office-National-specific) | NOT STARTED | Extend the signature/inputs to also take `creditNotes` + `customerReceipts` (types already exist). subledger = Σ open-invoice outstanding − Σ open credit-note balance (`total − amountAllocated`) − Σ receipt `unallocatedAmount`. Result carries an explicit bridge for money-on-account. Update all 4 call sites + their tests. `reconcileAccountsPayable` gets the mirror treatment (supplier credit notes / unallocated payments) for symmetry. |
| Regression tests (8 scenarios from brief) | NOT STARTED | invoice-only · fully paid · partially paid · credit note · partially credited · receipt + credit note · unallocated receipt · multi-invoice allocation |
| Office National: AR GL vs subledger with explicit bridge | NOT STARTED | Target residual R0.00 |

## 21.3 — Account-mapping consistency (granular per category)

| Step | Status | Notes |
|---|---|---|
| Inspect current architecture | **PASS** | `AccountMappingService` = fixed semantic-key → account-**code** map (one `SALES_REVENUE`→'4000', one `COGS`→'5000', one `INVENTORY`→'1200'). `invoiceService.postInvoice()` posts **one** revenue line for the whole `subtotal` and **one** COGS line for total COGS — no per-line/per-category split. `Product.category` is a **free-text string** (src/types/product.ts:44), no category entity, no per-category account config anywhere. So a UI-entered furniture sale posts to 4000/5000, while the seed used 4010/5010. |
| Schema assessment | **PASS — schema change was required and approved** | Current schema could not map category→accounts. User approved the new `category_account_mappings` table (zero changes to `products`, joins on existing `products.category` text). Alternatives declined. |
| Apply | **PASS (Agent 8)** | Migration `0019_category_account_mappings` (version `20260828103349`) applied live + verified. Table + RLS (`category_account_mappings_all_own_company`, mirrors `fixed_assets`) + FK indexes. `get_advisors`: no new security/perf findings beyond the project-wide accepted `auth_allow_anonymous_sign_ins`. DDL mirrored to `docs/db-changes/0019_category_account_mappings.sql` (repo does not vendor migration files — kept as documentation, not under a `supabase/` pipeline). 5 ON mapping rows seeded (Furniture→4010/5010, Printers & Equipment + Peripherals→4020/5020, Stationery→4030/5030, Consumables→4040/5040, all inventory→1200; `Delivery & Service` unmapped→generic). |
| Code: per-line account resolution | **PASS (Agent 8)** | `CategoryAccountMappingService` (+ repo iface / Supabase / Mock) + `journalAccountSplit.ts` helper. `invoiceService.postInvoice` / `creditNoteService.issueCreditNote` / `billService.postBill` (inventory branch) now resolve revenue/COGS/inventory accounts **per line** via product→category→mapping, split the journal into one CR/DR line per resolved account, cent-exact balancing (residual to largest bucket). Generic `SALES_REVENUE`/`COGS`/`INVENTORY` fallback for no-product / no-category / unmapped lines — **never throws**. Adapter gained read-only `getProductCategory()`; costing interface unchanged. |
| Regression tests | **PASS (Agent 8)** | +13 tests (CategoryAccountMappingService 6, invoice +3, creditNote +2, bill +2). Gate: type-check ✅ / lint ✅ / **1118 tests / 159 files** (from 1105/158) ✅ / build ✅. Queen re-verified: migration live, 5 rows correct, full gate green. |

### 21.2 — **PASS** (Agent 9, verified by Queen)
- **Root cause:** `reconcileAccountsReceivable(js, accounts, invoices)` built its subledger from open invoices
  only — never saw credit notes or receipts.
- **Fix (general domain logic):** `SubledgerReconciliation` now has `subledgerTotal` (redefined =
  GL-consistent), `agingSubledgerTotal`, and `bridge {unallocatedReceipts, creditNoteImpact, other}`.
  `reconcileAccountsReceivable(js, accounts, invoices, creditNotes, customerReceipts)` — GL-consistent =
  `Σ posted-invoice.total − Σ receipt.amount − Σ issued-CN.total`. `reconcileAccountsPayable(..., payments,
  nonBillApAdjustments=0)` — mirror, `+nonBillApAdjustments` for non-bill AP (asset finance). All 4 call
  sites updated (`useSubledgerReconciliation`, `accountingIntegrityAuditService`, `useComplianceDashboard`,
  `runBooksIntegrityCheck` + `useBooksIntegrity`).
- **8 scenario regression tests** (`subledgerReconciliation.creditNotes.test.ts`) + updated existing tests
  + `officeNationalSubledgerScenario.test.ts` rewritten for the correct behaviour.
- **Part-D seed correction (live):** the 6 credit notes had `amount_allocated=total` but the credited
  invoices' `amount_paid` was never bumped (the app's `allocateToInvoice()` does this via
  `recordPayment()`). Corrected: INV-1008 +433.49→2728.78, INV-1044/1051/1061 sent→partially_paid.
  CN-1002 (R141.51) & CN-1005 (R132.25) were allocated to already-fully-paid invoices — impossible, so
  those allocations were undone (`amount_allocated=0, status='issued'`); the credits stay as customer
  credit balances in `bridge.creditNoteImpact`. **No journal entry / GL amount / `total` touched.**
- **Final:** AR GL R207,794.04 == GL-consistent subledger R207,794.04, variance R0.00. Aging R209,817.80
  bridges via unallocated receipts R1,750.00 + un-absorbable credit R273.76 + other R0.00. AP GL
  R590,511.21 == `Σ posted-bill R585,641.77 − Σ payment R358,530.56 + R363,400.00` (R368,000 vehicle −
  R4,600 duplicate fault), variance R0.00.
- **Gate:** type-check ✅ / lint ✅ / **1127 tests / 160 files** (from 1118/159) ✅ / build ✅.
- **Contamination found & fixed** (Agent 9 flagged, Queen resolved): `JE-0171` — a Phase 21 subagent
  drove the app's real `bankTransactionService` against live Supabase, posting a duplicate DR Cash /
  CR AR R2,295.29 for REC-1001 and destroying the outstanding-deposit training scenario. Queen deleted
  `JE-0171` + lines, restored the bank_transaction. **Baseline verified restored:** 170 JEs, GL 1100
  R207,794.04, GL 1000 R212,270.67, global diff R0.00, 81/13 bank txns, scenario intact.

## 21.4 — Re-run all control checks after 21.1–21.3

| Check | Status | Target |
|---|---|---|
| Global debit/credit · Trial Balance · AR · AP · Inventory · VAT · Bank GL · Balance Sheet · Income Statement | NOT STARTED | all R0.00 / balanced / documented bridge |

## 21.5 — Preserve the 12 deliberate bank-reconciliation training faults

| Step | Status | Notes |
|---|---|---|
| Snapshot the recon faults before touching anything | NOT STARTED | R0.16 · R185.50 missing charge · R62.10 interest · duplicate · wrong-sign · wrong-account · one-to-many · pair · triple · outstanding deposit · outstanding payment · date/timing |
| Re-verify all 12 intact after 21.1–21.4 | NOT STARTED | Books stay balanced; bank statement still needs reconciling |

## 21.6 — Prove UI/service-entered transactions use the same rules

| Step | Status | Notes |
|---|---|---|
| Service-level integration tests: a September Office National transaction through the real app services | NOT STARTED | furniture sale · printer sale · stationery sale · consumables sale · credit note · stock purchase · customer receipt · supplier payment — assert source doc + journal + lines + VAT + AR/AP + inventory + **granular** revenue/COGS account + bank effect |

## 21.7 — Final Phase 21 report (31 points) | NOT STARTED |
