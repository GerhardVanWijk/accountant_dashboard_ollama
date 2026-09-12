import type { DeferredTaxComputation, ID } from '@/types';
import type { JournalEntryService, LedgerRow } from '@/features/accounting/services/journalEntryService';
import type { AccountMapper } from '@/features/accounting/services';

/** Half a rand — tolerance for floating-point rounding, not a real discrepancy. Same convention as vatReportService.ts's VAT_VARIANCE_EPSILON. */
const VARIANCE_EPSILON = 0.005;

export interface DeferredTaxControlAccountCheck {
  controlAccountId: ID;
  /** The posted schedule's own recorded total, as of the computation's asOfDate — never re-derived from the GL. */
  scheduleAmount: number;
  /** The account's real GL balance, as of the SAME asOfDate (the last ledger row on or before it, in the account's own normal-balance direction). */
  glAmount: number;
  variance: number;
  isReconciled: boolean;
}

export interface DeferredTaxReconciliation {
  asOfDate: string;
  deferredTaxLiability: DeferredTaxControlAccountCheck;
  deferredTaxAsset: DeferredTaxControlAccountCheck;
}

/**
 * The ledger's balance as of a given date — the LAST row's runningBalance
 * whose date is on or before `asOfDate` (0 if no such row exists).
 * `getAccountLedger()` already computes runningBalance in the account's
 * own normal-balance direction (see its doc comment), so this is a real
 * point-in-time balance-sheet position, not a period movement — the right
 * comparison for Deferred Tax, which IS a balance-sheet position (§50),
 * unlike VAT/Dividends Tax control accounts, which are period-flow
 * reconciliations.
 */
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
 * Deferred Tax Schedule <-> GL reconciliation (Tax & Compliance integrity
 * audit continuation, 2026-09-12, §5). Independently compares the LATEST
 * POSTED `DeferredTaxComputation`'s own recorded totals
 * (totalDeferredTaxLiability/totalDeferredTaxAsset — real IAS 12
 * temporary-difference math, never re-derived here) against the actual
 * GL balance of the Deferred Tax Liability / Deferred Tax Asset accounts
 * AS OF THE SAME `asOfDate`. A variance means a journal touched one of
 * these accounts that the schedule doesn't account for — including a
 * directly-tampered or manually-posted entry, since the GL side is read
 * independently from real ledger rows, never assumed to match the
 * schedule.
 *
 * ONLY call this for a POSTED computation — an unposted draft has posted
 * nothing to the GL, so there is nothing genuine to compare it against.
 * Callers must not synthesize a "reconciled" status for a draft; the
 * absence of a reconciliation result for a draft IS the honest answer
 * (see class doc comment's "do not falsely mark a computation reconciled
 * just because it was successfully posted" — the inverse case matters
 * just as much: never mark an UNPOSTED one reconciled either).
 */
export async function reconcileDeferredTaxToGl(
  journalEntryService: Pick<JournalEntryService, 'getAccountLedger'>,
  accounts: AccountMapper,
  computation: Pick<DeferredTaxComputation, 'asOfDate' | 'totalDeferredTaxLiability' | 'totalDeferredTaxAsset' | 'status'>,
): Promise<DeferredTaxReconciliation> {
  if (computation.status !== 'posted') {
    throw new Error('reconcileDeferredTaxToGl: only a posted computation has real GL activity to reconcile against.');
  }

  const [deferredTaxLiabilityId, deferredTaxAssetId] = await Promise.all([
    accounts.getAccountId('DEFERRED_TAX_LIABILITY'),
    accounts.getAccountId('DEFERRED_TAX_ASSET'),
  ]);
  const [dtlRows, dtaRows] = await Promise.all([
    journalEntryService.getAccountLedger(deferredTaxLiabilityId),
    journalEntryService.getAccountLedger(deferredTaxAssetId),
  ]);

  const dtlGlBalance = balanceAsOf(dtlRows, computation.asOfDate);
  const dtaGlBalance = balanceAsOf(dtaRows, computation.asOfDate);

  const dtlVariance = dtlGlBalance - computation.totalDeferredTaxLiability;
  const dtaVariance = dtaGlBalance - computation.totalDeferredTaxAsset;

  return {
    asOfDate: computation.asOfDate,
    deferredTaxLiability: {
      controlAccountId: deferredTaxLiabilityId,
      scheduleAmount: computation.totalDeferredTaxLiability,
      glAmount: dtlGlBalance,
      variance: dtlVariance,
      isReconciled: Math.abs(dtlVariance) <= VARIANCE_EPSILON,
    },
    deferredTaxAsset: {
      controlAccountId: deferredTaxAssetId,
      scheduleAmount: computation.totalDeferredTaxAsset,
      glAmount: dtaGlBalance,
      variance: dtaVariance,
      isReconciled: Math.abs(dtaVariance) <= VARIANCE_EPSILON,
    },
  };
}
