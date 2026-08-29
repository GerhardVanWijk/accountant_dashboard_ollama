import type { BankAccount, JournalEntry } from '@/types';
import type { BankTransactionWithAllocations } from '@/features/banking/types';

/**
 * Office National Demo (Pty) Ltd — company id 676c6cda-2e67-4ee3-8aaa-249b2c6bbc01.
 *
 * A REAL-DATA fixture (Agent 7 / QA, Phase 19 of docs/OFFICE_NATIONAL_DEMO_TASKS.md):
 * every id, date, amount and description below is copied verbatim from
 * `docs/OFFICE_NATIONAL_RECON_EXPECTATIONS.md` and cross-checked against the live
 * `bank_transactions` rows in Supabase (queried via the Supabase MCP,
 * 2026-08-28) — nothing here is invented. The bank_transaction UUIDs are the
 * REAL row ids from that table, kept as `id`/`reference` so a reader can trace
 * every fixture item back to the live database.
 *
 * WHY this isn't a literal dump of the raw table: the live seed was built by
 * hand via SQL (no service-role key / admin@demo.com password was available —
 * see docs/OFFICE_NATIONAL_DEMO_TASKS.md "Known issues"), and Agent 5 used
 * `source='manual'` for nearly every row (even the ones that represent "what
 * the bank statement shows"), with `status` set directly rather than computed
 * by this investigator. The ReconciliationInvestigatorService's own candidate
 * model (utils/candidates.ts) instead expects TWO sides: `source='import'` for
 * the bank's own version of a line, and `source='manual'|'transfer'` (or an
 * orphaned journal entry) for the books' version — it PAIRS them itself. This
 * fixture reconstructs that two-sided shape (exactly the pattern
 * demoReconciliationScenario.ts already uses) so the real detector code can be
 * run over it, while keeping every amount/date/description tied to the real
 * seeded scenario. This mirrors the project's existing, accepted pattern
 * (testFixtures/demoReconciliationScenario.ts) — a hand-built fixture using
 * REAL numbers, not a live round-trip through Supabase (which this
 * environment cannot do — no service-role key, no admin@demo.com password).
 *
 * Clean-match volume (check #19, "≥25 reconciled") is intentionally NOT
 * reproduced here — it adds no detector coverage and the exact dates for all
 * 81 real rows aren't itemised in the expectations doc. It is proven instead
 * by Track 2 (a live SQL count) in docs/OFFICE_NATIONAL_REGRESSION_EVIDENCE.md.
 * Likewise C8 (wrong-account) is deliberately excluded — the expectations doc
 * (and the build spec) are explicit that it is a GL/Books-Integrity finding,
 * not a bank-reconciliation one; no `reconciliation_issues` row was created
 * for it, and this fixture doesn't fabricate a bank-detector case for it.
 */

export const ON_BANK_ACCOUNT_ID = '2fb81a17-92b6-4936-9925-456a73a91cd1'; // real bank_accounts.id
export const ON_BANK_GL_ACCOUNT_ID = 'on_gl_1000_cash_and_bank';
export const ON_STATEMENT_DATE = '2026-08-31';
export const ON_OPENING_BALANCE = 350_000.0; // real bank_accounts.opening_balance

function txn(t: {
  id: string;
  date: string;
  description: string;
  amount: number;
  direction: 'debit' | 'credit';
  source: 'import' | 'manual' | 'transfer';
  reference?: string;
  status?: BankTransactionWithAllocations['status'];
}): BankTransactionWithAllocations {
  return {
    id: t.id,
    createdAt: `${t.date}T09:00:00.000Z`,
    updatedAt: `${t.date}T09:00:00.000Z`,
    bankAccountId: ON_BANK_ACCOUNT_ID,
    date: t.date,
    description: t.description,
    reference: t.reference,
    amount: t.amount,
    direction: t.direction,
    status: t.status ?? 'unreconciled',
    source: t.source,
    allocations: [],
  };
}

export interface OfficeNationalScenario {
  bankAccount: BankAccount;
  bankTransactions: BankTransactionWithAllocations[];
  /** Always empty here — every books-side item in this scenario is a BankTransaction row, not an orphaned journal entry. Kept for interface parity with ReconciliationInvestigatorService's JournalEntryLookup. */
  journalEntries: JournalEntry[];
  realIds: {
    payOutstandingPayment: string; // PAY-2004
    recOutstandingDeposit: string; // REC-1001
    payDateOffset: string; // PAY-2007
    duplicateRealBankRow: string; // PAY-2220's one real bank row
  };
}

