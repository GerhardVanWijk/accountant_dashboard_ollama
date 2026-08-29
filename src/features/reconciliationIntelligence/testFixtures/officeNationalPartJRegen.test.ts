import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BankAccount, BankStatementLine, ID, JournalEntry } from '@/types';
import type { BankTransactionWithAllocations } from '@/features/banking/types';
import type { ReconciliationSummary } from '@/features/banking/services';
import { ReconciliationInvestigatorService } from '../services/reconciliationInvestigatorService';
import { MockReconciliationIssueRepository } from '../repositories/MockReconciliationIssueRepository';

/**
 * P2.3 — OFFLINE regeneration harness for the Office National August 2026
 * `reconciliation_issues` under the P2.1 evidence model (Agent 20).
 *
 * Runs the REAL `ReconciliationInvestigatorService` (same class the live app
 * uses) with the REAL `bank_statement_lines` (statement `df28d259…`, 87 rows,
 * migration 0020) as the bank side, against a books side reconstructed from the
 * REAL August journal entries posted to bank GL account
 * `897d22f7-4f05-478d-80e2-c2587e13fc36` (GL 1000 Cash and Bank). Every id,
 * amount, date and description below was pulled read-only from live Supabase
 * on 2026-08-28 via `execute_sql` — nothing is invented.
 *
 * The "JE-0171 rule": no dev server, no real `*Service` singleton, no DB write
 * from app code. This spec only reads. The regenerated drafts it emits are
 * persisted separately by Agent 20 via reviewed `execute_sql`.
 *
 * WHY a curated scenario subset rather than all 87 lines + all ~74 August GL
 * entries: the P2.1 `detectMissingEntries` runs on the un-reduced
 * unmatched pools, so it re-flags every item a more specific detector already
 * explained (a `wrong_sign` line ALSO becomes `missing_ledger_side`, etc.), and
 * the 16 deliberately-split tranche receipts/payments (1 journal entry ↔ 2
 * statement lines) each surface as a benign `grouped_match`. Those are real
 * engine behaviours but they are not the 12 deliberately-planted training
 * scenarios. Clean-match / tranche correctness is proven separately by live SQL
 * count (docs/OFFICE_NATIONAL_RECON_EXPECTATIONS.md "Invariants preserved").
 * This harness feeds the 12 scenario bank legs (+ C2c and C8, which must NOT
 * raise a bank-match finding) and the scenario books legs, then keeps the
 * canonical finding per scenario and discards the `missing_*` shadow rows.
 *
 * Fixture linkage note: the Part J backfill left the 12 scenario statement
 * lines `line_state='unmatched'` (no clean 1:1 match). Here each carries
 * `matchedBankTransactionId` = its real corresponding `bank_transactions.id`
 * (identical amount/date/description/reference — the same bank event), so the
 * regenerated issues carry a traceable `related_bank_transaction_ids` and a
 * distinct `dedupe_key`, matching the shape of the pre-evidence golden batch.
 */

const COMPANY_ID = '676c6cda-2e67-4ee3-8aaa-249b2c6bbc01';
const ON_BANK_ACCOUNT_ID = '2fb81a17-92b6-4936-9925-456a73a91cd1';
const ON_BANK_GL_ACCOUNT_ID = '897d22f7-4f05-478d-80e2-c2587e13fc36';
const ON_STATEMENT_ID = 'df28d259-dfc2-48fb-929c-be9450a08bd7';
const ON_STATEMENT_DATE = '2026-08-31';
const ON_STATEMENT_CLOSING_BALANCE = 184_068.54; // P1 review decision (was R174,265.22)

type Dir = 'debit' | 'credit';

