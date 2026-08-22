import type { AssetDisposal, FixedAsset, ID, JournalEntry } from '@/types';
import type { IAssetDisposalRepository } from '../repositories/IAssetDisposalRepository';
import type { NewJournalLineInput } from '@/features/accounting/services';

/** Half a cent — same rounding tolerance as journalEntryService.ts. */
const EPSILON = 0.005;

/** Fixed GL account ids (src/mock-data/accounts.ts) this service posts against. */
const GAIN_ON_DISPOSAL_ACCOUNT_ID = 'acc_4200';
const LOSS_ON_DISPOSAL_ACCOUNT_ID = 'acc_5300';

export interface JournalPoster {
  postJournalEntry(input: {
    date: string;
    memo?: string;
    source: string;
    lines: NewJournalLineInput[];
    postedByUserId?: ID;
  }): Promise<JournalEntry>;
}

/** Minimal surface of FixedAssetRepository this service depends on. */
export interface AssetStore {
  getById(id: ID): Promise<FixedAsset | undefined>;
  update(id: ID, patch: Partial<FixedAsset>): Promise<FixedAsset>;
}

export interface DisposeAssetInput {
  assetId: ID;
  disposalDate: string;
  proceeds: number;
  /** GL account receiving the disposal proceeds — typically Cash and Bank or Accounts Receivable. */
  proceedsAccountId: ID;
  postedByUserId?: ID;
}

/**
 * Asset disposal (SA_ACCOUNTING_MASTER_SPEC.md §116 Phase 7). Posts:
 *   CR Fixed Asset (asset.glAssetAccountId) for the full original cost
 *   DR Accumulated Depreciation for whatever has built up so far
 *   DR proceedsAccountId for what was actually received (if any)
 *   the balancing gain (CR acc_4200) or loss (DR acc_5300) on the
 *   difference between proceeds and carrying value
 * then flips the asset to 'disposed' — terminal, matching
 * FixedAssetStatus's doc comment. An asset can only be disposed once: a
 * 'draft' asset was never capitalized (nothing to dispose of), and an
 * already-'disposed' asset is rejected outright.
 */
export class AssetDisposalService {
  constructor(
    private readonly disposalRepository: IAssetDisposalRepository,
    private readonly assetStore: AssetStore,
    private readonly journalPoster: JournalPoster,
  ) {}

  async getDisposals(): Promise<AssetDisposal[]> {
    return this.disposalRepository.getAll();
  }

  async getDisposalForAsset(assetId: ID): Promise<AssetDisposal | undefined> {
    return this.disposalRepository.getByAsset(assetId);
  }

  async disposeAsset(input: DisposeAssetInput): Promise<AssetDisposal> {
    const asset = await this.assetStore.getById(input.assetId);
    if (!asset) {
      throw new Error(`Fixed asset "${input.assetId}" not found.`);
    }
    if (asset.status === 'draft') {
      throw new Error(`Cannot dispose "${asset.assetNumber}": it has not been capitalized yet (still a draft).`);
    }
    if (asset.status === 'disposed') {
      throw new Error(`Fixed asset "${asset.assetNumber}" has already been disposed.`);
    }
    if (input.proceeds < 0) {
      throw new Error('Disposal proceeds cannot be negative.');
    }

    const carryingValue = asset.cost - asset.accumulatedDepreciation;
    const gainLoss = input.proceeds - carryingValue;

    const lines: NewJournalLineInput[] = [
      {
        accountId: asset.glAssetAccountId,
        description: `Disposal of ${asset.assetNumber} - remove cost`,
        debit: 0,
        credit: asset.cost,
      },
    ];
    if (asset.accumulatedDepreciation > EPSILON) {
      lines.push({
        accountId: asset.glAccumulatedDepreciationAccountId,
        description: `Disposal of ${asset.assetNumber} - clear accumulated depreciation`,
        debit: asset.accumulatedDepreciation,
        credit: 0,
      });
    }
    if (input.proceeds > EPSILON) {
      lines.push({
        accountId: input.proceedsAccountId,
        description: `Disposal of ${asset.assetNumber} - proceeds`,
        debit: input.proceeds,
        credit: 0,
      });
    }
    if (gainLoss > EPSILON) {
      lines.push({
        accountId: GAIN_ON_DISPOSAL_ACCOUNT_ID,
        description: `Disposal of ${asset.assetNumber} - gain on disposal`,
        debit: 0,
        credit: gainLoss,
      });
    } else if (gainLoss < -EPSILON) {
      lines.push({
        accountId: LOSS_ON_DISPOSAL_ACCOUNT_ID,
        description: `Disposal of ${asset.assetNumber} - loss on disposal`,
        debit: -gainLoss,
        credit: 0,
      });
    }

    const entry = await this.journalPoster.postJournalEntry({
      date: input.disposalDate,
      source: 'asset_disposal',
      memo: `Disposal of ${asset.assetNumber} - ${asset.name}`,
      lines,
      postedByUserId: input.postedByUserId,
    });

    await this.assetStore.update(asset.id, {
      status: 'disposed',
      disposalDate: input.disposalDate,
      disposalProceeds: input.proceeds,
      disposalJournalEntryId: entry.id,
    });

    return this.disposalRepository.create({
      id: '',
      assetId: asset.id,
      disposalDate: input.disposalDate,
      proceeds: input.proceeds,
      carryingValueAtDisposal: carryingValue,
      accumulatedDepreciationAtDisposal: asset.accumulatedDepreciation,
      gainLoss,
      journalEntryId: entry.id,
      createdAt: '',
      updatedAt: '',
    });
  }
}
