import type { BankAccount, JournalEntry } from '@/types';
import type { BankTransactionWithAllocations } from '@/features/banking/types';

/**
 * A realistic single-account, single-month bank reconciliation scenario
 * (docs/CURRENT_TASKS.md #18–#21) with a set of deliberately-seeded faults
 * for the Difference Investigator to find.
 *
 * Pure data — no persistence, no side effects.
 *
 * SCOPE (user decision, 2026-08-27): this is a TEST FIXTURE / dev helper
 * ONLY. It must NOT be inserted into the live single-tenant Supabase
 * database, and there must be NO production "Seed demo data" button wired
 * to it. Its sole consumer is `demoReconciliationScenario.test.ts`, which
 * runs the REAL `ReconciliationInvestigatorService` over it and asserts
 * every seeded fault is detected. If a local/dev seed is ever wanted, it
 * belongs behind an explicit dev-only guard, never shipped.
 *
 * Model reminder (see reconciliationIntelligence/utils/candidates.ts):
 *   bank side  = BankTransaction rows with `source: 'import'`
 *   books side = `source: 'manual' | 'transfer'` rows + journal lines
 *                posted straight to the bank GL account with no
 *                BankTransaction behind them.
 */

export const DEMO_BANK_GL_ACCOUNT_ID = 'gl_bank_1000';
export const DEMO_BANK_ACCOUNT_ID = 'demo_bank_fnb';
export const DEMO_STATEMENT_DATE = '2026-08-31';
export const DEMO_OPENING_BALANCE = 100_000;

let seq = 0;
const nextId = (p: string) => `${p}_${String(++seq).padStart(3, '0')}`;

function resetSeq() {
  seq = 0;
}

interface Txn {
  date: string;
  description: string;
  amount: number;
  direction: 'debit' | 'credit';
  source: 'import' | 'manual' | 'transfer';
  reference?: string;
  bankAccountId?: string;
  allocations?: BankTransactionWithAllocations['allocations'];
  status?: BankTransactionWithAllocations['status'];
}

function txn(t: Txn): BankTransactionWithAllocations {
  const id = nextId('demotx');
  return {
    id,
    createdAt: `${t.date}T09:00:00.000Z`,
    updatedAt: `${t.date}T09:00:00.000Z`,
    bankAccountId: t.bankAccountId ?? DEMO_BANK_ACCOUNT_ID,
    date: t.date,
    description: t.description,
    reference: t.reference,
    amount: t.amount,
    direction: t.direction,
    status: t.status ?? 'unreconciled',
    source: t.source,
    allocations: t.allocations ?? [],
  };
}

/** A journal entry posted straight to the bank GL account, no BankTransaction — an "orphaned ledger" candidate. */
function orphanJournal(date: string, entryNumber: string, memo: string, bankDelta: number): JournalEntry {
  const abs = Math.abs(bankDelta);
  return {
    id: nextId('demoje'),
    createdAt: `${date}T09:00:00.000Z`,
    updatedAt: `${date}T09:00:00.000Z`,
    entryNumber,
    date,
    memo,
    status: 'posted',
    source: 'manual',
    lines: [
      { id: nextId('demojl'), accountId: DEMO_BANK_GL_ACCOUNT_ID, description: memo, debit: bankDelta > 0 ? abs : 0, credit: bankDelta < 0 ? abs : 0 },
      { id: nextId('demojl'), accountId: 'gl_suspense_9999', description: memo, debit: bankDelta < 0 ? abs : 0, credit: bankDelta > 0 ? abs : 0 },
    ],
  };
}

export interface DemoScenario {
  bankAccount: BankAccount;
  bankTransactions: BankTransactionWithAllocations[];
  journalEntries: JournalEntry[];
  /** The unexplained R gap computeSummary() would report for this scenario. */
  expectedVariance: number;
  /** What a correct investigation should surface. */
  expectedFaults: {
    cleanExactMatches: number;
    dateOffsetMatches: number;
    oneToManyDeposit: { bankAmount: number; parts: number };
    missingBankCharge: number;
    interestReceived: number;
    amountMismatch: { books: number; bank: number; delta: number };
    duplicatePosting: number;
    wrongSign: number;
    wrongBankAccount: number;
    outstandingPayment: number;
    outstandingDeposit: number;
    vatSensitive: number;
    pairCombination: number[];
    tripleCombination: number[];
  };
}

/**
 * Builds the scenario. `otherBankAccountId` is where the "wrong bank
 * account" fault's books entry actually landed (a different real account).
 */