function line(o: {
  id: string;
  sequence: number;
  date: string;
  description: string;
  reference: string;
  amount: number;
  direction: Dir;
  matchedBankTransactionId?: string;
}): BankStatementLine {
  return {
    id: o.id,
    createdAt: `${o.date}T00:00:00.000Z`,
    updatedAt: `${o.date}T00:00:00.000Z`,
    bankStatementId: ON_STATEMENT_ID,
    bankAccountId: ON_BANK_ACCOUNT_ID,
    sequence: o.sequence,
    txnDate: `${o.date}T00:00:00.000Z`,
    description: o.description,
    reference: o.reference,
    externalRefId: o.reference,
    amount: o.amount,
    direction: o.direction,
    rawSource: {},
    lineState: o.matchedBankTransactionId ? 'matched' : 'unmatched',
    matchedBankTransactionId: o.matchedBankTransactionId,
  };
}

/** The 12 scenario bank legs + C2c (seq 74) + C8 (seq 35), verbatim from `bank_statement_lines`. */
const STATEMENT_LINES: BankStatementLine[] = [
  // C11 pair
  line({ id: '39227656-d675-4dfb-a2ec-4b824c21c5d2', sequence: 15, date: '2026-08-08', description: 'Card machine rental fee', reference: 'ONBANK-0095', amount: 95.0, direction: 'credit', matchedBankTransactionId: 'e40148ed-0ac7-45de-8109-ebe87a442cf1' }),
  line({ id: 'a2fb9c3f-ead5-450d-8b40-4fa3659386d1', sequence: 18, date: '2026-08-09', description: 'SMS notification fee', reference: 'ONBANK-0310', amount: 310.4, direction: 'credit', matchedBankTransactionId: 'b22fb879-b299-4ee2-bea3-ae4953797f2e' }),
  // C12 triple
  line({ id: '00ce20a9-a50b-483a-abf1-aa7df988c47e', sequence: 19, date: '2026-08-11', description: 'Electronic statement fee', reference: 'ONBANK-0042', amount: 42.0, direction: 'credit', matchedBankTransactionId: '90c710d7-4427-4e90-8b1d-374581c6b3f6' }),
  line({ id: '26ad26e2-d579-430b-bc77-d36d6e8cf8fe', sequence: 24, date: '2026-08-12', description: 'ATM withdrawal fee', reference: 'ONBANK-0118', amount: 118.5, direction: 'credit', matchedBankTransactionId: '127e139a-c05f-42e4-8de0-06e7458af499' }),
  line({ id: '1bfb9fc7-3c74-4517-8a13-292aa51651ff', sequence: 29, date: '2026-08-13', description: 'Faster payment fee', reference: 'ONBANK-0064', amount: 64.75, direction: 'credit', matchedBankTransactionId: '7820bfcc-9135-4c0a-8992-e732691e1565' }),
  // C8 wrong-account (bank side clean — must NOT raise a bank-match issue)
  line({ id: '4efebc80-5e82-4779-8717-2445655d16be', sequence: 35, date: '2026-08-14', description: 'Direct payment - RapidCourier Logistics', reference: 'ONBANK-2041', amount: 2760.0, direction: 'credit', matchedBankTransactionId: '71d62d53-f20f-4d16-88e9-f981fbb64b68' }),
  // C7 wrong sign
  line({ id: '3785d3e9-6469-49fa-943e-0576b9e616fc', sequence: 38, date: '2026-08-16', description: 'recon: WRONG-SIGN test case - REC-1020 posted as outflow', reference: 'REC-1020', amount: 1834.3, direction: 'credit', matchedBankTransactionId: '64f28fa4-740a-4b60-a6c5-fc90ae1636c5' }),
  // C3 R0.16 amount mismatch
  line({ id: 'e32c01c4-8af7-4691-92c1-ff6d512c1085', sequence: 45, date: '2026-08-19', description: 'Bank charges - August service fee', reference: 'JE-3001', amount: 47.66, direction: 'credit', matchedBankTransactionId: 'edf796c4-87a1-40b2-a3cb-8907f7c5d6f5' }),
  // C9 grouped deposit
  line({ id: 'b89b5e33-9003-4d6f-b23a-b1dfca20b142', sequence: 48, date: '2026-08-19', description: 'Cash/EFT deposit batch', reference: 'ONBANK-2500', amount: 25000.0, direction: 'debit', matchedBankTransactionId: '893af4b5-bf60-4f90-9f0c-50e3d6b483a8' }),
  // C10 grouped debit order
  line({ id: '331451bd-c8c1-4015-8e66-1bffdb10afb7', sequence: 51, date: '2026-08-20', description: 'Debit order - supplier consolidated', reference: 'ONBANK-3000', amount: 3000.0, direction: 'credit', matchedBankTransactionId: '4c2d9bd8-43cf-4d3b-81c6-080a46a0a80d' }),
  // C4 missing bank charge
  line({ id: 'fa398b7d-45ad-40b0-8aa9-ca9404df84e9', sequence: 60, date: '2026-08-22', description: 'Cash handling fee', reference: 'ONBANK-0186', amount: 185.5, direction: 'credit', matchedBankTransactionId: '046d81c4-0bdf-45f5-a0c0-bc9bc2f74d38' }),
  // C6 duplicate posting (one bank line, two book entries)
  line({ id: 'd1b2995f-beb3-436f-883a-81843ef3e431', sequence: 61, date: '2026-08-22', description: 'PAY-2220 - supplier payment', reference: 'PAY-2220', amount: 4600.0, direction: 'credit', matchedBankTransactionId: '539ca37d-dea1-43df-b3e7-67ad6e53580f' }),
  // C2c EFT date offset (still a match)
  line({ id: '6dcd9115-8735-4e48-b8a2-6e7dc5135f18', sequence: 74, date: '2026-08-27', description: 'PAY-2007 - supplier payment', reference: 'PAY-2007', amount: 10157.95, direction: 'credit', matchedBankTransactionId: '75c4fdaf-15a7-4a48-85bf-8ab7fa68899c' }),
  // C5 interest received (bank-only)
  line({ id: 'd7959f10-94ee-4745-81dd-20f8cb3d30d8', sequence: 86, date: '2026-08-29', description: 'Interest Received', reference: 'ONBANK-0062', amount: 62.1, direction: 'debit', matchedBankTransactionId: '5d280d57-2109-4b26-8a24-9c93a65f7a92' }),
];

