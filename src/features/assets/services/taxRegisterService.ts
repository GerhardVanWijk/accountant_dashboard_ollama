import type { AssetCategory, FixedAsset, ID } from '@/types';

export interface FixedAssetLookup {
  getAll(): Promise<FixedAsset[]>;
}

export interface TaxRegisterRow {
  assetId: ID;
  assetNumber: string;
  name: string;
  category: AssetCategory;
  cost: number;
  acquisitionDate: string;
  /** cost - accumulatedDepreciation, per the accounting books. */
  accountingCarryingValue: number;
  taxWearTearRatePercent?: number;
  /**
   * cost minus the SARS wear-and-tear allowance claimed to date, straight-lined
   * from taxWearTearRatePercent — undefined when the asset has no rate set.
   */
  taxWrittenDownValue?: number;
  /**
   * taxWrittenDownValue - accountingCarryingValue. A non-zero value is the
   * normal case (accounting and tax depreciation rarely match) and is the
   * seed of a deferred-tax calculation — full deferred-tax accounting is
   * Phase 12 (IFRS), not computed here.
   */
  temporaryDifference?: number;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

function yearsElapsed(fromISO: string, asOfISO: string): number {
  const from = new Date(fromISO).getTime();
  const asOf = new Date(asOfISO).getTime();
  return Math.max(0, (asOf - from) / MS_PER_YEAR);
}

/**
 * Tax Register (SA_ACCOUNTING_MASTER_SPEC.md §116 Phase 7) — compares each
 * capitalized asset's accounting carrying value against a SARS
 * wear-and-tear-allowance-based tax written-down value. Deliberately NOT a
 * source of statutory tax figures: every `taxWearTearRatePercent` comes
 * from src/features/assets/constants.ts's WEAR_TEAR_RATE_DEFAULTS or a
 * user override, both flagged via FixedAsset.taxWearTearRateSource as
 * "typical/indicative, pending professional verification" — same caution
 * as TaxRate.sourceReference (§110/§111). This is informational only: no
 * GL posting, no deferred-tax journal entry (that computation belongs to
 * Phase 9/12).
 */
export class TaxRegisterService {
  constructor(private readonly assetLookup: FixedAssetLookup) {}

  async getTaxRegister(asOfDate: string): Promise<TaxRegisterRow[]> {
    const assets = await this.assetLookup.getAll();
    return assets
      .filter((asset) => asset.status !== 'draft')
      .map((asset) => this.toRow(asset, asOfDate));
  }

  private toRow(asset: FixedAsset, asOfDate: string): TaxRegisterRow {
    const accountingCarryingValue = asset.cost - asset.accumulatedDepreciation;

    let taxWrittenDownValue: number | undefined;
    let temporaryDifference: number | undefined;
    if (asset.taxWearTearRatePercent !== undefined) {
      const annualAllowance = asset.cost * (asset.taxWearTearRatePercent / 100);
      const allowanceClaimed = Math.min(asset.cost, annualAllowance * yearsElapsed(asset.acquisitionDate, asOfDate));
      taxWrittenDownValue = asset.cost - allowanceClaimed;
      temporaryDifference = taxWrittenDownValue - accountingCarryingValue;
    }

    return {
      assetId: asset.id,
      assetNumber: asset.assetNumber,
      name: asset.name,
      category: asset.category,
      cost: asset.cost,
      acquisitionDate: asset.acquisitionDate,
      accountingCarryingValue,
      taxWearTearRatePercent: asset.taxWearTearRatePercent,
      taxWrittenDownValue,
      temporaryDifference,
    };
  }
}
