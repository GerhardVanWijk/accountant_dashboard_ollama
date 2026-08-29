# Office National Demo — Bank Reconciliation Expectations

Known-answer reference for the August 2026 bank reconciliation training month on the
`Office National Business Cheque` account (bank_accounts.id `2fb81a17-92b6-4936-9925-456a73a91cd1`,
GL 1000 Cash and Bank, company `676c6cda-2e67-4ee3-8aaa-249b2c6bbc01`).

Built by Agent 5 (Banking / Reconciliation) for the Office National Demo hive build. Every id below is
a real row in the live database — nothing here is illustrative.

## Headline numbers

| Metric | Value |
|---|---|
| Bank accounts | 1 |
| `bank_transactions` total | 94 |
| — `status='reconciled'` | 81 |
| — `status='unreconciled'` | 13 |
| New journal entries created (Agent 5) | 1 — `JE-3001` (source `bank`) |
| `reconciliation_issues` rows | 12 (all `status='open'`, single regen batch 2026-08-28 17:37) |
| GL 1000 (Cash and Bank) balance, as of now | **R212,270.67** |
| Bank statement-implied balance, dated ≤ 2026-08-31 | **R184,068.54** (= `bank_statements.closing_balance`, includes REC-1007 per the ≤ 31 Aug cut) |
| `bank_accounts.opening_balance` | R350,000.00 |
| `bank_accounts.current_balance` (= true GL 1000 balance) | R212,270.67 |
| Company-wide Σdebit − Σcredit after Agent 5's changes | **R0.00** (confirmed) |

The gap between the GL balance (R212,270.67) and the ≤31-Aug statement-implied balance (R184,068.54 —
now the confirmed August closing balance, which includes the 31-Aug reconciled receipt REC-1007) is
fully explained by the open exceptions below (outstanding payment/deposit not yet on the statement,
bank-only charges/interest not yet booked, the duplicate posting, the wrong-sign line, and the
grouped/combination items) — that is the entire point of the training month. None of it is unexplained
variance; every rand is attributable to one of the 12 documented scenarios.

Enum reference used throughout (`reconciliation_issue_type`): `date_offset_timing | amount_mismatch |
transposition_error | duplicate_transaction | missing_bank_side | missing_ledger_side | grouped_match |
combination_match | wrong_sign | wrong_bank_account | vat_difference | rounding_variance |
opening_balance_discrepancy | edited_after_reconciliation`.

---

## Part J — persistent August bank statement (Agent 16, 2026-08-28, P1.4)

The Office National August 2026 statement is now a first-class row, not just loose `bank_transactions`.

| Field | Value |
|---|---|
| `bank_statements.id` | **`df28d259-dfc2-48fb-929c-be9450a08bd7`** |
| `bank_account_id` | `2fb81a17-92b6-4936-9925-456a73a91cd1` |
| `period_start` / `period_end` | `2026-08-01` / `2026-08-31` |
| `opening_balance` | R350,000.00 |
| `closing_balance` | **R184,068.54** (see arithmetic below) |
| `currency` / `source_format` | ZAR / `manual` |
| `source_filename` / `reference` | `ON-2026-08-statement.csv` / `ON-AUG-2026` |
| `import_status` / `reconciliation_status` | `imported` / `in_progress` |
| `imported_by` | `system (Part J backfill)` |
| `content_hash` | `5854110870a191dcdd183947ecdb2ef9839d7dfb9e84674fe5f75e513f70f62e` |
| `balance_check_ok` | `true` |
| `line_count` | **87** |

