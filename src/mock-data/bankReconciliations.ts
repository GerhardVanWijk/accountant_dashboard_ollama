import type { BankReconciliation } from '@/features/banking/types';

/**
 * One historical finalized reconciliation for bank_fnb_current covering
 * July 2026 (matches btx_0001–btx_0004 in src/mock-data/bankTransactions.ts,
 * all already `status: 'reconciled'` with `reconciliationId: 'recon_0001'`).
 * Demonstrates the immutable reconciliation-history list on
 * BankReconciliationPage without requiring the user to finalize one first.
 *
 * GL cashbook balance = opening balance (150000) + signed July transactions
 * = 150000 + 23000 − 18500 − 195 + 312.40 = 154617.40, matched exactly by
 * the statement balance, so variance is 0 — a legitimately closable period.
 */
export const seedBankReconciliations: BankReconciliation[] = [
  {
    id: 'recon_0001',
    bankAccountId: 'bank_fnb_current',
    statementDate: '2026-07-31T00:00:00.000Z',
    statementBalance: 154617.4,
    glCashbookBalance: 154617.4,
    adjustedBankBalance: 154617.4,
    variance: 0,
    clearedTransactionIds: ['btx_0001', 'btx_0002', 'btx_0003', 'btx_0004'],
    unpresentedTransactionIds: [],
    unclearedDepositIds: [],
    finalizedAt: '2026-07-31T16:00:00.000Z',
    finalizedByUserId: 'system',
    notes: 'July 2026 month-end reconciliation — all items cleared, no outstanding items.',
    createdAt: '2026-07-31T16:00:00.000Z',
    updatedAt: '2026-07-31T16:00:00.000Z',
  },
];