/**
 * Builds the 9 real reconciliation scenarios from
 * docs/OFFICE_NATIONAL_RECON_EXPECTATIONS.md that the Difference Investigator
 * is expected to detect: C2a/C2b (outstanding payment/deposit), C2c (date
 * offset), C3 (R0.16 mismatch), C4 (missing R185.50 charge), C5 (R62.10
 * interest), C6 (duplicate R4,600.00), C7 (wrong-sign R1,834.30), C9
 * (one-to-many R25,000.00 deposit), C10 (many-to-one R3,000.00 debit order),
 * C11 (pair combination R405.40) and C12 (triple combination R225.25).
 */
export function buildOfficeNationalReconciliationScenario(): OfficeNationalScenario {
  const bankTransactions: BankTransactionWithAllocations[] = [];

  // --- C2a: outstanding payment — PAY-2004 / JE-2045, R46,041.29, dated 2026-08-28.
  // Real bank leg is dated 2026-09-01 (outside the Aug statement window) — deliberately
  // NOT included here, so this stays a books-only candidate as of 31 Aug, same as real life.
  bankTransactions.push(
    txn({
      id: 'd5de1a6c-3e42-4506-a41c-a881cbcfe9e9', // JE-2045's id, reused as the books-side fixture id
      date: '2026-08-28',
      description: 'PAY-2004 - supplier payment',
      amount: 46_041.29,
      direction: 'credit',
      source: 'manual',
      reference: 'PAY-2004',
    }),
  );

  // --- C2b: outstanding deposit — REC-1001 / JE-1059, R2,295.29, dated 2026-08-30.
  // Real bank leg dated 2026-09-01 — likewise omitted (outside window).
  bankTransactions.push(
    txn({
      id: 'd3b5fd25-5cd6-45c0-9533-f9d081beb5e3', // JE-1059's id
      date: '2026-08-30',
      description: 'Customer receipt REC-1001',
      amount: 2_295.29,
      direction: 'debit',
      source: 'manual',
      reference: 'REC-1001',
    }),
  );

  // --- C2c: date-offset timing — PAY-2007 / JE-2048, R10,157.95, book 2026-08-25, bank 2026-08-27.
  bankTransactions.push(
    txn({
      id: 'c218514e-48dd-41a0-89d7-89656240f02c', // JE-2048's id
      date: '2026-08-25',
      description: 'PAY-2007 - supplier payment',
      amount: 10_157.95,
      direction: 'credit',
      source: 'manual',
      reference: 'PAY-2007',
    }),
  );
  bankTransactions.push(
    txn({
      id: 'on-bank-c2c-statement-leg',
      date: '2026-08-27',
      description: 'PAY-2007 - supplier payment',
      amount: 10_157.95,
      direction: 'credit',
      source: 'import',
      reference: 'PAY-2007',
    }),
  );

  // --- C3: R0.16 amount mismatch — books JE-3001 R47.50 (2026-08-19) vs bank statement
  // row edf796c4-... R47.66 (real id, same date, same JE-3001 reference).
  bankTransactions.push(
    txn({
      id: 'on-bank-c3-books-leg',
      date: '2026-08-19',
      description: 'Bank charges - August service fee',
      amount: 47.5,
      direction: 'credit',
      source: 'manual',
      reference: 'JE-3001',
    }),
  );
  bankTransactions.push(
    txn({
      id: 'edf796c4-87a1-40b2-a3cb-8907f7c5d6f5', // real bank_transactions.id
      date: '2026-08-19',
      description: 'Bank charges - August service fee',
      amount: 47.66,
      direction: 'credit',
      source: 'import',
      reference: 'JE-3001',
    }),
  );

  // --- C4: missing bank charge R185.50 — bank-only, real id, 2026-08-22, "Cash handling fee".
  bankTransactions.push(
    txn({
      id: '046d81c4-0bdf-45f5-a0c0-bc9bc2f74d38', // real bank_transactions.id
      date: '2026-08-22',
      description: 'Cash handling fee',
      amount: 185.5,
      direction: 'credit',
      source: 'import',
      reference: 'ONBANK-0186',
    }),
  );

  // --- C5: interest received R62.10 — bank-only, real id, 2026-08-29, "Interest Received".
  bankTransactions.push(
    txn({
      id: '5d280d57-2109-4b26-8a24-9c93a65f7a92', // real bank_transactions.id
      date: '2026-08-29',
      description: 'Interest Received',
      amount: 62.1,
      direction: 'debit',
      source: 'import',
      reference: 'ONBANK-0062',
    }),
  );

  // --- C6: duplicate posting — PAY-2220, R4,600.00, 2026-08-22. Bank shows it ONCE
  // (real id 539ca37d-...); books contain it TWICE (JE-2063 real + JE-2064 duplicate).
  bankTransactions.push(
    txn({
      id: '539ca37d-dea1-43df-b3e7-67ad6e53580f', // real bank_transactions.id
      date: '2026-08-22',
      description: 'PAY-2220 - supplier payment',
      amount: 4_600.0,
      direction: 'credit',
      source: 'import',
      reference: 'PAY-2220',
    }),
  );
  bankTransactions.push(
    txn({
      id: '283cca35-9321-4b61-9502-8fe2ef431d71', // JE-2063's id (the real leg)
      date: '2026-08-22',
      description: 'PAY-2220 - supplier payment',
      amount: 4_600.0,
      direction: 'credit',
      source: 'manual',
      reference: 'PAY-2220',
    }),
  );
  bankTransactions.push(
    txn({
      id: '58666e95-7939-4f64-a23d-1767cb90c987', // JE-2064's id (the duplicate)
      date: '2026-08-22',
      description: 'PAY-2220 - supplier payment',
      amount: 4_600.0,
      direction: 'credit',
      source: 'manual',
      reference: 'PAY-2220',
    }),
  );

  // --- C7: wrong sign — REC-1020 / JE-1078, R1,834.30, 2026-08-16. The books entry is a
  // genuine inflow (debit); the bank statement captured it as an outflow (credit).
  bankTransactions.push(
    txn({
      id: '7537d664-7738-44e7-affb-9be18c9a2b38', // JE-1078's id
      date: '2026-08-16',
      description: 'Customer receipt REC-1020',
      amount: 1_834.3,
      direction: 'debit', // correct direction, per the books
      source: 'manual',
      reference: 'REC-1020',
    }),
  );
  bankTransactions.push(
    txn({
      id: '64f28fa4-740a-4b60-a6c5-fc90ae1636c5', // real bank_transactions.id
      date: '2026-08-16',
      description: 'recon: WRONG-SIGN test case - REC-1020 posted as outflow',
      amount: 1_834.3,
      direction: 'credit', // wrong direction, per the bank statement
      source: 'import',
      reference: 'REC-1020',
    }),
  );

  // --- C9: one-to-many — REC-1201 (12,000) + REC-1202 (8,000) + REC-1203 (5,000),
  // all dated 2026-08-18, sum to ONE bank deposit of R25,000.00 dated 2026-08-19.
  bankTransactions.push(
    txn({
      id: '0b567a16-3771-49b1-8807-769f3b1331a8', // REC-1201's id
      date: '2026-08-18',
      description: 'Customer receipt REC-1201',
      amount: 12_000.0,
      direction: 'debit',
      source: 'manual',
      reference: 'REC-1201',
    }),
  );
  bankTransactions.push(
    txn({
      id: '54e9f48e-fdde-4029-8a72-8e2bcfacb33c', // REC-1202's id
      date: '2026-08-18',
      description: 'Customer receipt REC-1202',
      amount: 8_000.0,
      direction: 'debit',
      source: 'manual',
      reference: 'REC-1202',
    }),
  );
  bankTransactions.push(
    txn({
      id: 'fbfa57aa-cafb-4f9b-af35-541a7d876742', // REC-1203's id
      date: '2026-08-18',
      description: 'Customer receipt REC-1203',
      amount: 5_000.0,
      direction: 'debit',
      source: 'manual',
      reference: 'REC-1203',
    }),
  );
  bankTransactions.push(
    txn({
      id: '893af4b5-bf60-4f90-9f0c-50e3d6b483a8', // real bank_transactions.id
      date: '2026-08-19',
      description: 'Cash/EFT deposit batch',
      amount: 25_000.0,
      direction: 'debit',
      source: 'import',
      reference: 'ONBANK-2500',
    }),
  );

  // --- C10: many-to-one — PAY-2210 (1,300) + PAY-2211 (1,700), both dated 2026-08-20,
  // sum to ONE bank debit order of R3,000.00, same date.
  bankTransactions.push(
    txn({
      id: '6e8ca3af-0ba6-49a9-98af-9a398421c10b', // PAY-2210's id
      date: '2026-08-20',
      description: 'Supplier payment PAY-2210',
      amount: 1_300.0,
      direction: 'credit',
      source: 'manual',
      reference: 'PAY-2210',
    }),
  );
  bankTransactions.push(
    txn({
      id: 'edeac12d-0939-4897-b9aa-63fb8ade6e51', // PAY-2211's id
      date: '2026-08-20',
      description: 'Supplier payment PAY-2211',
      amount: 1_700.0,
      direction: 'credit',
      source: 'manual',
      reference: 'PAY-2211',
    }),
  );
  bankTransactions.push(
    txn({
      id: '4c2d9bd8-43cf-4d3b-81c6-080a46a0a80d', // real bank_transactions.id
      date: '2026-08-20',
      description: 'Debit order - supplier consolidated',
      amount: 3_000.0,
      direction: 'credit',
      source: 'import',
      reference: 'ONBANK-3000',
    }),
  );

  // --- C11: pair combination — R95.00 + R310.40 = R405.40, two bank-only lines, no book entry.
  bankTransactions.push(
    txn({
      id: 'e40148ed-0ac7-45de-8109-ebe87a442cf1', // real bank_transactions.id
      date: '2026-08-08',
      description: 'Card machine rental fee',
      amount: 95.0,
      direction: 'credit',
      source: 'import',
      reference: 'ONBANK-0095',
    }),
  );
  bankTransactions.push(
    txn({
      id: 'b22fb879-b299-4ee2-bea3-ae4953797f2e', // real bank_transactions.id
      date: '2026-08-09',
      description: 'SMS notification fee',
      amount: 310.4,
      direction: 'credit',
      source: 'import',
      reference: 'ONBANK-0310',
    }),
  );

  // --- C12: triple combination — R42.00 + R118.50 + R64.75 = R225.25, three bank-only lines.
  bankTransactions.push(
    txn({
      id: '90c710d7-4427-4e90-8b1d-374581c6b3f6', // real bank_transactions.id
      date: '2026-08-11',
      description: 'Electronic statement fee',
      amount: 42.0,
      direction: 'credit',
      source: 'import',
      reference: 'ONBANK-0042',
    }),
  );
  bankTransactions.push(
    txn({
      id: '127e139a-c05f-42e4-8de0-06e7458af499', // real bank_transactions.id
      date: '2026-08-12',
      description: 'ATM withdrawal fee',
      amount: 118.5,
      direction: 'credit',
      source: 'import',
      reference: 'ONBANK-0118',
    }),
  );
  bankTransactions.push(
    txn({
      id: '7820bfcc-9135-4c0a-8992-e732691e1565', // real bank_transactions.id
      date: '2026-08-13',
      description: 'Faster payment fee',
      amount: 64.75,
      direction: 'credit',
      source: 'import',
      reference: 'ONBANK-0064',
    }),
  );

  const bankAccount: BankAccount = {
    id: ON_BANK_ACCOUNT_ID,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
    name: 'Office National Business Cheque',
    bankName: 'FNB',
    accountNumber: '62884471059',
    accountType: 'checking',
    currency: 'ZAR',
    glAccountId: ON_BANK_GL_ACCOUNT_ID,
    openingBalance: ON_OPENING_BALANCE,
    currentBalance: 212_270.67, // real GL 1000 balance per docs/OFFICE_NATIONAL_RECON_EXPECTATIONS.md
    status: 'active',
  };

  return {
    bankAccount,
    bankTransactions,
    journalEntries: [],
    realIds: {
      payOutstandingPayment: 'd5de1a6c-3e42-4506-a41c-a881cbcfe9e9',
      recOutstandingDeposit: 'd3b5fd25-5cd6-45c0-9533-f9d081beb5e3',
      payDateOffset: 'c218514e-48dd-41a0-89d7-89656240f02c',
      duplicateRealBankRow: '539ca37d-dea1-43df-b3e7-67ad6e53580f',
    },
  };
}