/** One synthetic JournalEntry per scenario books leg — the real GL-1000 posting (`gl1000_debit`/`gl1000_credit` from `journal_lines`). */
function je(o: { id: string; entryNumber: string; date: string; memo: string; debit?: number; credit?: number }): JournalEntry {
  return {
    id: o.id,
    createdAt: `${o.date}T00:00:00.000Z`,
    updatedAt: `${o.date}T00:00:00.000Z`,
    entryNumber: o.entryNumber,
    date: o.date,
    memo: o.memo,
    status: 'posted',
    source: 'seed',
    lines: [
      {
        id: `${o.id}-l1`,
        accountId: ON_BANK_GL_ACCOUNT_ID,
        description: o.memo,
        debit: o.debit ?? 0,
        credit: o.credit ?? 0,
      },
    ],
  };
}

const BOOKS_JOURNAL_ENTRIES: JournalEntry[] = [
  je({ id: '8ce56752-c15f-4baf-85c7-4b33b3c9cc74', entryNumber: 'JE-3001', date: '2026-08-19', memo: 'Bank charges - August service fee', credit: 47.5 }), // C3
  je({ id: '7537d664-7738-44e7-affb-9be18c9a2b38', entryNumber: 'JE-1078', date: '2026-08-16', memo: 'Customer receipt REC-1020', debit: 1834.3 }), // C7
  je({ id: '0b567a16-3771-49b1-8807-769f3b1331a8', entryNumber: 'JE-1090', date: '2026-08-18', memo: 'Customer receipt REC-1201', debit: 12000.0 }), // C9
  je({ id: '54e9f48e-fdde-4029-8a72-8e2bcfacb33c', entryNumber: 'JE-1091', date: '2026-08-18', memo: 'Customer receipt REC-1202', debit: 8000.0 }), // C9
  je({ id: 'fbfa57aa-cafb-4f9b-af35-541a7d876742', entryNumber: 'JE-1092', date: '2026-08-18', memo: 'Customer receipt REC-1203', debit: 5000.0 }), // C9
  je({ id: '6e8ca3af-0ba6-49a9-98af-9a398421c10b', entryNumber: 'JE-2061', date: '2026-08-20', memo: 'PAY-2210 - supplier payment', credit: 1300.0 }), // C10
  je({ id: 'edeac12d-0939-4897-b9aa-63fb8ade6e51', entryNumber: 'JE-2062', date: '2026-08-20', memo: 'PAY-2211 - supplier payment', credit: 1700.0 }), // C10
  je({ id: '283cca35-9321-4b61-9502-8fe2ef431d71', entryNumber: 'JE-2063', date: '2026-08-22', memo: 'PAY-2220 - supplier payment', credit: 4600.0 }), // C6 real
  je({ id: '58666e95-7939-4f64-a23d-1767cb90c987', entryNumber: 'JE-2064', date: '2026-08-22', memo: 'PAY-2220 - supplier payment', credit: 4600.0 }), // C6 duplicate
  je({ id: 'c218514e-48dd-41a0-89d7-89656240f02c', entryNumber: 'JE-2048', date: '2026-08-25', memo: 'PAY-2007 - supplier payment', credit: 10157.95 }), // C2c
  je({ id: 'd5de1a6c-3e42-4506-a41c-a881cbcfe9e9', entryNumber: 'JE-2045', date: '2026-08-28', memo: 'PAY-2004 - supplier payment', credit: 46041.29 }), // C2a
  je({ id: 'd3b5fd25-5cd6-45c0-9533-f9d081beb5e3', entryNumber: 'JE-1059', date: '2026-08-06', memo: 'Customer receipt REC-1001', debit: 2295.29 }), // C2b (live JE date is 08-06, not the doc's 08-30)
  je({ id: '3a3a6721-683d-4274-b9ce-e6c39f80c658', entryNumber: 'JE-2041', date: '2026-08-14', memo: 'Direct payment - RapidCourier Logistics', credit: 2760.0 }), // C8 books leg
];

