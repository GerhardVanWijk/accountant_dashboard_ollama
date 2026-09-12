import type { EclComputation, ID } from '@/types';
import type { JournalEntryService, LedgerRow } from '@/features/accounting/services/journalEntryService';
import type { AccountMapper } from '@/features/accounting/services';

/** Half a rand — tolerance for floating-point rounding, not a real discrepancy. Same convention as vatReportService.ts's VAT_VARIANCE_EPSILON. */
const VARIANCE_EPSILON = 0.005;

export interface EclControlAccountCheck {
  controlAccountId: ID;
  /** The posted schedule's own recorded total, as of the computation's asOfDate — never re-derived from the GL. */
  expectedAllowance: number;
  /** The account's real GL balance, as of the SAME asOfDate. */
  glAllowance: number;
  variance: number;
  isReconciled: boolean;
}

export interface EclReconciliation {
  asOfDate: string;
  allowance: EclControlAccountCheck;
}

/** The ledger's balance as of a given date — same helper as deferredTaxReconciliationService.ts's balanceAsOf(). */
function balanceAsOf(rows: LedgerRow[], asOfDate: string): number {
  const cutoff = new Date(asOfDate).getTime();
  let balance = 0;
  for (const row of rows) {
    if (new Date(row.date).getTime() > cutoff) break;
    balance = row.runningBalance;
  }
  return balance;
}

/**
 * ECL Allowance Schedule <-> GL reconciliation (Tax & Compliance integrity
 * audit continuation, 2026-09-12, §7). Independently compares the LATEST
 * POSTED `EclComputation`'s own recorded `totalExpectedCreditLoss` (real
 * provision-matrix math over the Customer Aging Report — never re-derived
 * here) against the actual GL balance of the Allowance for Doubtful Debts
 * account AS OF THE SAME `asOfDate`. A variance means a journal touched
 * the allowance account that the schedule doesn't account for — including
 * a directly-tampered/manually-posted entry, since the GL side is read
 * independently from real ledger rows.
 *
 * ONLY call this for a POSTED computation — same "never falsely mark a
 * draft/unposted schedule reconciled" rule as
 * deferredTaxReconciliationService.reconcileDeferredTaxToGl().
 */
export async function reconcileEclToGl(
  journalEntryService: Pick<JournalEntryService, 'getAccountLedger'>,
  accounts: AccountMapper,
  computation: Pick<EclComputation, 'asOfDate' | 'totalExpectedCreditLoss' | 'status'>,
): Promise<EclReconciliation> {
  if (computation.status !== 'posted') {
    throw new Error('reconcileEclToGl: only a posted computation has real GL activity to reconcile against.');
  }

  const allowanceAccountId = await accounts.getAccountId('ALLOWANCE_FOR_DOUBTFUL_DEBTS');
  const allowanceRows = await journalEntryService.getAccountLedger(allowanceAccountId);
  const glAllowance = balanceAsOf(allowanceRows, computation.asOfDate);
  const variance = glAllowance - computation.totalExpectedCreditLoss;

  return {
    asOfDate: computation.asOfDate,
    allowance: {
      controlAccountId: allowanceAccountId,
      expectedAllowance: computation.totalExpectedCreditLoss,
      glAllowance,
      variance,
      isReconciled: Math.abs(variance) <= VARIANCE_EPSILON,
    },
  };
}
