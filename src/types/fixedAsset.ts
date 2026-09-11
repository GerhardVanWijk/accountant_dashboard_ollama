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
 * Carried on a Bill's `DocumentLineItem` (src/types/common.ts) to flag
 * "this line is a fixed asset, capitalize it — do not expense or
 * inventory it" and supply everything `billService.postBill()` needs to
 * capitalize it in the same journal entry as the bill via
 * `fixedAssetService.capitalizeFromBillLine()`. Mutually exclusive with
 * `productId` on the same line (a fixed asset doesn't come from the
 * Product catalog) — enforced by the line-item editor, not the type
 * system. Only meaningful on a Bill line; ignored on every other document
 * type, same precedent as `DocumentLineItem.warehouseId`.
 */
export interface FixedAssetLineDetails {
  category: AssetCategory;
  usefulLifeYears: number;
  depreciationMethod: DepreciationMethod;
  residualValue: number;
  /** Required when depreciationMethod is 'reducing_balance'. */
  reducingBalanceRatePercent?: number;
  /** Prefilled from WEAR_TEAR_RATE_DEFAULTS in the UI, always user-editable — see FixedAsset.taxWearTearRateSource. */
  taxWearTearRatePercent?: number;
}

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
 * One effective-dated change in accounting estimate (IAS 8.36 / IAS 16.51)
 * on a capitalized asset — the authoritative accounting record the
 * depreciation engine reconstructs the estimate timeline from (migration
 * 0079). Append-only, same rationale as DepreciationEntry.
 *
 * `effectiveDate` is always the first day of a month (estimate changes take
 * effect on an accounting-period boundary — see
 * fixedAssetService.reviseEstimate()). `usefulLifeYears` is the revised
 * TOTAL useful life measured from the acquisition date (one meaning
 * everywhere), not a "remaining" life. `previous*` fields snapshot the
 * estimate that applied immediately before this revision, so the revision
 * history is self-sufficient for reconstruction.
 *
 * PRECEDENCE (docs/FIXED_ASSETS.md): for any period the applicable estimate
 * is the revision with the greatest effectiveDate <= the period start;
 * before the earliest revision, that revision's `previous*` values; with no
 * revisions, the FixedAsset baseline columns (effective from acquisition).
 */
export interface EstimateRevision extends BaseEntity {
  assetId: ID;
  effectiveDate: ISODateString;
  usefulLifeYears: number;
  residualValue: number;
  depreciationMethod: DepreciationMethod;
  reducingBalanceRatePercent?: number;
  previousUsefulLifeYears: number;
  previousResidualValue: number;
  previousDepreciationMethod: DepreciationMethod;
  previousReducingBalanceRatePercent?: number;
  reason?: string;
  createdBy?: string;
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