const BANK_ACCOUNT: BankAccount = {
  id: ON_BANK_ACCOUNT_ID,
  createdAt: '2026-08-02T00:00:00.000Z', // backdated so windowBounds() covers all of August (real row is 2026-08-28)
  updatedAt: '2026-08-28T00:00:00.000Z',
  name: 'Office National Business Cheque',
  bankName: 'First National Bank',
  accountNumber: '62884471059',
  accountType: 'checking',
  currency: 'ZAR',
  glAccountId: ON_BANK_GL_ACCOUNT_ID,
  openingBalance: 350_000.0,
  currentBalance: 212_270.67,
  status: 'active',
};

function buildService(varianceRand: number) {
  const issueRepository = new MockReconciliationIssueRepository();
  const service = new ReconciliationInvestigatorService(
    issueRepository,
    {
      getBankAccount: async (id: ID) => (id === BANK_ACCOUNT.id ? BANK_ACCOUNT : undefined),
      getBankAccounts: async () => [BANK_ACCOUNT],
    },
    { getTransactions: async () => [] as BankTransactionWithAllocations[] },
    { getHistory: async () => [] },
    { getEntries: async () => BOOKS_JOURNAL_ENTRIES },
    {
      computeSummary: async (): Promise<ReconciliationSummary> => ({
        bankAccountId: ON_BANK_ACCOUNT_ID,
        statementDate: ON_STATEMENT_DATE,
        statementBalance: ON_STATEMENT_CLOSING_BALANCE,
        glCashbookBalance: BANK_ACCOUNT.currentBalance,
        unpresentedPayments: [],
        unpresentedPaymentsTotal: 0,
        unclearedDeposits: [],
        unclearedDepositsTotal: 0,
        unallocatedItems: [],
        adjustedBankBalance: BANK_ACCOUNT.currentBalance - varianceRand,
        variance: varianceRand,
        isBalanced: varianceRand === 0,
      }),
    },
    { getByAccountInWindow: async () => STATEMENT_LINES },
  );
  return service;
}

