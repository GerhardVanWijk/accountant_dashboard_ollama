import type { BaseEntity, ID, ISODateString } from './common';

/**
 * Fixed asset categories per SA_ACCOUNTING_MASTER_SPEC.md §116 Phase 7.
 * Drives the default SARS wear-and-tear rate suggestion
 * (src/features/assets/constants.ts) — a starting point only, see
 * FixedAsset.taxWearTearRateSource.
 */
export type AssetCategory =
  | 'land'
  | 'buildings'
  | 'plant_and_machinery'
  | 'furniture_and_fittings'
  | 'motor_vehicles'
  | 'computer_equipment'
  | 'office_equipment'
  | 'leasehold_improvements'
  | 'other';

export type DepreciationMethod = 'straight_line' | 'reducing_balance';

/**
 * 'draft': registered but not yet capitalized to the GL (no journal entry
 * posted yet) — excluded from depreciation runs, mirrors Bill/Invoice's
 * draft-until-posted pattern (docs/LEDGER_ARCHITECTURE.md).
 * 'active': capitalized, depreciating.
 * 'fully_depreciated': carrying value has reached residual value — still
 * on the register (and still disposable), just no further depreciation
 * runs will pick it up.
 * 'disposed': removed from service via assetDisposalService; terminal.
 */
export type FixedAssetStatus = 'draft' | 'active' | 'fully_depreciated' | 'disposed';

/**
 * A single fixed-asset register entry (SA_ACCOUNTING_MASTER_SPEC.md §116
 * Phase 7 "Asset register"). `accumulatedDepreciation` is a running total
 * maintained by depreciationService — the same "stored running total,
 * written only through its owning service" pattern as
 * Product.quantityOnHand (src/types/product.ts), never set directly by a
 * form. `cost`/`residualValue`/`usefulLifeYears`/`depreciationMethod`/
 * `reducingBalanceRatePercent`/`acquisitionDate` become locked once the
 * asset leaves 'draft' — see fixedAssetService.updateFixedAsset().
 */
export interface FixedAsset extends BaseEntity {
  assetNumber: string;
  name: string;
  description?: string;
  category: AssetCategory;
  acquisitionDate: ISODateString;
  /** Capitalized cost, ex-VAT. */
  cost: number;
  residualValue: number;
  usefulLifeYears: number;
  depreciationMethod: DepreciationMethod;
  /** Only meaningful when depreciationMethod === 'reducing_balance'. */
  reducingBalanceRatePercent?: number;
  glAssetAccountId: ID;
  glAccumulatedDepreciationAccountId: ID;
  glDepreciationExpenseAccountId: ID;
  accumulatedDepreciation: number;
  status: FixedAssetStatus;
  /** Set once postAcquisition() posts the capitalization journal entry. */
  journalEntryId?: ID;
  /** Optional link to the supplier Bill this asset was capitalized from. */
  sourceBillId?: ID;
  /**
   * SARS wear-and-tear allowance rate for the Tax Register (§116 Phase 7)
   * — informational only, entirely separate from accounting depreciation
   * above. See taxWearTearRateSource for the required caveat.
   */
  taxWearTearRatePercent?: number;
  /**
   * Mirrors TaxRate.sourceReference's caution (src/types/taxRate.ts,
   * src/mock-data/taxRates.ts): every default in
   * src/features/assets/constants.ts's WEAR_TEAR_RATE_DEFAULTS is
   * "typical/indicative, user-supplied — pending professional
   * verification against SARS Binding General Practice Note 7", not a
   * confirmed statutory rate for this specific asset.
   */
  taxWearTearRateSource?: string;
  disposalDate?: ISODateString;
  disposalProceeds?: number;
  disposalJournalEntryId?: ID;
}

/**
 * Append-only depreciation ledger row — one per asset per depreciation
 * run, mirroring StockMovement's immutable-history pattern
 * (src/types/stockMovement.ts). The only write path is
 * depreciationService.runDepreciation(); there is no update()/delete().
 */
export interface DepreciationEntry extends BaseEntity {
  assetId: ID;
  /** Date depreciation is calculated up to (the period-end chosen for the run). */
  periodEnd: ISODateString;
  amount: number;
  accumulatedDepreciationAfter: number;
  carryingValueAfter: number;
  journalEntryId: ID;
}

/**
 * One disposal record per asset (an asset can only be disposed once —
 * enforced by assetDisposalService, not by this type). Append-only, same
 * rationale as DepreciationEntry above.
 */
export interface AssetDisposal extends BaseEntity {
  assetId: ID;
  disposalDate: ISODateString;
  proceeds: number;
  carryingValueAtDisposal: number;
  accumulatedDepreciationAtDisposal: number;
  /** proceeds - carryingValueAtDisposal; positive = gain, negative = loss. */
  gainLoss: number;
  journalEntryId: ID;
}