**Closing-balance arithmetic** (faithful, decision 2 — one `bank_statement_line` per genuine bank-side
event dated ≤ 2026-08-31, sign = +inflow / −outflow in this codebase's `debit`=inflow convention):

```
opening                                     350,000.00
+ Σ signed(87 August bank-side lines)       −165,931.46
                                            ───────────
closing_balance                             184,068.54
```

`350000 + Σ signed == closing` exactly → `balance_check_ok = true`.

> **Cross-check note (resolved, P2.3 / user decision 2026-08-28).** The August closing balance is
> **R184,068.54** and the headline table now carries that figure. It includes customer receipt
> **REC-1007** (R9,803.32; bank row `4cc33045-ea68-49b8-ae46-8a309c310729`, 2026-08-31,
> `status='reconciled'`; statement line #87) — that row is dated 31 Aug and reconciled, so per the
> P1.4 cut ("Σ of bank-side lines dated ≤ 31 Aug") it belongs on the August statement. The earlier
> R174,265.22 figure used a `< 2026-08-31` (pre-REC-1007) cut and is superseded; the ≤ 31 Aug cut is
> confirmed. `350000 + Σ signed(87 lines) = 184068.54 = closing_balance`, `balance_check_ok = true`.

**Line breakdown:** 87 lines, `sequence` 1–87 ordered by (`txn_date`, `amount`, `bank_transaction_id`).
 - **75 `line_state='matched'`** — one per `status='reconciled'` bank_transaction dated ≤ 31 Aug
   (76 such rows) *except* C6's `539ca37d` — each with `matched_bank_transaction_id` set and the
   matching `bank_transactions.bank_statement_line_id` back-link (bijective, verified 75 ↔ 75).
 - **12 `line_state='unmatched'`**, no link — the 11 `status='unreconciled'` August bank rows
   (C3, C4, C5, C7, C9, C10, C11×2, C12×3) plus C6's single R4,600 line.
 - The 5 `status='reconciled'` rows dated 2026-09-01/04 (REC-1008, REC-1009 ×2, REC-1027 ×2) get **no
   line** — they had not cleared the August statement.
 - `external_ref_id` on every line = the source `bank_transactions.reference`. `raw_source` carries
   `{ backfill:'Part J', bank_transaction_id, reference, txn_date, amount, direction, description,
   source_status }`. `value_date` / `running_balance` are null (a manual statement carries neither).
 - **No `bank_transactions` or journal entries were created.** Only `bank_statement_lines` (new) and
   `bank_transactions.bank_statement_line_id` (the 75 back-links) were written.

**Per-scenario bank-leg statement lines** (`bank_statement_id` `df28d259-…` for all):

| Scenario | source `bank_transactions.id` | `bank_statement_lines.id` | seq | `line_state` |
|---|---|---|---|---|
| C2c EFT date-offset | `75c4fdaf-15a7-4a48-85bf-8ab7fa68899c` | `6dcd9115-8735-4e48-b8a2-6e7dc5135f18` | 74 | `matched` |
| C3 amount mismatch | `edf796c4-87a1-40b2-a3cb-8907f7c5d6f5` | `e32c01c4-8af7-4691-92c1-ff6d512c1085` | 45 | `unmatched` |
| C4 missing ledger side | `046d81c4-0bdf-45f5-a0c0-bc9bc2f74d38` | `fa398b7d-45ad-40b0-8aa9-ca9404df84e9` | 60 | `unmatched` |
| C5 interest received | `5d280d57-2109-4b26-8a24-9c93a65f7a92` | `d7959f10-94ee-4745-81dd-20f8cb3d30d8` | 86 | `unmatched` |
| C6 duplicate posting (1 bank line) | `539ca37d-dea1-43df-b3e7-67ad6e53580f` | `d1b2995f-beb3-436f-883a-81843ef3e431` | 61 | `unmatched` |
| C7 wrong sign | `64f28fa4-740a-4b60-a6c5-fc90ae1636c5` | `3785d3e9-6469-49fa-943e-0576b9e616fc` | 38 | `unmatched` |
| C8 wrong GL account (bank side clean) | `71d62d53-f20f-4d16-88e9-f981fbb64b68` | `4efebc80-5e82-4779-8717-2445655d16be` | 35 | `matched` |
| C9 grouped deposit R25,000 | `893af4b5-bf60-4f90-9f0c-50e3d6b483a8` | `b89b5e33-9003-4d6f-b23a-b1dfca20b142` | 48 | `unmatched` |
| C10 debit order R3,000 | `4c2d9bd8-43cf-4d3b-81c6-080a46a0a80d` | `331451bd-c8c1-4015-8e66-1bffdb10afb7` | 51 | `unmatched` |
| C11 pair — card machine rental R95.00 | `e40148ed-0ac7-45de-8109-ebe87a442cf1` | `39227656-d675-4dfb-a2ec-4b824c21c5d2` | 15 | `unmatched` |
| C11 pair — SMS notification R310.40 | `b22fb879-b299-4ee2-bea3-ae4953797f2e` | `a2fb9c3f-ead5-450d-8b40-4fa3659386d1` | 18 | `unmatched` |
| C12 triple — electronic statement R42.00 | `90c710d7-4427-4e90-8b1d-374581c6b3f6` | `00ce20a9-a50b-483a-abf1-aa7df988c47e` | 19 | `unmatched` |
| C12 triple — ATM withdrawal R118.50 | `127e139a-c05f-42e4-8de0-06e7458af499` | `26ad26e2-d579-430b-bc77-d36d6e8cf8fe` | 24 | `unmatched` |
| C12 triple — faster payment R64.75 | `7820bfcc-9135-4c0a-8992-e732691e1565` | `1bfb9fc7-3c74-4517-8a13-292aa51651ff` | 29 | `unmatched` |

C2a / C2b (outstanding payment PAY-2004, outstanding deposit REC-1001) have **no August statement
line** — their bank rows are dated 2026-09-01, i.e. not yet on this statement (that is the scenario).

---

## C1 — Clean matches (≥25 required)

**81 `bank_transactions` rows carry `status='reconciled'`.** These fall into three groups, all
representing real, correctly-matched cash movements with `source='manual'`:

1. **Plain 1:1 matches** — one bank row per book cash-affecting journal line (customer receipts,
   supplier payments, direct bank-paid expenses, fixed-asset purchases), same date, same amount,
   `journal_entry_id` set to the real entry. This is the bulk of the 81.
2. **Split/tranche matches (16 book entries → 32 bank rows)** — 16 of the larger cash movements
   (e.g. `REC-1015`/JE-1073 R17,654.54, `PAY-2014`/JE-2055 R43,700.00, `REC-1011`/JE-1069 R65,574.86)
   were deliberately banked as two tranches each (realistic for large EFT/card settlement batches).
   Both tranches share the same `journal_entry_id` and date; the two amounts sum exactly to the book
   line (verified by SQL — zero rows with a non-zero difference). Expected investigator result:
   still a clean match per tranche (or a trivial grouped_match if the matcher requires 1:1) — **not**
   a discrepancy.
3. **The two "matches with a story" (see C6 and C8 below)** — the real leg of the duplicate posting
   (JE-2063 / bank row `539ca37d-dea1-43df-b3e7-67ad6e53580f`) and the wrong-GL-account courier
   payment (JE-2041 / bank row `71d62d53-f20f-4d16-88e9-f981fbb64b68`) are both perfectly clean,
   `reconciled` bank matches — the fault in each case lies elsewhere (in the books), not in the
   bank-vs-statement comparison. See C6/C8.

Expected Difference-Investigator result for all 81: no finding (clean match) — except JE-2064's absence
(C6) and JE-2041's GL code (C8), which are findings of a different system entirely.

Part J: of the 81 reconciled rows, 76 are dated ≤ 2026-08-31 and appear on the August statement — 75
as `line_state='matched'` + bijective `bank_statements.df28d259` / `bank_transactions.bank_statement_line_id`
link, the one exception being C6's `539ca37d` (`unmatched`, see C6). The other 5 reconciled rows
(REC-1008, REC-1009 ×2 tranches, REC-1027 ×2 tranches) are dated 2026-09-01/04 and have no August line.

---

## C2 — Timing differences (3 scenarios)

### C2a. Outstanding payment
- Book: `PAY-2004` / `JE-2045` (id `d5de1a6c-3e42-4506-a41c-a881cbcfe9e9`), R46,041.29, dated 2026-08-28.
- Bank: row id `4acd5c92-f515-4beb-94ae-57fb8223d7a0`, dated **2026-09-01**, `direction=credit`,
  `status='unreconciled'`.
- `reconciliation_issues` row `7967de9c-a7e5-4d33-8bc0-e046521ee64c` (regen 2026-08-28 17:37), type
  `missing_bank_side`, `confidence=45`, `effect_amount=-46041.29`, `severity=low`,
  `auto_resolution_safe=true`. `suggested_resolution` = "No action needed yet — a normal outstanding
  item. Revisit if it is still unmatched next period." This is materialised as an issue row but scored
  as a pure whole-period timing item (see PART O and the cross-reference note).
- Expected: at a 31-Aug statement date this is a genuine outstanding payment (cheque/EFT in transit) —
  present in the books, not yet cleared on the bank. Auto-resolves once the September statement is
  processed (the bank row already exists, dated 1 Sept).
- Part J: **no** `bank_statement_lines` row — the bank row is dated 2026-09-01, outside this
  statement's period (that is the scenario).

### C2b. Outstanding deposit
- Book: `REC-1001` / `JE-1059` (id `d3b5fd25-5cd6-45c0-9533-f9d081beb5e3`), R2,295.29, dated
  **2026-08-06** (the real `journal_entries.date`; an earlier draft of this doc said 2026-08-30).
- Bank: row id `7f9d173c-b1ab-4d1c-99a7-a375f5f411a2`, dated **2026-09-01**, `direction=debit`,
  `status='unreconciled'`.
- `reconciliation_issues` row `52685f9d-2549-40f0-bdb2-7a4c57c3ee03` (regen 2026-08-28 17:37), type
  `missing_bank_side`, `confidence=70`, `effect_amount=2295.29`, `severity=medium`,
  `auto_resolution_safe=false`. Evidence: `ageDays=25`, `no_bank_counterpart` met, `aged_past_stale`
  met, `orphaned_journal` met (posted straight to the bank GL with no BankTransaction behind it),
  `recorded_in_books` NOT met.
- Expected: outstanding deposit at month-end — same logic as C2a, mirror image.
- Part J: **no** `bank_statement_lines` row — bank row dated 2026-09-01, outside the statement period.

### C2c. EFT date-offset (still a match)
- Book: `PAY-2007` / `JE-2048` (id `c218514e-48dd-41a0-89d7-89656240f02c`), R10,157.95, dated
  2026-08-25.
- Bank: row (amount 10157.95, `direction=credit`), dated **2026-08-27** (2-day slip), `status='reconciled'`.
- `reconciliation_issues` row `d465698d-416a-41f9-8c6b-94048cbce88f` (regen 2026-08-28 17:37), type
  `date_offset_timing`, `confidence=85`, `effect_amount=0`, `severity=info`,
  `auto_resolution_safe=true`. `suggested_resolution` = "Mark as a valid timing difference."
- Expected Difference-Investigator result: `date_offset_timing` — same amount, small date gap,
  should still auto-match. Deliberately marked `reconciled` here since it IS explainable.
- Part J: `bank_statement_lines.id` `6dcd9115-8735-4e48-b8a2-6e7dc5135f18` (statement
  `df28d259-dfc2-48fb-929c-be9450a08bd7`, seq 74), `line_state='matched'`,
  `matched_bank_transaction_id` = `75c4fdaf-15a7-4a48-85bf-8ab7fa68899c`.

---

## C3 — R0.16 amount mismatch

- Book: new entry `JE-3001` (id `8ce56752-c15f-4baf-85c7-4b33b3c9cc74`), date 2026-08-19, source
  `bank`: DR 5140 Bank Charges 47.50 / CR 1000 Cash and Bank 47.50. Balances exactly (verified: debit
  47.50 = credit 47.50).
- Bank: row id `edf796c4-87a1-40b2-a3cb-8907f7c5d6f5`, same date, `direction=credit`, `amount=47.66`,
  `status='unreconciled'`, `journal_entry_id`=JE-3001's id, category "Bank Charges".
- Δ = R0.16.
- `reconciliation_issues` row `4e33309f-1649-4503-917e-25125c5e619a` (regen 2026-08-28 17:37), type
  `amount_mismatch`, `confidence=60`, `effect_amount=-0.16`, `severity=medium`. Evidence:
  `amountDifferenceCents=-16`, `dateDifferenceDays=0`, `sameCounterparty=true`, `sameDirection=true`,
  `referenceSimilarity=1`, `candidateSourceType=journal_entry`, `varianceExplainedCents=16`,
  `explainsVarianceExactly=false` (the R0.16 is only a slice of the whole reconciliation variance).
- Expected Difference-Investigator result: `amount_mismatch`.
- Part J: `bank_statement_lines.id` `e32c01c4-8af7-4691-92c1-ff6d512c1085` (seq 45), amount R47.66,
  `line_state='unmatched'` (books R47.50 ≠ bank R47.66 → no clean 1:1 match), no
  `matched_bank_transaction_id`.

---

## C4 — Missing bank charge R185.50 (bank-only)

- Bank: row id `046d81c4-0bdf-45f5-a0c0-bc9bc2f74d38`, date 2026-08-22, `direction=credit`,
  `amount=185.50`, description "Cash handling fee", `source='import'`, `journal_entry_id=null`,
  `status='unreconciled'`, category "Bank Charges".
- No book entry exists for this yet.
- `reconciliation_issues` row `81e241d2-8487-4366-8130-fc09ad54485b` (regen 2026-08-28 17:37), type
  `missing_ledger_side`, `confidence=75`, `effect_amount=-185.50`, `severity=high`. Evidence:
  `ageDays=9`, `isStale=true`, `no_ledger_counterpart` met, `aged_past_stale` met,
  `bank_initiated_shape` met, `candidateSourceType=statement_line`, `varianceExplainedCents=18550`.
- Expected Difference-Investigator result: `missing_ledger_side` (the bank has it, the ledger doesn't).
- Part J: `bank_statement_lines.id` `fa398b7d-45ad-40b0-8aa9-ca9404df84e9` (seq 60),
  `line_state='unmatched'` (bank-only, no ledger counterpart), no `matched_bank_transaction_id`.

---

## C5 — Interest received R62.10 (bank-only)

- Bank: row id `5d280d57-2109-4b26-8a24-9c93a65f7a92`, date 2026-08-29, `direction=debit`,
  `amount=62.10`, description "Interest Received", `source='import'`, `journal_entry_id=null`,
  `status='unreconciled'`, category "Interest Income".
- No book entry exists for this yet.
- `reconciliation_issues` row `d5f125f2-13ed-4565-a8db-53a75d8447f9` (regen 2026-08-28 17:37), type
  `missing_ledger_side`, `confidence=45`, `effect_amount=62.10`, `severity=medium`. Evidence:
  `ageDays=2`, `isStale=false`, `no_ledger_counterpart` met, `aged_past_stale` NOT met (only 2 days
  old at the statement date), `bank_initiated_shape` met, `candidateSourceType=statement_line`,
  `varianceExplainedCents=6210`. Lower confidence than C4 purely because it is not yet stale.
- Expected Difference-Investigator result: `missing_ledger_side`.
- Part J: `bank_statement_lines.id` `d7959f10-94ee-4745-81dd-20f8cb3d30d8` (seq 86),
  `line_state='unmatched'` (bank-only), no `matched_bank_transaction_id`.

---

## C6 — Duplicate posting

- The real cash event: `PAY-2220`, R4,600.00, 2026-08-22, supplier payment.
- Books contain it **twice**: `JE-2063` (id `283cca35-9321-4b61-9502-8fe2ef431d71`, the real one) and
  `JE-2064` (id `58666e95-7939-4f64-a23d-1767cb90c987`, memo explicitly flags
  "recon: DUPLICATE of PAY-2220 - books contain this twice, bank once" — built by Agent 4).
- Bank shows it **once**: row id `539ca37d-dea1-43df-b3e7-67ad6e53580f`, `direction=credit`,
  `amount=4600.00`, date 2026-08-22, `status='reconciled'`, `journal_entry_id`=JE-2063 (the real leg).
  No second bank row was created for JE-2064 — deliberately, since the bank only shows the movement
  once.
- `reconciliation_issues` row `345ae7dc-6098-4e9f-acde-7655576428a6` (regen 2026-08-28 17:37), type
  `duplicate_transaction`, `confidence=75`, `effect_amount=4600.00`, `severity=medium`,
  `related_journal_entry_ids` = [JE-2063, JE-2064] (id `283cca35-…`, `58666e95-…`),
  `related_bank_transaction_ids` = []. Evidence: `identical_amount` met (35), `date_proximity` met
  (`0 days`, 25), `reference_match` NOT met (0/25), `description_overlap` met (15) →
  `referenceSimilarity=1` on description, `amountDifferenceCents=0`, `varianceExplainedCents=460000`.
- Expected Difference-Investigator result: `duplicate_transaction` — 2 book postings vs 1 bank posting
  for the same cash event. Resolution: reverse JE-2064.
- Part J: ONE `bank_statement_lines.id` `d1b2995f-beb3-436f-883a-81843ef3e431` (seq 61), R4,600.00,
  `line_state='unmatched'` — a single bank line against two book entries does not 1:1 match, so it is
  left open for the reconciliation to explain; `bank_transactions.539ca37d.bank_statement_line_id`
  stays null (it is the only `status='reconciled'` August row without a matched statement line).

---

## C7 — Wrong sign

- Book: `REC-1020` / `JE-1078` (id `7537d664-7738-44e7-affb-9be18c9a2b38`), R1,834.30, 2026-08-16,
  a genuine customer receipt (DR 1000 / CR 1100 — cash inflow). The journal entry itself remains
  correctly balanced.
- Bank: row id `64f28fa4-740a-4b60-a6c5-fc90ae1636c5`, same date/amount, but captured with
  `direction=credit` (outflow) — the **opposite** of what actually happened. Description carries
  `recon: WRONG-SIGN test case - REC-1020 posted as outflow`. `status='unreconciled'`,
  `journal_entry_id`=JE-1078.
- `reconciliation_issues` row `7307a2a8-558e-4425-8354-08997ee39856` (regen 2026-08-28 17:37), type
  `wrong_sign`, `confidence=85`, `effect_amount=3668.60` (**double** the R1,834.30 line — the swing to
  correct a sign flip is 2× the amount), `severity=high`. Evidence: `bankAmountCents=-183430`,
  `booksAmountCents=183430`, `sameDirection=false`, `sameCounterparty=true`, `dateDifferenceDays=0`,
  `swingCents=366860`, `amountDifferenceCents=-366860`, `varianceExplainedCents=366860`; factors
  `identical_magnitude_opposite_direction` (40/40), `date_proximity` `0 days` (30/30),
  `reversal_shape` (15/15) — all 3 met.
- Expected Difference-Investigator result: `wrong_sign`.
- Part J: `bank_statement_lines.id` `3785d3e9-6469-49fa-943e-0576b9e616fc` (seq 38), R1,834.30,
  `line_state='unmatched'`. The line is a faithful mirror of the bank_transaction as captured
  (`direction='credit'` / outflow — the deliberate error); books say inflow → `wrong_sign`. No
  `matched_bank_transaction_id`.

---

## C8 — Wrong account (GL-level; NOT a bank-matcher finding)

- Book: `JE-2041` (id `3a3a6721-683d-4274-b9ce-e6c39f80c658`), 2026-08-14, R2,760.00 gross courier
  payment to RapidCourier Logistics, misposted to 5180 Advertising & Marketing instead of 5160 Fuel &
  Delivery Expense (built by Agent 4; memo flags "recon: WRONG-ACCOUNT - courier posted to 5180,
  should be 5160").
- Bank: row id `71d62d53-f20f-4d16-88e9-f981fbb64b68`, same date, same amount, `direction=credit`,
  `status='reconciled'`, `journal_entry_id`=JE-2041. **The bank side is entirely correct** — the cash
  left the account for R2,760.00 on 2026-08-14 and the statement shows exactly that.
- **No `reconciliation_issues` row was created for this scenario, deliberately.** The fault is a GL
  expense-account misclassification, not a bank-vs-statement discrepancy — amount, date and direction
  all agree perfectly between books and bank. None of the 14 `reconciliation_issue_type` values fit
  this cleanly: `wrong_bank_account` specifically means the cash moved through/into the *wrong bank
  account entirely* (a different account_number), not the wrong GL expense code on a correctly-banked
  transaction. This should surface only through the **Books Integrity / GL audit** (Agent 6's
  Phase 16 checks — e.g. an expense-account-pattern or vendor-category consistency check), not through
  the bank reconciliation engine. A bank matcher run against this data will (correctly) report it as a
  clean match; only a GL-level audit that understands "courier spend belongs in 5160" will catch it.
- Part J: `bank_statement_lines.id` `4efebc80-5e82-4779-8717-2445655d16be` (seq 35), R2,760.00,
  `line_state='matched'`, `matched_bank_transaction_id` = `71d62d53-f20f-4d16-88e9-f981fbb64b68` — the
  bank side is clean, so it matches like any other reconciled line; the GL-code fault is not a
  statement-line concern.

---

## C9 — One-to-many (grouped deposit, R25,000.00)

- Book: `REC-1201` (R12,000.00, id `0b567a16-3771-49b1-8807-769f3b1331a8`), `REC-1202` (R8,000.00, id
  `54e9f48e-fdde-4029-8a72-8e2bcfacb33c`), `REC-1203` (R5,000.00, id
  `fbfa57aa-cafb-4f9b-af35-541a7d876742`), all dated 2026-08-18, all posted individually (own
  journal entries, own AR postings). Sum = exactly R25,000.00.
- Bank: ONE row, id `893af4b5-bf60-4f90-9f0c-50e3d6b483a8`, date **2026-08-19** (next-day banking of a
  cash-up), `direction=debit`, `amount=25000.00`, `status='unreconciled'`, `journal_entry_id=null`,
  description "Cash/EFT deposit batch", category "Customer Receipt".
- `reconciliation_issues` row `b4f2fe59-5eb5-4e99-8c41-54b995911df1` (regen 2026-08-28 17:37), type
  `grouped_match`, `confidence=85`, `effect_amount=0`, `severity=info`, `auto_resolution_safe=true`,
  `related_journal_entry_ids` = all three receipt entries, `related_bank_transaction_ids` =
  [`893af4b5-…`]. Evidence: `groupPartCount=3`, `groupSingleCents=2500000`,
  `combinationTotalCents=2500000`, `amountDifferenceCents=0`, `dateDifferenceDays=1`,
  `combinationTerms` = REC-1201 R12,000.00 + REC-1202 R8,000.00 + REC-1203 R5,000.00; factors
  `group_sums_exactly` (45/45), `tight_date_cluster` `1 days` (25/25), `same_direction` (15/15).
- Expected Difference-Investigator result: `grouped_match` — one bank line, three book entries, exact
  sum.
- Part J: `bank_statement_lines.id` `b89b5e33-9003-4d6f-b23a-b1dfca20b142` (seq 48), R25,000.00
  `direction='debit'`, `line_state='unmatched'` (one bank line vs three book entries — no 1:1 match),
  no `matched_bank_transaction_id`.

---

## C10 — Many-to-one (debit order, R3,000.00)

- Book: `PAY-2210` (R1,300.00, id `6e8ca3af-0ba6-49a9-98af-9a398421c10b`) + `PAY-2211` (R1,700.00, id
  `edeac12d-0939-4897-b9aa-63fb8ade6e51`), both dated 2026-08-20, sum = R3,000.00.
- Bank: ONE row, id `4c2d9bd8-43cf-4d3b-81c6-080a46a0a80d`, date 2026-08-20, `direction=credit`,
  `amount=3000.00`, `status='unreconciled'`, `journal_entry_id=null`, description "Debit order -
  supplier consolidated", category "Supplier Payment".
- `reconciliation_issues` row `092a365d-d283-450a-a0c9-b21dd9b7391e` (regen 2026-08-28 17:37), type
  `grouped_match`, `confidence=85`, `effect_amount=0`, `severity=info`, `auto_resolution_safe=true`,
  `related_journal_entry_ids` = [PAY-2210 `6e8ca3af-…`, PAY-2211 `edeac12d-…`],
  `related_bank_transaction_ids` = [`4c2d9bd8-…`]. Evidence: `groupPartCount=2`,
  `groupSingleCents=-300000`, `combinationTotalCents=-300000`, `amountDifferenceCents=0`,
  `dateDifferenceDays=0`, `combinationTerms` = PAY-2210 −R1,300.00 + PAY-2211 −R1,700.00; factors
  `group_sums_exactly` (45/45), `tight_date_cluster` `0 days` (25/25), `same_direction` (15/15).
- Expected Difference-Investigator result: `grouped_match` (books side many, bank side one).
- Part J: `bank_statement_lines.id` `331451bd-c8c1-4015-8e66-1bffdb10afb7` (seq 51), R3,000.00,
  `line_state='unmatched'` (one bank line vs two book entries), no `matched_bank_transaction_id`.

---

## C11 — Pair combination (R405.40)

- Two NEW bank-only unreconciled lines, no book entry:
  - id `e40148ed-0ac7-45de-8109-ebe87a442cf1`, "Card machine rental fee", 2026-08-08, `direction=credit`,
    R95.00.
  - id `b22fb879-b299-4ee2-bea3-ae4953797f2e`, "SMS notification fee", 2026-08-09, `direction=credit`,
    R310.40.
- Sum verified: 95.00 + 310.40 = **405.40** exactly. This pair is the exact and only explanation for
  a R405.40 variance slice.
- `reconciliation_issues` row `b7ae82b6-f3d6-49b0-afff-6436e248ecc7` (regen 2026-08-28 17:37), type
  `combination_match`, `confidence=80`, `effect_amount=-405.40`, `severity=high`. Evidence:
  `combinationTotalCents=-40540`, `varianceExplainedCents=40540`, `explainsVarianceExactly=true`,
  `combinationTerms` = Card machine rental fee −R95.00 (2026-08-08) + SMS notification fee −R310.40
  (2026-08-09); factors `sums_to_variance_exactly` (35/35), `all_otherwise_unexplained` (30/30),
  `two_item` (15/15), `single_item`/`three_item` NOT met.
- Expected Difference-Investigator result: `combination_match`.
- Part J: two `bank_statement_lines`, both `line_state='unmatched'` (bank-only), no
  `matched_bank_transaction_id`:
  - R95.00 → `39227656-d675-4dfb-a2ec-4b824c21c5d2` (seq 15)
  - R310.40 → `a2fb9c3f-ead5-450d-8b40-4fa3659386d1` (seq 18)

---

## C12 — Triple combination (R225.25)

- Three NEW bank-only unreconciled lines, no book entry:
  - id `90c710d7-4427-4e90-8b1d-374581c6b3f6`, "Electronic statement fee", 2026-08-11, `direction=credit`,
    R42.00.
  - id `127e139a-c05f-42e4-8de0-06e7458af499`, "ATM withdrawal fee", 2026-08-12, `direction=credit`,
    R118.50.
  - id `7820bfcc-9135-4c0a-8992-e732691e1565`, "Faster payment fee", 2026-08-13, `direction=credit`,
    R64.75.
- Sum verified: 42.00 + 118.50 + 64.75 = **225.25** exactly.
- `reconciliation_issues` row `cd9c135b-e9a0-4b26-8095-8f8e4a18d8a7` (regen 2026-08-28 17:37), type
  `combination_match`, `confidence=70`, `effect_amount=-225.25`, `severity=high`. Evidence:
  `combinationTotalCents=-22525`, `varianceExplainedCents=22525`, `explainsVarianceExactly=true`,
  `combinationTerms` = Electronic statement fee −R42.00 (2026-08-11) + ATM withdrawal fee −R118.50
  (2026-08-12) + Faster payment fee −R64.75 (2026-08-13); factors `sums_to_variance_exactly` (35/35),
  `all_otherwise_unexplained` (30/30), `three_item` (5/5), `single_item`/`two_item` NOT met. Lower
  confidence than the C11 pair because a 3-item combination scores fewer shape points (5 vs 15).
- Expected Difference-Investigator result: `combination_match`.
- Part J: three `bank_statement_lines`, all `line_state='unmatched'` (bank-only), no
  `matched_bank_transaction_id`:
  - R42.00 → `00ce20a9-a50b-483a-abf1-aa7df988c47e` (seq 19)
  - R118.50 → `26ad26e2-d579-430b-bc77-d36d6e8cf8fe` (seq 24)
  - R64.75 → `1bfb9fc7-3c74-4517-8a13-292aa51651ff` (seq 29)

---

## Issue cross-reference — regenerated `reconciliation_issues` (P2.3, batch 2026-08-28 17:37:38 UTC)

All 12 rows are `company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01'`, `status='open'`,
`statement_date='2026-08-31'`, `detectorVersion='2026.08'`, single batch, every row with a non-empty
`evidence_data` scorecard and a `dedupe_key`. `related_source_document_ids` is `[]` on every row.
Statement id is `df28d259-dfc2-48fb-929c-be9450a08bd7` throughout.

**Type tally:** `wrong_sign` 1 · `amount_mismatch` 1 · `date_offset_timing` 1 · `missing_ledger_side`
2 · `missing_bank_side` 2 · `grouped_match` 2 · `combination_match` 2 · `duplicate_transaction` 1.
There is **no** `reconciliation_issues` row for C8 (wrong GL account) — that is deliberate (see C8 and
PART O). C1 clean matches and the C1 split/tranche matches produce no rows.

| Scenario | issue.id | issue_type | confidence | effect_amount | severity | auto_safe | stmt line(s) (seq, state) | bank_transaction id(s) | journal entry id(s) |
|---|---|---|---|---|---|---|---|---|---|
| C2a outstanding payment (PAY-2004) | `7967de9c-a7e5-4d33-8bc0-e046521ee64c` | `missing_bank_side` | 45 | −46,041.29 | low | **true** | *(none — bank row dated 2026-09-01)* | `4acd5c92-f515-4beb-94ae-57fb8223d7a0` (09-01, unreconciled) | `d5de1a6c-…` (JE-2045) |
| C2b outstanding deposit (REC-1001) | `52685f9d-2549-40f0-bdb2-7a4c57c3ee03` | `missing_bank_side` | 70 | +2,295.29 | medium | false | *(none — bank row dated 2026-09-01)* | `7f9d173c-b1ab-4d1c-99a7-a375f5f411a2` (09-01, unreconciled) | `d3b5fd25-…` (JE-1059, 2026-08-06) |
| C2c EFT date-offset timing | `d465698d-416a-41f9-8c6b-94048cbce88f` | `date_offset_timing` | 85 | 0.00 | info | **true** | `6dcd9115-…` (seq 74, **matched**) | `75c4fdaf-15a7-4a48-85bf-8ab7fa68899c` (reconciled) | `c218514e-…` (JE-2048) |
| C3 R0.16 amount mismatch | `4e33309f-1649-4503-917e-25125c5e619a` | `amount_mismatch` | 60 | −0.16 | medium | false | `e32c01c4-…` (seq 45, unmatched) | `edf796c4-87a1-40b2-a3cb-8907f7c5d6f5` (unreconciled) | `8ce56752-…` (JE-3001) |
| C4 R185.50 cash handling fee | `81e241d2-8487-4366-8130-fc09ad54485b` | `missing_ledger_side` | 75 | −185.50 | high | false | `fa398b7d-…` (seq 60, unmatched) | `046d81c4-0bdf-45f5-a0c0-bc9bc2f74d38` (unreconciled, `source='import'`) | *(none — no book entry)* |
| C5 R62.10 interest received | `d5f125f2-13ed-4565-a8db-53a75d8447f9` | `missing_ledger_side` | 45 | +62.10 | medium | false | `d7959f10-…` (seq 86, unmatched) | `5d280d57-2109-4b26-8a24-9c93a65f7a92` (unreconciled, `source='import'`) | *(none — no book entry)* |
| C6 duplicate posting (PAY-2220) | `345ae7dc-6098-4e9f-acde-7655576428a6` | `duplicate_transaction` | 75 | +4,600.00 | medium | false | `d1b2995f-…` (seq 61, unmatched — one line vs two book entries) | *(row is books-vs-books; bank row `539ca37d-…` is reconciled to the real leg)* | `283cca35-…` (JE-2063, real) + `58666e95-…` (JE-2064, dup) |
| C7 wrong sign (REC-1020) | `7307a2a8-558e-4425-8354-08997ee39856` | `wrong_sign` | 85 | +3,668.60 (2× the R1,834.30 line) | high | false | `3785d3e9-…` (seq 38, unmatched) | `64f28fa4-740a-4b60-a6c5-fc90ae1636c5` (unreconciled) | `7537d664-…` (JE-1078) |
| C8 wrong GL account (courier → 5180) | **— no issue row (deliberate) —** | *(would need a Books-Integrity / GL check)* | — | — | — | — | `4efebc80-…` (seq 35, **matched** → `71d62d53-…`) | `71d62d53-f20f-4d16-88e9-f981fbb64b68` (reconciled — bank side clean) | `3a3a6721-…` (JE-2041) |
| C9 one-to-many deposit R25,000 | `b4f2fe59-5eb5-4e99-8c41-54b995911df1` | `grouped_match` | 85 | 0.00 | info | **true** | `b89b5e33-…` (seq 48, unmatched, `direction='debit'`) | `893af4b5-bf60-4f90-9f0c-50e3d6b483a8` (unreconciled) | `0b567a16-…` (REC-1201) + `54e9f48e-…` (REC-1202) + `fbfa57aa-…` (REC-1203) |
| C10 many-to-one debit order R3,000 | `092a365d-d283-450a-a0c9-b21dd9b7391e` | `grouped_match` | 85 | 0.00 | info | **true** | `331451bd-…` (seq 51, unmatched) | `4c2d9bd8-43cf-4d3b-81c6-080a46a0a80d` (unreconciled) | `6e8ca3af-…` (PAY-2210) + `edeac12d-…` (PAY-2211) |
| C11 pair combination R405.40 | `b7ae82b6-f3d6-49b0-afff-6436e248ecc7` | `combination_match` | 80 | −405.40 | high | false | `39227656-…` (seq 15, R95.00) + `a2fb9c3f-…` (seq 18, R310.40) — both unmatched | `e40148ed-0ac7-45de-8109-ebe87a442cf1` + `b22fb879-b299-4ee2-bea3-ae4953797f2e` | *(none — bank-only)* |
| C12 triple combination R225.25 | `cd9c135b-e9a0-4b26-8095-8f8e4a18d8a7` | `combination_match` | 70 | −225.25 | high | false | `00ce20a9-…` (seq 19, R42.00) + `26ad26e2-…` (seq 24, R118.50) + `1bfb9fc7-…` (seq 29, R64.75) — all unmatched | `90c710d7-…` + `127e139a-…` + `7820bfcc-…` | *(none — bank-only)* |

### Per-scenario evidence fields + expected resolution

| Scenario | amountDifferenceCents | dateDifferenceDays | sameCounterparty | sameDirection | referenceSimilarity | candidateSourceType | varianceExplainedCents | combinationTerms / notes | Expected line_state | Expected final resolution (real workflow) | Why it exists |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C2a PAY-2004 | — | — | — | true | — | journal_entry | 4,604,129 | `ageDays=3`, `isStale=false`, `aged_past_stale` NOT met, `orphaned_journal` met, `no_bank_counterpart` met | *(no Aug line)* | No action now — auto-clears when the September statement (bank row already dated 09-01) is imported. Whole-period proof: books→statement, reason `outstanding_timing`. | Payment posted 28 Aug, cleared bank 1 Sept — genuine in-transit item at the 31 Aug cut. |
| C2b REC-1001 | — | — | — | true | — | journal_entry | 229,529 | `ageDays=25`, `isStale=true`, `aged_past_stale` met, `orphaned_journal` met, `recorded_in_books` NOT met | *(no Aug line)* | Confirm the deposit reached the bank; it clears when the Sept statement (bank row dated 09-01) is imported. Whole-period proof: books→statement, reason `outstanding_timing`. | Receipt on the books, not yet on the bank at month-end — mirror of C2a. |
| C2c date-offset | 0 | 2 | true | true | 0 | statement_line | 0 | `amount_matches_exactly` (40), `within_date_tolerance` `2 days` (30), `reference_match` NOT met (0/20), `description_overlap` (15) | `matched` (seq 74) | Mark as a valid timing difference (`auto_resolution_safe=true`). | Bank cleared the EFT 2 days after the book date — normal settlement lag, still the same payment. |
| C3 R0.16 | −16 | 0 | true | true | 1 | journal_entry | 16 | `date_proximity` (25), `reference_match` (20), `description_overlap` (15), `transposition_shape` NOT met, `explains_whole_variance` NOT met (0/40) | `unmatched` (seq 45) | Correct the wrong record through the proper accounting flow (never edit posted history). Book R47.50 vs bank R47.66 — post the R0.16 adjustment. | Bank charged R47.66; the manual JE-3001 booked R47.50 — a small capture error. |
| C4 R185.50 | — | — | — | true | — | statement_line | 18,550 | `no_ledger_counterpart` (30), `aged_past_stale` `9 days` (30), `bank_initiated_shape` (15), `isStale=true` | `unmatched` (seq 60) | Record the missing charge via the Banking flow (Direct Payment), DR Bank Charges / CR Bank, then re-run. | Bank levied a cash-handling fee the books never captured. |
| C5 R62.10 | — | — | — | true | — | statement_line | 6,210 | `no_ledger_counterpart` (30), `aged_past_stale` `2 days` NOT met (0/30), `bank_initiated_shape` (15), `isStale=false` | `unmatched` (seq 86) | Record via the Banking flow (Direct Receipt), DR Bank / CR Interest Income, then re-run. | Bank paid interest the books never captured; only 2 days old so scored lower than C4. |
| C6 duplicate | 0 | 0 | true | true | 1 (description) | journal_entry | 460,000 | `identical_amount` (35), `date_proximity` `0 days` (25), `reference_match` NOT met (0/25), `description_overlap` strong (15) | `unmatched` (seq 61) | Void/reverse the duplicate JE-2064 through the proper flow (not a delete). Bank shows the R4,600 once; books twice. | JE-2064 is an explicit duplicate of JE-2063 / PAY-2220 (memo flags it). |
| C7 wrong sign | −366,860 | 0 | true | **false** | — | journal_entry | 366,860 | `identical_magnitude_opposite_direction` (40), `date_proximity` `0 days` (30), `reversal_shape` (15); `bankAmountCents=-183430`, `booksAmountCents=183430`, `swingCents=366860` | `unmatched` (seq 38) | Reverse the wrongly-signed posting and re-post with the correct DR/CR through the proper flow. | Bank row for REC-1020 was captured as an outflow; the receipt is an inflow — a debit/credit flip. |
| C8 wrong account | 0 (bank agrees) | 0 | — | — | — | — | — | Bank line matches perfectly on amount + date + direction — `line_state='matched'`. No `reconciliation_issue_type` covers a misclassified expense **code**. | `matched` (seq 35) | GL reclass journal: move R2,760.00 courier spend from 5180 Advertising to 5160 Fuel & Delivery. Surfaces via **Books Integrity / GL audit**, not the bank matcher. | Correctly-banked courier payment posted to the wrong expense account. |
| C9 R25,000 | 0 | 1 | — | true | — | journal_entry | 0 | `group_sums_exactly` "3 entries sum exactly to R25000.00" (45), `tight_date_cluster` `1 days` (25), `same_direction` (15); `combinationTerms`: REC-1201 R12,000.00 + REC-1202 R8,000.00 + REC-1203 R5,000.00 = R25,000.00; `groupSingleCents=2500000`, `combinationTotalCents=2500000` | `unmatched` (seq 48) | Confirm the grouping and mark all four items matched together (`auto_resolution_safe=true`). | Three individually-posted receipts banked next day as one R25,000 cash-up. |
| C10 R3,000 | 0 | 0 | — | true | — | journal_entry | 0 | `group_sums_exactly` "2 entries sum exactly to R3000.00" (45), `tight_date_cluster` `0 days` (25), `same_direction` (15); `combinationTerms`: PAY-2210 −R1,300.00 + PAY-2211 −R1,700.00 = −R3,000.00; `groupSingleCents=-300000` | `unmatched` (seq 51) | Confirm the grouping and mark all three items matched together (`auto_resolution_safe=true`). | One consolidated debit order on the bank against two separate supplier payments in the books. |
| C11 R405.40 | — | — | — | — | — | — | 40,540 | `sums_to_variance_exactly` "2 item(s) sum to exactly R405.40" (35), `all_otherwise_unexplained` (30), `two_item` (15), `single_item`/`three_item` NOT met; `combinationTerms`: −R95.00 (2026-08-08) + −R310.40 (2026-08-09) = −R405.40; `explainsVarianceExactly=true` | `unmatched` ×2 (seq 15, 18) | Review each fee; once confirmed real and booked, the R405.40 variance slice closes exactly. | Two bank-only fees that together explain a R405.40 slice of the variance. |
| C12 R225.25 | — | — | — | — | — | — | 22,525 | `sums_to_variance_exactly` "3 item(s) sum to exactly R225.25" (35), `all_otherwise_unexplained` (30), `three_item` (5), `single_item`/`two_item` NOT met; `combinationTerms`: −R42.00 (08-11) + −R118.50 (08-12) + −R64.75 (08-13) = −R225.25; `explainsVarianceExactly=true` | `unmatched` ×3 (seq 19, 24, 29) | Review each fee; once confirmed real and booked, the R225.25 variance slice closes exactly. | Three bank-only fees that together explain a R225.25 slice of the variance. |

### Outstanding deposit / outstanding payment — issue vs whole-period proof

Both C2a (PAY-2004) and C2b (REC-1001) **do** materialise as `reconciliation_issues` rows this batch,
both `issue_type='missing_bank_side'`:

- **C2b REC-1001** — `confidence=70`, `severity=medium`, `auto_resolution_safe=false`, `isStale=true`
  (`ageDays=25`). A real actionable exception at the 31-Aug cut: the deposit is 25 days old on the
  books with nothing on the bank, so the investigator wants it confirmed.
- **C2a PAY-2004** — `confidence=45`, `severity=low`, `auto_resolution_safe=true`, `isStale=false`
  (`ageDays=3`, `aged_past_stale` NOT met). `suggested_resolution` = *"No action needed yet — a normal
  outstanding item. Revisit if it is still unmatched next period."* This is the **whole-period-proof**
  case: it is a pure timing item (books→statement, reason `outstanding_timing`) that happens to be
  emitted as a low-confidence, auto-safe issue row rather than being suppressed. It contributes to the
  books-vs-statement-date variance only until the September statement is imported (the bank row already
  exists, dated 2026-09-01).

So: **document both as issues**, but read PAY-2004 as whole-period timing proof, not a real
discrepancy. Neither closes by a bank-side correction — both close when the next statement lands.

---

## PART O — accountant-style evidence walk-through

Each scenario below is written the way a reviewer would defend the finding in a working paper: the
statement line, the accounting record, the **actual** `evidence_data` values from the regenerated
`reconciliation_issues` row, the detector and confidence, and the resolution Vertex recommends. Every
claim is a real stored value.

### O-1 — R0.16 amount mismatch (C3)

- **Statement line:** `e32c01c4-8af7-4691-92c1-ff6d512c1085`, seq 45, 2026-08-19, "Bank charges –
  August service fee", R47.66, `direction='credit'` (outflow), `line_state='unmatched'`.
- **Accounting record:** `JE-3001` (`8ce56752-c15f-4baf-85c7-4b33b3c9cc74`), 2026-08-19, `source='bank'`:
  DR 5140 Bank Charges 47.50 / CR 1000 Cash and Bank 47.50.
- **Exact evidence:** `amountDifferenceCents: -16`, `dateDifferenceDays: 0`, `sameCounterparty: true`,
  `sameDirection: true`, `referenceSimilarity: 1`, `candidateSourceType: journal_entry`,
  `varianceExplainedCents: 16`, `explainsVarianceExactly: false`. Factor scorecard: `date_proximity`
  met (25/25), `reference_match` met (20/20), `description_overlap` met (15/15), `transposition_shape`
  NOT met (0/15), `explains_whole_variance` NOT met (0/40) — **3 of 5 factors met**.
- **Detector / confidence:** `amount_mismatch`, `confidence = 60` (`confidenceMax = 100`).
- **Vertex resolution:** "Review both records and correct the wrong one through the proper accounting
  flow (never edit posted history directly)." Bank is authoritative at R47.66 → post a R0.16
  top-up to Bank Charges.
- **Why it exists:** the fee actually debited was R47.66; the hand-written bank JE rounded to R47.50.

### O-2 — R185.50 missing bank charge (C4)

- **Statement line:** `fa398b7d-45ad-40b0-8aa9-ca9404df84e9`, seq 60, 2026-08-22, "Cash handling
  fee", R185.50, `direction='credit'`, `line_state='unmatched'`.
- **Accounting record:** none — `bank_transactions.046d81c4-…` has `journal_entry_id = null`,
  `source='import'`.
- **Exact evidence:** `bankAmountCents: -18550`, `ageDays: 9`, `isStale: true`,
  `candidateSourceType: statement_line`, `varianceExplainedCents: 18550`, `sameDirection: true`.
  Factor scorecard: `no_ledger_counterpart` met (30/30), `aged_past_stale` met — "9 day(s) old as of
  the statement date" (30/30), `bank_initiated_shape` met — "Likely a bank-initiated item (fee,
  interest, or debit order)" (15/15) — **3 of 3 factors met**.
- **Detector / confidence:** `missing_ledger_side`, `confidence = 75` (`confidenceMax = 75` — this
  detector caps at 75).
- **Vertex resolution:** "Record the missing transaction through the normal Banking flow (e.g. Direct
  Payment/Receipt), then re-run the investigation." → DR 5140 Bank Charges / CR 1000.
- **Why it exists:** a real bank fee that was never entered in the books.

### O-3 — R62.10 interest received (C5)

- **Statement line:** `d7959f10-94ee-4745-81dd-20f8cb3d30d8`, seq 86, 2026-08-29, "Interest
  Received", R62.10, `direction='debit'` (inflow), `line_state='unmatched'`.
- **Accounting record:** none — `bank_transactions.5d280d57-…` has `journal_entry_id = null`,
  `source='import'`.
- **Exact evidence:** `bankAmountCents: 6210`, `ageDays: 2`, `isStale: false`,
  `candidateSourceType: statement_line`, `varianceExplainedCents: 6210`, `sameDirection: true`.
  Factor scorecard: `no_ledger_counterpart` met (30/30), `aged_past_stale` **NOT** met — "2 day(s)
  old as of the statement date" (0/30), `bank_initiated_shape` met (15/15) — **2 of 3 factors met**.
- **Detector / confidence:** `missing_ledger_side`, `confidence = 45`. Lower than O-2 purely because
  the item is only 2 days old at the statement date, so the staleness factor scores zero.
- **Vertex resolution:** "Record the missing transaction through the normal Banking flow (e.g. Direct
  Payment/Receipt), then re-run the investigation." → DR 1000 / CR Interest Income R62.10.
- **Why it exists:** bank-paid interest the books never captured.

### O-4 — Duplicate posting, R4,600.00 (C6)

- **Statement line:** `d1b2995f-beb3-436f-883a-81843ef3e431`, seq 61, 2026-08-22, "PAY-2220 –
  supplier payment", R4,600.00, `direction='credit'`, `line_state='unmatched'` — one bank line for a
  cash event the books recorded twice.
- **Accounting records:** `JE-2063` (`283cca35-9321-4b61-9502-8fe2ef431d71`, the real leg,
  reconciled to bank row `539ca37d-…`) and `JE-2064` (`58666e95-7939-4f64-a23d-1767cb90c987`, memo
  "recon: DUPLICATE of PAY-2220 – books contain this twice, bank once"). Both credit 1000 Cash and
  Bank R4,600.00.
- **Exact evidence:** `amountDifferenceCents: 0`, `dateDifferenceDays: 0`, `sameCounterparty: true`,
  `sameDirection: true`, `referenceSimilarity: 1`, `candidateSourceType: journal_entry`,
  `varianceExplainedCents: 460000`, `sameBankAccount: false`. Factor scorecard: `identical_amount`
  met (35/35), `date_proximity` met — "Same date", "0 days" (25/25), `reference_match` **NOT** met
  (0/25), `description_overlap` met — "Description text overlaps strongly" (15/15) — **3 of 4
  factors met**.
- **Detector / confidence:** `duplicate_transaction`, `confidence = 75` (`confidenceMax = 100`).
- **Vertex resolution:** "Review both records — if genuinely duplicated, void/reverse one through the
  proper accounting flow rather than deleting it." → reverse `JE-2064`.
- **Why it exists:** the supplier payment was captured twice in the ledger; the bank shows it once.

### O-5 — Wrong sign, REC-1020 (C7)

- **Statement line:** `3785d3e9-6469-49fa-943e-0576b9e616fc`, seq 38, 2026-08-16, "recon: WRONG-SIGN
  test case – REC-1020 posted as outflow", R1,834.30, `direction='credit'` (the deliberate error —
  captured as an outflow), `line_state='unmatched'`.
- **Accounting record:** `JE-1078` (`7537d664-7738-44e7-affb-9be18c9a2b38`), "Customer receipt
  REC-1020", 2026-08-16 — a correctly-balanced inflow (DR 1000 / CR 1100).
- **Exact evidence:** `bankAmountCents: -183430`, `booksAmountCents: 183430`, `sameDirection: false`,
  `sameCounterparty: true`, `dateDifferenceDays: 0`, `swingCents: 366860`,
  `amountDifferenceCents: -366860`, `varianceExplainedCents: 366860`, `candidateSourceType:
  journal_entry`. Factor scorecard: `identical_magnitude_opposite_direction` met (40/40),
  `date_proximity` met — "0 days" (30/30), `reversal_shape` met — "Likely a debit/credit reversal at
  data entry" (15/15) — **3 of 3 factors met**.
- **Detector / confidence:** `wrong_sign`, `confidence = 85` (`confidenceMax = 85`).
- **Effect:** `effect_amount = 3668.60` — **double** the R1,834.30 line, because fixing a sign flip
  moves the balance by 2× the amount (remove −1,834.30, add +1,834.30).
- **Vertex resolution:** "Reverse the incorrectly-signed posting and re-post it with the correct
  debit/credit, through the proper accounting flow."
- **Why it exists:** the bank capture of REC-1020 has the direction inverted vs the real receipt.

### O-6 — Wrong GL account, courier payment (C8) — a Books-Integrity finding, not a bank match

- **Statement line:** `4efebc80-5e82-4779-8717-2445655d16be`, seq 35, 2026-08-14, "Direct payment –
  RapidCourier Logistics", R2,760.00, `direction='credit'`, **`line_state='matched'`**,
  `matched_bank_transaction_id = 71d62d53-f20f-4d16-88e9-f981fbb64b68`.
- **Accounting record:** `JE-2041` (`3a3a6721-683d-4274-b9ce-e6c39f80c658`), 2026-08-14, memo "recon:
  WRONG-ACCOUNT – courier posted to 5180, should be 5160": DR **5180 Advertising & Marketing**
  R2,760.00 / CR 1000 Cash and Bank R2,760.00.
- **Exact evidence:** there is **no `reconciliation_issues` row** — by design. The bank line agrees
  with the ledger on amount (R2,760.00 = R2,760.00), date (2026-08-14 = 2026-08-14) and direction
  (both outflow), so the matcher pairs it cleanly and `line_state='matched'`. A bank reconciliation
  compares *cash movements*, and the cash movement is correct.
- **Why it is NOT a bank-match finding:** none of the 14 `reconciliation_issue_type` values model a
  misclassified **expense code**. `wrong_bank_account` specifically means the cash moved through a
  *different physical bank account* (a different `account_number`) — not the wrong GL expense line on
  a correctly-banked payment. The fault here is purely in the P&L classification: courier spend
  belongs in 5160 Fuel & Delivery Expense, not 5180 Advertising & Marketing.
- **Where it should surface:** the **Books Integrity / GL audit** track (vendor-to-category
  consistency, expense-account pattern checks) — e.g. "payments to RapidCourier Logistics normally
  hit 5160; this one hit 5180".
- **Resolution:** a reclassification journal — DR 5160 / CR 5180 R2,760.00 — leaving cash and the
  bank reconciliation untouched.

### O-7 — One-to-many grouped deposit, R25,000.00 (C9)

- **Statement line:** `b89b5e33-9003-4d6f-b23a-b1dfca20b142`, seq 48, 2026-08-19, "Cash/EFT deposit
  batch", R25,000.00, `direction='debit'` (inflow), `line_state='unmatched'`.
- **Accounting records:** three individually-posted customer receipts, all dated 2026-08-18 —
  `REC-1201` (`0b567a16-…`) R12,000.00, `REC-1202` (`54e9f48e-…`) R8,000.00, `REC-1203`
  (`fbfa57aa-…`) R5,000.00.
- **Exact evidence / arithmetic:** `groupPartCount: 3`, `groupSingleCents: 2500000`,
  `combinationTotalCents: 2500000`, `amountDifferenceCents: 0`, `dateDifferenceDays: 1`,
  `sameDirection: true`. `combinationTerms`: `[ {Customer receipt REC-1201, 2026-08-18: 1200000},
  {Customer receipt REC-1202, 2026-08-18: 800000}, {Customer receipt REC-1203, 2026-08-18: 500000} ]`
  → **1,200,000 + 800,000 + 500,000 = 2,500,000 cents = R25,000.00**, exactly the bank line. Factor
  scorecard: `group_sums_exactly` — "3 entries sum exactly to R25000.00" (45/45), `tight_date_cluster`
  — "1 days" (25/25), `same_direction` (15/15) — **3 of 3 met**.
- **Detector / confidence:** `grouped_match`, `confidence = 85` (`confidenceMax = 85`),
  `auto_resolution_safe = true`.
- **Vertex resolution:** "Confirm the grouping and mark all items as matched together."
- **Why it exists:** a next-day cash-up deposit that banks three separate receipts as one line.

### O-8 — Pair combination, R405.40 (C11)

- **Statement lines:** `39227656-d675-4dfb-a2ec-4b824c21c5d2` seq 15, 2026-08-08, "Card machine
  rental fee", R95.00; and `a2fb9c3f-ead5-450d-8b40-4fa3659386d1` seq 18, 2026-08-09, "SMS
  notification fee", R310.40 — both `direction='credit'`, both `line_state='unmatched'`.
- **Accounting records:** none — both bank-only.
- **Exact evidence / arithmetic:** `combinationTotalCents: -40540`, `varianceExplainedCents: 40540`,
  `explainsVarianceExactly: true`. `combinationTerms`: `[ {Card machine rental fee, 2026-08-08:
  -9500}, {SMS notification fee, 2026-08-09: -31040} ]` → **−9,500 + −31,040 = −40,540 cents =
  −R405.40**, which equals the reconciliation's unexplained slice exactly. Factor scorecard:
  `sums_to_variance_exactly` — "2 item(s) sum to exactly R405.40" (35/35), `all_otherwise_unexplained`
  (30/30), `two_item` (15/15); `single_item` NOT met (0/20), `three_item` NOT met (0/5) — **3 of 5
  met**.
- **Detector / confidence:** `combination_match`, `confidence = 80` (`confidenceMax = 100`).
- **Vertex resolution:** "Review each item — if all are confirmed as real, no unexplained difference
  remains once they are corrected/allocated."
- **Why it exists:** two small bank fees that together account for a R405.40 slice of the gap.

### O-9 — Triple combination, R225.25 (C12)

- **Statement lines:** `00ce20a9-a50b-483a-abf1-aa7df988c47e` seq 19, 2026-08-11, "Electronic
  statement fee", R42.00; `26ad26e2-d579-430b-bc77-d36d6e8cf8fe` seq 24, 2026-08-12, "ATM withdrawal
  fee", R118.50; `1bfb9fc7-3c74-4517-8a13-292aa51651ff` seq 29, 2026-08-13, "Faster payment fee",
  R64.75 — all `direction='credit'`, all `line_state='unmatched'`.
- **Accounting records:** none — all bank-only.
- **Exact evidence / arithmetic:** `combinationTotalCents: -22525`, `varianceExplainedCents: 22525`,
  `explainsVarianceExactly: true`. `combinationTerms`: `[ {Electronic statement fee, 2026-08-11:
  -4200}, {ATM withdrawal fee, 2026-08-12: -11850}, {Faster payment fee, 2026-08-13: -6475} ]` →
  **−4,200 + −11,850 + −6,475 = −22,525 cents = −R225.25**, the unexplained slice exactly. Factor
  scorecard: `sums_to_variance_exactly` — "3 item(s) sum to exactly R225.25" (35/35),
  `all_otherwise_unexplained` (30/30), `three_item` (5/5); `single_item` NOT met (0/20), `two_item`
  NOT met (0/15) — **3 of 5 met**.
- **Detector / confidence:** `combination_match`, `confidence = 70`. Lower than O-8 because a
  three-item combination scores only 5 shape points vs 15 for a pair.
- **Vertex resolution:** "Review each item — if all are confirmed as real, no unexplained difference
  remains once they are corrected/allocated."
- **Why it exists:** three small bank fees that together account for a R225.25 slice of the gap.

### O-10 — EFT date-offset timing (C2c)

- **Statement line:** `6dcd9115-8735-4e48-b8a2-6e7dc5135f18`, seq 74, **bank date 2026-08-27**,
  "PAY-2007 – supplier payment", R10,157.95, `direction='credit'`, `line_state='matched'`,
  `matched_bank_transaction_id = 75c4fdaf-15a7-4a48-85bf-8ab7fa68899c`.
- **Accounting record:** `JE-2048` (`c218514e-48dd-41a0-89d7-89656240f02c`), "PAY-2007 – supplier
  payment", **book date 2026-08-25**.
- **Book date vs bank date:** 2026-08-25 (books) → 2026-08-27 (bank) — **2 days apart**, same
  amount.
- **Exact evidence:** `amountDifferenceCents: 0`, `dateDifferenceDays: 2`, `sameCounterparty: true`,
  `sameDirection: true`, `referenceSimilarity: 0`, `candidateSourceType: statement_line`,
  `varianceExplainedCents: 0`, `booksAmountCents: -1015795`, `bankAmountCents: -1015795`. Factor
  scorecard: `amount_matches_exactly` met (40/40), `within_date_tolerance` met — "2 day(s) apart"
  (30/30), `reference_match` **NOT** met (0/20), `description_overlap` met (15/15) — **3 of 4
  met**.
- **Detector / confidence:** `date_offset_timing`, `confidence = 85`, `severity = info`,
  `effect_amount = 0`, `auto_resolution_safe = true`.
- **Vertex resolution:** "Mark as a valid timing difference." No correcting entry — the payment and
  the bank line are the same event, 2 settlement days apart.
- **Why it exists:** normal EFT settlement lag between the book date and the value date on the bank.

---

## Invariants preserved

- Every `bank_transactions.journal_entry_id` (where not null) resolves to a real `journal_entries` row
  for company `676c6cda-2e67-4ee3-8aaa-249b2c6bbc01` — verified (0 orphans).
- `JE-3001` balances to the cent (47.50 = 47.50) — verified.
- Company-wide Σdebit − Σcredit across all `journal_lines` = **0.00** after Agent 5's one new journal
  entry — verified.
- No row inserted, updated or deleted by Agent 5 touched `invoices`, `bills`, `customer_receipts`,
  `payments`, `credit_notes`, or any `JE-1xxx`/`JE-2xxx`/`JE-4xxx`/`JE-0001` journal entry — confirmed
  by construction (only `bank_accounts`, `bank_transactions`, `reconciliation_issues`, and one new
  `JE-3001` were written).
- `≥25` reconciled bank lines: **81** actual, comfortably over target.
- `~12–15` exception lines: **13** actual (`unreconciled`), in range.
- P2.3 regen: exactly **12** `reconciliation_issues` rows for the company, all `status='open'`, all
  with a non-empty `evidence_data` scorecard and a `dedupe_key`, single batch
  `created_at = 2026-08-28 17:37:38 UTC` — verified. Baseline untouched by the regen: 171
  `journal_entries`, company-wide Σdebit − Σcredit `0.00`, GL 1100/1000/1200 =
  R207,794.04 / R212,270.67 / R1,569,743.20, 1 `bank_statements` (`df28d259-…`) + 87
  `bank_statement_lines`, 94 `bank_transactions` (81 reconciled / 13 unreconciled).
- Part J (P1.4): exactly **1** `bank_statements` row for the company (`df28d259-…`), `line_count`
  **87** == actual `bank_statement_lines` rows; every line `company_id` = the company and
  `bank_account_id` = `2fb81a17-…`; the 75 `matched` lines are bijective with the 75
  `bank_transactions.bank_statement_line_id` back-links (verified: 0 mismatches, 0 dangling FKs);
  `350000 + Σ signed(87 lines) = 184068.54 = closing_balance`. No `bank_transactions` rows,
  `journal_entries`, `products`, inventory or `reconciliation_issues` were created or altered — only
  `bank_statement_lines` (new) + `bank_transactions.bank_statement_line_id` (75 links).