export function buildDemoReconciliationScenario(otherBankAccountId = 'demo_bank_absa'): DemoScenario {
  resetSeq();
  const D = (day: number) => `2026-08-${String(day).padStart(2, '0')}`;

  const bankTransactions: BankTransactionWithAllocations[] = [];
  const journalEntries: JournalEntry[] = [];
  const alloc = (glAccountId: string, net: number) => [
    { id: nextId('demoal'), glAccountId, description: 'Auto', netAmount: net, taxAmount: 0 },
  ];

  // --- 10 clean exact matches (bank import + manual books row, same date/amount/desc) ---
  const cleanPairs = [
    { day: 2, desc: 'Customer receipt — Blue Ridge Traders', amt: 8_400, dir: 'debit' as const },
    { day: 3, desc: 'Customer receipt — Cape Fittings', amt: 5_250, dir: 'debit' as const },
    { day: 4, desc: 'EFT — Acme Supplies', amt: 3_100, dir: 'credit' as const },
    { day: 6, desc: 'Customer receipt — Table Bay Co', amt: 12_000, dir: 'debit' as const },
    { day: 8, desc: 'Salaries EFT batch', amt: 41_800, dir: 'credit' as const },
    { day: 10, desc: 'Customer receipt — Karoo Logistics', amt: 6_750, dir: 'debit' as const },
    { day: 12, desc: 'EFT — Municipality rates', amt: 2_240, dir: 'credit' as const },
    { day: 15, desc: 'Customer receipt — Highveld Retail', amt: 9_900, dir: 'debit' as const },
    { day: 18, desc: 'EFT — Telkom', amt: 1_180, dir: 'credit' as const },
    { day: 22, desc: 'Customer receipt — Sundowner Foods', amt: 7_300, dir: 'debit' as const },
  ];
  for (const p of cleanPairs) {
    bankTransactions.push(txn({ date: D(p.day), description: p.desc, amount: p.amt, direction: p.dir, source: 'import' }));
    bankTransactions.push(
      txn({ date: D(p.day), description: p.desc, amount: p.amt, direction: p.dir, source: 'manual', allocations: alloc(p.dir === 'debit' ? 'gl_ar_1100' : 'gl_expense_5000', p.amt) }),
    );
  }

  // --- 3 date-offset matches (books recorded a day or two before it hit the bank) ---
  const offsetPairs = [
    { bankDay: 5, bookDay: 4, desc: 'Customer receipt — Drakensberg Mills', amt: 4_400 },
    { bankDay: 14, bookDay: 12, desc: 'Customer receipt — Garden Route Supply', amt: 3_650 },
    { bankDay: 25, bookDay: 24, desc: 'Customer receipt — Winelands Bottling', amt: 5_800 },
  ];
  for (const p of offsetPairs) {
    bankTransactions.push(txn({ date: D(p.bankDay), description: p.desc, amount: p.amt, direction: 'debit', source: 'import' }));
    bankTransactions.push(txn({ date: D(p.bookDay), description: p.desc, amount: p.amt, direction: 'debit', source: 'manual', allocations: alloc('gl_ar_1100', p.amt) }));
  }

  // --- one-to-many deposit: R10,000 on the bank, 3 receipts in the books ---
  bankTransactions.push(txn({ date: D(9), description: 'Cash & cheque deposit', amount: 10_000, direction: 'debit', source: 'import' }));
  for (const part of [4_000, 3_500, 2_500]) {
    bankTransactions.push(txn({ date: D(9), description: `Customer receipt — deposit part R${part}`, amount: part, direction: 'debit', source: 'manual', allocations: alloc('gl_ar_1100', part) }));
  }

  // --- FAULT: missing bank charge (on the bank, never entered in the books) ---
  const missingBankCharge = 185.5;
  bankTransactions.push(txn({ date: D(31), description: 'Bank charges — account fees', amount: missingBankCharge, direction: 'credit', source: 'import' }));

  // --- FAULT: interest received (on the bank, never entered in the books) ---
  const interestReceived = 62.1;
  bankTransactions.push(txn({ date: D(31), description: 'Credit interest', amount: interestReceived, direction: 'debit', source: 'import' }));

  // --- FAULT: amount mismatch — books R47.50, bank R47.66, delta R0.16 ---
  bankTransactions.push(txn({ date: D(20), description: 'Card machine settlement fee', amount: 47.66, direction: 'credit', source: 'import' }));
  bankTransactions.push(txn({ date: D(20), description: 'Card machine settlement fee', amount: 47.5, direction: 'credit', source: 'manual', allocations: alloc('gl_expense_5000', 47.5) }));

  // --- FAULT: duplicate posting — one bank line, TWO identical books rows ---
  const dupAmount = 12_000;
  bankTransactions.push(txn({ date: D(1), description: 'EFT — Landlord (rent)', amount: dupAmount, direction: 'credit', source: 'import' }));
  bankTransactions.push(txn({ date: D(1), description: 'EFT — Landlord (rent)', amount: dupAmount, direction: 'credit', source: 'manual', allocations: alloc('gl_expense_5200', dupAmount) }));
  bankTransactions.push(txn({ date: D(1), description: 'EFT — Landlord (rent)', amount: dupAmount, direction: 'credit', source: 'manual', allocations: alloc('gl_expense_5200', dupAmount) }));

  // --- FAULT: wrong sign — bank shows a refund IN, books recorded it OUT ---
  const wrongSign = 900;
  bankTransactions.push(txn({ date: D(16), description: 'Refund from supplier — Acme', amount: wrongSign, direction: 'debit', source: 'import' }));
  bankTransactions.push(txn({ date: D(16), description: 'Refund from supplier — Acme', amount: wrongSign, direction: 'credit', source: 'manual', allocations: alloc('gl_expense_5000', wrongSign) }));

  // --- FAULT: wrong bank account — the books entry landed on ABSA, not this FNB account ---
  const wrongAccount = 3_300;
  bankTransactions.push(txn({ date: D(19), description: 'EFT — Landlord parking bay', amount: wrongAccount, direction: 'credit', source: 'import' }));
  bankTransactions.push(
    txn({ date: D(19), description: 'EFT — Landlord parking bay', amount: wrongAccount, direction: 'credit', source: 'import', bankAccountId: otherBankAccountId }),
  );

  // --- outstanding (timing) items: in the books, not yet on the bank ---
  const outstandingPayment = 2_200;
  bankTransactions.push(txn({ date: D(29), description: 'Cheque 100455 — Supplier payment', amount: outstandingPayment, direction: 'credit', source: 'manual', allocations: alloc('gl_expense_5000', outstandingPayment) }));
  const outstandingDeposit = 1_750;
  bankTransactions.push(txn({ date: D(30), description: 'Deposit in transit — branch', amount: outstandingDeposit, direction: 'debit', source: 'manual', allocations: alloc('gl_ar_1100', outstandingDeposit) }));

  // --- VAT-sensitive: bank R1,150 gross, books split R1,000 net + R150 VAT ---
  const vatSensitive = 1_150;
  bankTransactions.push(txn({ date: D(11), description: 'Office supplies (incl VAT)', amount: vatSensitive, direction: 'credit', source: 'import' }));
  bankTransactions.push(
    txn({
      date: D(11),
      description: 'Office supplies (incl VAT)',
      amount: vatSensitive,
      direction: 'credit',
      source: 'manual',
      allocations: [
        { id: nextId('demoal'), glAccountId: 'gl_expense_5300', description: 'Office supplies', netAmount: 1_000, taxAmount: 150, taxRateId: 'vat_std' },
      ],
    }),
  );

  // --- pair combination: two orphaned journal lines that together explain a chunk ---
  const pairCombination = [320.5, 480.75];
  journalEntries.push(orphanJournal(D(7), 'JNL-D01', 'Petty cash top-up', -pairCombination[0]));
  journalEntries.push(orphanJournal(D(13), 'JNL-D02', 'Sundry expense', -pairCombination[1]));

  // --- triple combination: three orphaned journal lines ---
  const tripleCombination = [150.0, 225.25, 99.9];
  journalEntries.push(orphanJournal(D(17), 'JNL-D03', 'Courier', -tripleCombination[0]));
  journalEntries.push(orphanJournal(D(21), 'JNL-D04', 'Stationery', -tripleCombination[1]));
  journalEntries.push(orphanJournal(D(23), 'JNL-D05', 'Parking', -tripleCombination[2]));

  const bankAccount: BankAccount = {
    id: DEMO_BANK_ACCOUNT_ID,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    name: 'FNB Business Cheque',
    bankName: 'FNB',
    accountNumber: '620110455',
    accountType: 'checking',
    currency: 'ZAR',
    glAccountId: DEMO_BANK_GL_ACCOUNT_ID,
    openingBalance: DEMO_OPENING_BALANCE,
    currentBalance: DEMO_OPENING_BALANCE,
    status: 'active',
  };

  // The unexplained gap = the faults that aren't legitimate timing differences:
  //  missing charge + interest + amount-mismatch delta + one duplicate +
  //  wrong-sign (double, since it's booked the wrong way) + wrong-account +
  //  the pair and triple combinations. (Outstanding payment/deposit and the
  //  one-to-many deposit are NOT variance — they reconcile.)
  const amountMismatchDelta = 0.16;
  const expectedVariance =
    -missingBankCharge -
    (-interestReceived) - // interest is money IN not yet booked
    amountMismatchDelta +
    dupAmount + // one extra credit in the books
    2 * wrongSign +
    wrongAccount +
    pairCombination.reduce((a, b) => a + b, 0) +
    tripleCombination.reduce((a, b) => a + b, 0);

  return {
    bankAccount,
    bankTransactions,
    journalEntries,
    expectedVariance: Math.round(expectedVariance * 100) / 100,
    expectedFaults: {
      cleanExactMatches: cleanPairs.length,
      dateOffsetMatches: offsetPairs.length,
      oneToManyDeposit: { bankAmount: 10_000, parts: 3 },
      missingBankCharge,
      interestReceived,
      amountMismatch: { books: 47.5, bank: 47.66, delta: amountMismatchDelta },
      duplicatePosting: dupAmount,
      wrongSign,
      wrongBankAccount: wrongAccount,
      outstandingPayment,
      outstandingDeposit,
      vatSensitive,
      pairCombination,
      tripleCombination,
    },
  };
}
