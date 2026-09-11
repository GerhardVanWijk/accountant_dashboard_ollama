import type { Account, LeaseContract } from '@/types';
import type { JournalEntryService } from '@/features/accounting/services';
import { round2 } from './leaseCalculations';

/** Half a cent — floating-point tolerance, not a real discrepancy. Same tolerance as assetRegisterReconciliationService.ts. */
const VARIANCE_EPSILON = 0.005;

export interface LeaseGlAccountLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  /** Sum across the lease register of leases mapped to this account. */
  registerAmount: number;
  /** Posted GL balance of the account (in its normal-balance direction). */
  glBalance: number;
  /** registerAmount − glBalance. */
  variance: number;
  status: 'matched' | 'review';
}

export interface LeaseRegisterReconciliation {
  /** Right-of-Use asset cost (acc 1700). */
  rouCost: LeaseGlAccountLine | null;
  /** Accumulated depreciation — ROU (acc 1790). */
  accumulatedDepreciation: LeaseGlAccountLine | null;
  /** Lease liability (acc 2450). */
  leaseLiability: LeaseGlAccountLine | null;
  totals: {
    registerRouCost: number;
    glRouCost: number;
    registerAccumulatedDepreciation: number;
    glAccumulatedDepreciation: number;
    registerLeaseLiability: number;
    glLeaseLiability: number;
    rouCostVariance: number;
    accumulatedDepreciationVariance: number;
    leaseLiabilityVariance: number;
  };
  isReconciled: boolean;
}

/** Leases that carry a GL balance: commenced and not yet terminated (mirrors assetRegisterReconciliationService.ts's isOnBooks). */
function isOnBooks(lease: LeaseContract): boolean {
  return lease.status === 'active';
}

async function accountLine(
  journalEntryService: Pick<JournalEntryService, 'getAccountLedger'>,
  account: Account,
  registerAmount: number,
): Promise<LeaseGlAccountLine> {
  const rows = await journalEntryService.getAccountLedger(account.id);
  const glBalance = rows.length > 0 ? round2(rows[rows.length - 1].runningBalance) : 0;
  const variance = round2(registerAmount - glBalance);
  return {
    accountId: account.id,
    accountCode: account.code,
    accountName: account.name,
    registerAmount: round2(registerAmount),
    glBalance,
    variance,
    status: Math.abs(variance) <= VARIANCE_EPSILON ? 'matched' : 'review',
  };
}

/**
 * Reconciles the Lease Register to the General Ledger
 * (SA_ACCOUNTING_MASTER_SPEC.md §32/§47 applied to leases — see PART 1.14 of
 * the Leases + Payroll integrity audit). Every lease posts against the same
 * three semantic accounts (RIGHT_OF_USE_ASSET / ACCUMULATED_DEPRECIATION_ROU
 * / LEASE_LIABILITY via accountMappingService — there is no per-lease
 * account mapping the way Fixed Assets has per-asset gl*AccountId fields),
 * so this compares three single totals rather than iterating a map of
 * accounts the way assetRegisterReconciliationService.ts does. Draft leases
 * (not yet commenced) and terminated leases (derecognized) are excluded —
 * they carry no GL balance. Nothing is auto-corrected: a non-zero variance
 * is surfaced for a human to investigate, never balanced away with a
 * journal.
 */
export async function reconcileLeaseRegisterToGl(
  journalEntryService: Pick<JournalEntryService, 'getAccountLedger'>,
  leases: LeaseContract[],
  accounts: Account[],
): Promise<LeaseRegisterReconciliation> {
  const accountByCode = new Map(accounts.map((a) => [a.code, a]));
  const onBooks = leases.filter(isOnBooks);

  const registerRouCost = round2(onBooks.reduce((s, l) => s + l.initialRightOfUseAsset, 0));
  const registerAccumulatedDepreciation = round2(onBooks.reduce((s, l) => s + l.accumulatedDepreciation, 0));
  const registerLeaseLiability = round2(onBooks.reduce((s, l) => s + l.outstandingLeaseLiability, 0));

  const rouAccount = accountByCode.get('1700');
  const accumDepAccount = accountByCode.get('1790');
  const liabilityAccount = accountByCode.get('2450');

  const rouCost = rouAccount ? await accountLine(journalEntryService, rouAccount, registerRouCost) : null;
  const accumulatedDepreciation = accumDepAccount ? await accountLine(journalEntryService, accumDepAccount, registerAccumulatedDepreciation) : null;
  const leaseLiability = liabilityAccount ? await accountLine(journalEntryService, liabilityAccount, registerLeaseLiability) : null;

  const glRouCost = rouCost?.glBalance ?? 0;
  const glAccumulatedDepreciation = accumulatedDepreciation?.glBalance ?? 0;
  const glLeaseLiability = leaseLiability?.glBalance ?? 0;

  const rouCostVariance = round2(registerRouCost - glRouCost);
  const accumulatedDepreciationVariance = round2(registerAccumulatedDepreciation - glAccumulatedDepreciation);
  const leaseLiabilityVariance = round2(registerLeaseLiability - glLeaseLiability);

  return {
    rouCost,
    accumulatedDepreciation,
    leaseLiability,
    totals: {
      registerRouCost,
      glRouCost,
      registerAccumulatedDepreciation,
      glAccumulatedDepreciation,
      registerLeaseLiability,
      glLeaseLiability,
      rouCostVariance,
      accumulatedDepreciationVariance,
      leaseLiabilityVariance,
    },
    isReconciled:
      // Missing accounts (Chart of Accounts not yet set up) are a setup
      // problem, not a reconciled state — never silently pass.
      rouCost !== null &&
      accumulatedDepreciation !== null &&
      leaseLiability !== null &&
      Math.abs(rouCostVariance) <= VARIANCE_EPSILON &&
      Math.abs(accumulatedDepreciationVariance) <= VARIANCE_EPSILON &&
      Math.abs(leaseLiabilityVariance) <= VARIANCE_EPSILON,
  };
}
