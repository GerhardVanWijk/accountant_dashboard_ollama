import type { ID } from '@/types/common';
import type { JournalEntry } from '@/types';
import type { LeaseContract } from '@/types/lease';
import type { AccountMapper, NewJournalLineInput } from '@/features/accounting/services';
import { EPSILON, round2 } from './leaseCalculations';

export interface JournalPoster {
  postJournalEntry(input: {
    date: string;
    memo?: string;
    source: string;
    lines: NewJournalLineInput[];
    postedByUserId?: ID;
  }): Promise<JournalEntry>;
}

/** Minimal surface of LeaseRepository this service depends on. */
export interface LeaseStore {
  getById(id: ID): Promise<LeaseContract | undefined>;
  update(id: ID, patch: Partial<LeaseContract>): Promise<LeaseContract>;
}

/**
 * Lease termination (SA_ACCOUNTING_MASTER_SPEC.md §32 "termination"). Mirrors
 * assetDisposalService.disposeAsset()'s shape and exact gain/loss math:
 *   CR Right-of-Use Assets (acc_1700) for the full original initialRightOfUseAsset
 *   DR Accumulated Depreciation - ROU (acc_1790) for whatever has built up so far
 *   DR Lease Liability (acc_2450) to clear the remaining outstandingLeaseLiability
 *   the balancing gain (CR acc_4200, reused from Fixed Assets) or loss
 *   (DR acc_5300, reused from Fixed Assets) on the difference between the
 *   liability being extinguished and the ROU asset's carrying value
 * then flips the lease to 'terminated' — terminal, matching LeaseStatus's
 * doc comment. A lease can only be terminated once: a 'draft' lease was
 * never commenced (nothing to terminate), and an already-'terminated'
 * lease is rejected outright.
 */
export class LeaseDisposalService {
  constructor(
    private readonly leaseStore: LeaseStore,
    private readonly journalPoster: JournalPoster,
    private readonly accounts: AccountMapper,
  ) {}

  async terminateLease(id: ID, terminationDate: string, postedByUserId?: ID): Promise<LeaseContract> {
    const lease = await this.leaseStore.getById(id);
    if (!lease) {
      throw new Error(`Lease "${id}" not found.`);
    }
    if (lease.status === 'draft') {
      throw new Error(`Cannot terminate lease "${lease.leaseNumber}": it has not commenced yet (still a draft).`);
    }
    if (lease.status === 'terminated') {
      throw new Error(`Lease "${lease.leaseNumber}" has already been terminated.`);
    }

    const rouCarryingValue = round2(lease.initialRightOfUseAsset - lease.accumulatedDepreciation);
    const outstandingLiability = round2(lease.outstandingLeaseLiability);
    // Gain (liability extinguished exceeds the ROU carrying value written off) or
    // loss (the reverse) — SA_ACCOUNTING_MASTER_SPEC.md §32's own framing of termination.
    const gainLoss = round2(outstandingLiability - rouCarryingValue);

    const memo = `Terminate lease ${lease.leaseNumber} - ${lease.assetDescription}`;
    const [rightOfUseAssetId, accumulatedDepreciationRouId, leaseLiabilityId, gainOnDisposalId, lossOnDisposalId] = await Promise.all([
      this.accounts.getAccountId('RIGHT_OF_USE_ASSET'),
      this.accounts.getAccountId('ACCUMULATED_DEPRECIATION_ROU'),
      this.accounts.getAccountId('LEASE_LIABILITY'),
      this.accounts.getAccountId('GAIN_ON_DISPOSAL'),
      this.accounts.getAccountId('LOSS_ON_DISPOSAL'),
    ]);
    const lines: NewJournalLineInput[] = [
      {
        accountId: rightOfUseAssetId,
        description: `${memo} - remove ROU asset cost`,
        debit: 0,
        credit: round2(lease.initialRightOfUseAsset),
      },
    ];
    if (lease.accumulatedDepreciation > EPSILON) {
      lines.push({
        accountId: accumulatedDepreciationRouId,
        description: `${memo} - clear accumulated depreciation`,
        debit: round2(lease.accumulatedDepreciation),
        credit: 0,
      });
    }
    if (outstandingLiability > EPSILON) {
      lines.push({
        accountId: leaseLiabilityId,
        description: `${memo} - clear remaining lease liability`,
        debit: outstandingLiability,
        credit: 0,
      });
    }
    if (gainLoss > EPSILON) {
      lines.push({
        accountId: gainOnDisposalId,
        description: `${memo} - gain on termination`,
        debit: 0,
        credit: gainLoss,
      });
    } else if (gainLoss < -EPSILON) {
      lines.push({
        accountId: lossOnDisposalId,
        description: `${memo} - loss on termination`,
        debit: -gainLoss,
        credit: 0,
      });
    }

    const entry = await this.journalPoster.postJournalEntry({
      date: terminationDate,
      source: 'lease_termination',
      memo,
      lines,
      postedByUserId,
    });

    return this.leaseStore.update(id, {
      status: 'terminated',
      terminationDate,
      terminationJournalEntryId: entry.id,
    });
  }
}
