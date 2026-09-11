import type { Account, FixedAsset, ID } from '@/types';
import type { JournalEntryService } from '@/features/accounting/services';
import { round2 } from './depreciationMath';

/** Half a cent — floating-point tolerance, not a real discrepancy. */
const VARIANCE_EPSILON = 0.005;

export interface AssetGlAccountLine {
  accountId: ID;
  accountCode: string;
  accountName: string;
  /** Sum across the register of the assets mapped to this account. */
  registerAmount: number;
  /** Posted GL balance of the account (in its normal-balance direction). */
  glBalance: number;
  /** registerAmount − glBalance. */
  variance: number;
  status: 'matched' | 'review';
}

export interface AssetRegisterReconciliation {
  /** Cost side — the Fixed Asset (cost) account(s). */
  cost: AssetGlAccountLine[];
  /** Accumulated depreciation account(s). */
  accumulatedDepreciation: AssetGlAccountLine[];
  totals: {
    registerCost: number;
    glCost: number;
    registerAccumulatedDepreciation: number;
    glAccumulatedDepreciation: number;
    registerCarryingValue: number;
    glCarryingValue: number;
    costVariance: number;
    accumulatedDepreciationVariance: number;
    carryingValueVariance: number;
  };
  isReconciled: boolean;
}

/** Assets that carry a GL balance: capitalized and not yet derecognized. */
function isOnBooks(asset: FixedAsset): boolean {
  return asset.status === 'active' || asset.status === 'fully_depreciated';
}

async function accountLine(
  journalEntryService: Pick<JournalEntryService, 'getAccountLedger'>,
  account: Account,
  registerAmount: number,
): Promise<AssetGlAccountLine> {
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
 * Reconciles the Fixed Asset Register to the General Ledger
 * (SA_ACCOUNTING_MASTER_SPEC §17/§70/§71 applied to PPE). For every asset
 * cost account and every accumulated-depreciation account referenced on the
 * register it compares:
 *
 *   Σ register cost (of on-book assets mapped to that account)  vs  GL balance
 *   Σ register accumulated depreciation                         vs  GL balance
 *
 * Draft assets (not yet capitalized) and disposed assets (derecognized) are
 * excluded — they carry no GL balance. Nothing is auto-corrected: a non-zero
 * variance is surfaced for a human to investigate, never balanced away with
 * a journal.
 */
export async function reconcileAssetRegisterToGl(
  journalEntryService: Pick<JournalEntryService, 'getAccountLedger'>,
  assets: FixedAsset[],
  accounts: Account[],
): Promise<AssetRegisterReconciliation> {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const onBooks = assets.filter(isOnBooks);

  const costByAccount = new Map<ID, number>();
  const accumByAccount = new Map<ID, number>();
  for (const asset of onBooks) {
    costByAccount.set(asset.glAssetAccountId, (costByAccount.get(asset.glAssetAccountId) ?? 0) + asset.cost);
    accumByAccount.set(
      asset.glAccumulatedDepreciationAccountId,
      (accumByAccount.get(asset.glAccumulatedDepreciationAccountId) ?? 0) + asset.accumulatedDepreciation,
    );
  }

  const cost: AssetGlAccountLine[] = [];
  for (const [accountId, amount] of costByAccount) {
    const account = accountById.get(accountId);
    if (!account) continue;
    cost.push(await accountLine(journalEntryService, account, amount));
  }
  const accumulatedDepreciation: AssetGlAccountLine[] = [];
  for (const [accountId, amount] of accumByAccount) {
    const account = accountById.get(accountId);
    if (!account) continue;
    accumulatedDepreciation.push(await accountLine(journalEntryService, account, amount));
  }
  cost.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  accumulatedDepreciation.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const registerCost = round2(onBooks.reduce((s, a) => s + a.cost, 0));
  const glCost = round2(cost.reduce((s, l) => s + l.glBalance, 0));
  const registerAccumulatedDepreciation = round2(onBooks.reduce((s, a) => s + a.accumulatedDepreciation, 0));
  const glAccumulatedDepreciation = round2(accumulatedDepreciation.reduce((s, l) => s + l.glBalance, 0));

  const costVariance = round2(registerCost - glCost);
  const accumulatedDepreciationVariance = round2(registerAccumulatedDepreciation - glAccumulatedDepreciation);
  const registerCarryingValue = round2(registerCost - registerAccumulatedDepreciation);
  const glCarryingValue = round2(glCost - glAccumulatedDepreciation);
  const carryingValueVariance = round2(registerCarryingValue - glCarryingValue);

  return {
    cost,
    accumulatedDepreciation,
    totals: {
      registerCost,
      glCost,
      registerAccumulatedDepreciation,
      glAccumulatedDepreciation,
      registerCarryingValue,
      glCarryingValue,
      costVariance,
      accumulatedDepreciationVariance,
      carryingValueVariance,
    },
    isReconciled:
      Math.abs(costVariance) <= VARIANCE_EPSILON && Math.abs(accumulatedDepreciationVariance) <= VARIANCE_EPSILON,
  };
}