const near = (a: number, b: number) => Math.abs(Math.abs(a) - b) < 0.005;

describe('P2.3 — regenerate Office National reconciliation_issues under the P2.1 evidence model', () => {
  it('detects every one of the 12 deliberate scenarios (regression)', async () => {
    const main = await (await buildService(-1)).investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, ON_STATEMENT_CLOSING_BALANCE, []);
    const c11 = await (await buildService(-405.4)).investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, ON_STATEMENT_CLOSING_BALANCE, []);
    const c12 = await (await buildService(-225.25)).investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, ON_STATEMENT_CLOSING_BALANCE, []);

    const issues = main.issues;

    // C2c — timing / date-offset (still a match, 2-day slip)
    expect(issues.some((i) => i.issueType === 'date_offset_timing' && i.relatedJournalEntryIds.includes('c218514e-48dd-41a0-89d7-89656240f02c'))).toBe(true);
    // C3 — R0.16 amount mismatch
    expect(issues.some((i) => i.issueType === 'amount_mismatch' && near(i.effectAmount, 0.16))).toBe(true);
    // C4 — missing R185.50 bank charge
    expect(issues.some((i) => i.issueType === 'missing_ledger_side' && near(i.effectAmount, 185.5))).toBe(true);
    // C5 — missing R62.10 interest
    expect(issues.some((i) => i.issueType === 'missing_ledger_side' && near(i.effectAmount, 62.1))).toBe(true);
    // C6 — duplicate posting, both JE legs
    expect(
      issues.some(
        (i) =>
          i.issueType === 'duplicate_transaction' &&
          near(i.effectAmount, 4600) &&
          i.relatedJournalEntryIds.includes('283cca35-9321-4b61-9502-8fe2ef431d71') &&
          i.relatedJournalEntryIds.includes('58666e95-7939-4f64-a23d-1767cb90c987'),
      ),
    ).toBe(true);
    // C7 — wrong sign, effect = double the amount
    expect(issues.some((i) => i.issueType === 'wrong_sign' && near(i.effectAmount, 3668.6))).toBe(true);
    // C8 — wrong-account: NOTHING from the bank matcher references the courier line / JE-2041
    expect(
      issues.some(
        (i) =>
          i.relatedJournalEntryIds.includes('3a3a6721-683d-4274-b9ce-e6c39f80c658') ||
          i.relatedBankTransactionIds.includes('71d62d53-f20f-4d16-88e9-f981fbb64b68'),
      ),
    ).toBe(false);
    // C9 — one-to-many grouped deposit
    expect(
      issues.some(
        (i) =>
          i.issueType === 'grouped_match' &&
          i.relatedJournalEntryIds.includes('0b567a16-3771-49b1-8807-769f3b1331a8') &&
          i.relatedJournalEntryIds.includes('54e9f48e-fdde-4029-8a72-8e2bcfacb33c') &&
          i.relatedJournalEntryIds.includes('fbfa57aa-cafb-4f9b-af35-541a7d876742'),
      ),
    ).toBe(true);
    // C10 — many-to-one grouped debit order
    expect(
      issues.some(
        (i) =>
          i.issueType === 'grouped_match' &&
          i.relatedJournalEntryIds.includes('6e8ca3af-0ba6-49a9-98af-9a398421c10b') &&
          i.relatedJournalEntryIds.includes('edeac12d-0939-4897-b9aa-63fb8ade6e51'),
      ),
    ).toBe(true);
    // C11 — pair combination R405.40
    expect(c11.issues.some((i) => i.issueType === 'combination_match' && near(i.effectAmount, 405.4))).toBe(true);
    // C12 — triple combination R225.25
    expect(c12.issues.some((i) => i.issueType === 'combination_match' && near(i.effectAmount, 225.25))).toBe(true);
    // C2a — outstanding payment PAY-2004 (auto-resolution-safe timing item)
    expect(
      issues.some((i) => i.issueType === 'missing_bank_side' && near(i.effectAmount, 46041.29) && i.autoResolutionSafe),
    ).toBe(true);
    // C2b — outstanding deposit REC-1001
    expect(issues.some((i) => i.issueType === 'missing_bank_side' && near(i.effectAmount, 2295.29))).toBe(true);
  });

  it('emits the canonical regenerated issue set to scratchpad for SQL persistence', async () => {
    const main = await (await buildService(-1)).investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, ON_STATEMENT_CLOSING_BALANCE, []);
    const c11 = await (await buildService(-405.4)).investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, ON_STATEMENT_CLOSING_BALANCE, []);
    const c12 = await (await buildService(-225.25)).investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, ON_STATEMENT_CLOSING_BALANCE, []);

    const grouped = main.issues.filter((i) => i.issueType === 'grouped_match');
    const c9 = grouped.find((i) => i.relatedJournalEntryIds.includes('0b567a16-3771-49b1-8807-769f3b1331a8'))!;
    const c10 = grouped.find((i) => i.relatedJournalEntryIds.includes('6e8ca3af-0ba6-49a9-98af-9a398421c10b'))!;

    const canonical = [
      main.issues.find((i) => i.issueType === 'date_offset_timing')!, // C2c
      main.issues.find((i) => i.issueType === 'amount_mismatch')!, // C3
      main.issues.find((i) => i.issueType === 'missing_ledger_side' && near(i.effectAmount, 185.5))!, // C4
      main.issues.find((i) => i.issueType === 'missing_ledger_side' && near(i.effectAmount, 62.1))!, // C5
      main.issues.find((i) => i.issueType === 'duplicate_transaction')!, // C6
      main.issues.find((i) => i.issueType === 'wrong_sign')!, // C7
      c9,
      c10,
      c11.issues.find((i) => i.issueType === 'combination_match' && near(i.effectAmount, 405.4))!, // C11
      c12.issues.find((i) => i.issueType === 'combination_match' && near(i.effectAmount, 225.25))!, // C12
      main.issues.find((i) => i.issueType === 'missing_bank_side' && near(i.effectAmount, 46041.29))!, // C2a
      main.issues.find((i) => i.issueType === 'missing_bank_side' && near(i.effectAmount, 2295.29))!, // C2b
    ];

    expect(canonical.every(Boolean)).toBe(true);
    expect(new Set(canonical.map((i) => i.dedupeKey)).size).toBe(canonical.length); // all dedupe keys distinct

    const out = canonical.map((i) => ({
      scenario: undefined as string | undefined,
      issue_type: i.issueType,
      severity: i.severity,
      confidence: i.confidence,
      effect_amount: i.effectAmount,
      affected_date_from: i.affectedDateFrom,
      affected_date_to: i.affectedDateTo,
      related_bank_transaction_ids: i.relatedBankTransactionIds,
      related_journal_entry_ids: i.relatedJournalEntryIds,
      dedupe_key: i.dedupeKey,
      auto_resolution_safe: i.autoResolutionSafe,
      explanation: i.explanation,
      suggested_resolution: i.suggestedResolution,
      evidence: i.evidence,
      evidence_data: i.evidenceData,
    }));
    const labels = ['C2c', 'C3', 'C4', 'C5', 'C6', 'C7', 'C9', 'C10', 'C11', 'C12', 'C2a', 'C2b'];
    out.forEach((o, idx) => (o.scenario = labels[idx]));

    const target = resolve(__dirname, '../../../../scratchpad/on-partj-regen/regenerated-issues.json');
    if (!existsSync(dirname(target))) mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify({ companyId: COMPANY_ID, bankAccountId: ON_BANK_ACCOUNT_ID, statementDate: ON_STATEMENT_DATE, issues: out }, null, 2));

    console.log(`\n[P2.3] wrote ${out.length} regenerated issue drafts to ${target}\n` + JSON.stringify(out, null, 2));
  });
});
