import type { AssetCategory, DepreciationMethod, FixedAsset, ID, JournalEntry } from '@/types';
import type { IFixedAssetRepository } from '../repositories/IFixedAssetRepository';
import type { NewJournalLineInput } from '@/features/accounting/services';

/** Default GL account ids for an asset capitalized straight from a Bill line — same defaults AssetForm prefills for a manually-registered asset. */
const DEFAULT_ASSET_ACCOUNT_ID = 'acc_1500';
const DEFAULT_ACCUMULATED_DEPRECIATION_ACCOUNT_ID = 'acc_1590';
const DEFAULT_DEPRECIATION_EXPENSE_ACCOUNT_ID = 'acc_5200';

/**
 * Minimal surface of JournalEntryService this service depends on — an
 * interface, not the concrete class, mirroring billService.ts's
 * JournalPoster so this stays unit-testable with a stub.
 */
export interface JournalPoster {
  postJournalEntry(input: {
    date: string;
    memo?: string;
    source: string;
    lines: NewJournalLineInput[];
    postedByUserId?: ID;
  }): Promise<JournalEntry>;
}

export type CreateFixedAssetDTO = Omit<
  FixedAsset,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'accumulatedDepreciation'
  | 'status'
  | 'journalEntryId'
  | 'disposalDate'
  | 'disposalProceeds'
  | 'disposalJournalEntryId'
>;
export type UpdateFixedAssetDTO = Partial<CreateFixedAssetDTO>;

export interface CapitalizeFromBillLineInput {
  sourceBillId: ID;
  /** The Bill's own posted journal entry id — the capitalization rides in that same entry, no separate posting. */
  journalEntryId: ID;
  name: string;
  category: AssetCategory;
  acquisitionDate: string;
  /** The line's ex-VAT lineTotal. */
  cost: number;
  residualValue: number;
  usefulLifeYears: number;
  depreciationMethod: DepreciationMethod;
  reducingBalanceRatePercent?: number;
  taxWearTearRatePercent?: number;
}

/** Shared economics validation for both createFixedAsset() and capitalizeFromBillLine() — one asset, two entry points, must agree on what's a valid asset. */
function validateAssetEconomics(data: {
  cost: number;
  residualValue: number;
  usefulLifeYears: number;
  depreciationMethod: DepreciationMethod;
  reducingBalanceRatePercent?: number;
}): void {
  if (data.cost <= 0) {
    throw new Error('Fixed asset cost must be greater than zero.');
  }
  if (data.residualValue < 0 || data.residualValue > data.cost) {
    throw new Error('Residual value must be between 0 and the asset cost.');
  }
  if (data.usefulLifeYears <= 0) {
    throw new Error('Useful life must be greater than zero years.');
  }
  if (data.depreciationMethod === 'reducing_balance' && data.reducingBalanceRatePercent === undefined) {
    throw new Error('Reducing-balance depreciation requires a reducingBalanceRatePercent.');
  }
}

/**
 * Once an asset leaves 'draft' (capitalized via postAcquisition, or later
 * depreciated/disposed), these fields drive real posted GL history — an
 * edit here would silently desync the register from what was actually
 * posted, same class of guard as the delete-guard on posted
 * Invoices/Bills/etc. (docs/KNOWN_ISSUES.md, 8 services).
 */
const LOCKED_AFTER_POST_FIELDS: (keyof UpdateFixedAssetDTO)[] = [
  'cost',
  'residualValue',
  'usefulLifeYears',
  'depreciationMethod',
  'reducingBalanceRatePercent',
  'acquisitionDate',
  'glAssetAccountId',
  'glAccumulatedDepreciationAccountId',
  'glDepreciationExpenseAccountId',
];

/**
 * Business-logic layer for the Fixed Asset Register
 * (SA_ACCOUNTING_MASTER_SPEC.md §116 Phase 7). Mirrors productService.ts's
 * shape for CRUD, plus a `postAcquisition()` action that capitalizes a
 * draft asset to the GL — the same create-draft-then-explicit-post pattern
 * Bill/Invoice/PurchaseOrder use, so a register entry can be reviewed
 * before it becomes real, immutable accounting history.
 */
export class FixedAssetService {
  constructor(
    private readonly repository: IFixedAssetRepository,
    private readonly journalPoster: JournalPoster,
  ) {}

  async getFixedAssets(): Promise<FixedAsset[]> {
    return this.repository.getAll();
  }

  async getFixedAsset(id: ID): Promise<FixedAsset | undefined> {
    return this.repository.getById(id);
  }

  async createFixedAsset(data: CreateFixedAssetDTO): Promise<FixedAsset> {
    validateAssetEconomics(data);

    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      accumulatedDepreciation: 0,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateFixedAsset(id: ID, patch: UpdateFixedAssetDTO): Promise<FixedAsset> {
    const asset = await this.repository.getById(id);
    if (!asset) {
      throw new Error(`Fixed asset "${id}" not found.`);
    }
    if (asset.status !== 'draft') {
      const lockedFieldTouched = LOCKED_AFTER_POST_FIELDS.some((field) => field in patch);
      if (lockedFieldTouched) {
        throw new Error(
          `Cannot change cost/useful-life/depreciation-method/GL-mapping fields on "${asset.assetNumber}": it has already been capitalized (status: ${asset.status}). Only a draft asset's accounting fields can be edited.`,
        );
      }
    }
    return this.repository.update(id, patch);
  }

  /**
   * Permanently removes a draft asset. Anything past 'draft' has real
   * posted GL history behind it and must never be deleted
   * (SA_ACCOUNTING_MASTER_SPEC.md §14/§36/§72/§79), same rule as every
   * other posted-document delete guard in this codebase.
   */
  async deleteFixedAsset(id: ID): Promise<void> {
    const asset = await this.repository.getById(id);
    if (!asset) {
      throw new Error(`Fixed asset "${id}" not found.`);
    }
    if (asset.status !== 'draft') {
      throw new Error(`Cannot delete "${asset.assetNumber}": only a draft (not yet capitalized) asset can be deleted (current status: ${asset.status}).`);
    }
    return this.repository.delete(id);
  }

  /**
   * Capitalizes a draft asset: posts DR Fixed Asset (asset.glAssetAccountId)
   * / CR contraAccountId (the funding source the user chooses — typically
   * Accounts Payable if bought on credit, or Cash and Bank if paid
   * immediately) for the full cost, then flips the asset to 'active' and
   * records the journal entry id. Only a 'draft' asset may be posted, so
   * the same asset can never be capitalized twice.
   */
  async postAcquisition(id: ID, contraAccountId: ID, postedByUserId?: ID): Promise<FixedAsset> {
    const asset = await this.repository.getById(id);
    if (!asset) {
      throw new Error(`Fixed asset "${id}" not found.`);
    }
    if (asset.status !== 'draft') {
      throw new Error(`Fixed asset "${asset.assetNumber}" has already been capitalized (status: ${asset.status}).`);
    }

    const lines: NewJournalLineInput[] = [
      {
        accountId: asset.glAssetAccountId,
        description: `Capitalize ${asset.assetNumber} - ${asset.name}`,
        debit: asset.cost,
        credit: 0,
      },
      {
        accountId: contraAccountId,
        description: `Capitalize ${asset.assetNumber} - ${asset.name}`,
        debit: 0,
        credit: asset.cost,
      },
    ];

    const entry = await this.journalPoster.postJournalEntry({
      date: asset.acquisitionDate,
      memo: `Capitalize ${asset.assetNumber} - ${asset.name}`,
      source: 'fixed_asset_acquisition',
      lines,
      postedByUserId,
    });

    return this.repository.update(id, { status: 'active', journalEntryId: entry.id });
  }

  /**
   * Capitalizes a Bill line item that was flagged as a fixed asset
   * (DocumentLineItem.fixedAssetDetails, src/types/common.ts) directly to
   * 'active' — NOT through the draft-then-postAcquisition() flow above.
   * The Bill's own posting IS the capitalization event here: the caller
   * (billService.postBill()) has already debited the Fixed Asset account
   * for `cost` in the SAME journal entry that credits Accounts Payable, so
   * there is no separate acquisition entry left to post — this only
   * writes the register row, pointing `journalEntryId` at that already-
   * posted entry. Mirrors how a Bill's tracked-inventory line results in
   * stock being received immediately (recordReceiptMovement()) with no
   * separate "post" step of its own.
   */
  async capitalizeFromBillLine(input: CapitalizeFromBillLineInput): Promise<FixedAsset> {
    validateAssetEconomics(input);

    const assetNumber = await this.nextAssetNumber();
    const now = new Date().toISOString();
    return this.repository.create({
      id: '',
      assetNumber,
      name: input.name,
      category: input.category,
      acquisitionDate: input.acquisitionDate,
      cost: input.cost,
      residualValue: input.residualValue,
      usefulLifeYears: input.usefulLifeYears,
      depreciationMethod: input.depreciationMethod,
      reducingBalanceRatePercent: input.reducingBalanceRatePercent,
      taxWearTearRatePercent: input.taxWearTearRatePercent,
      glAssetAccountId: DEFAULT_ASSET_ACCOUNT_ID,
      glAccumulatedDepreciationAccountId: DEFAULT_ACCUMULATED_DEPRECIATION_ACCOUNT_ID,
      glDepreciationExpenseAccountId: DEFAULT_DEPRECIATION_EXPENSE_ACCOUNT_ID,
      accumulatedDepreciation: 0,
      status: 'active',
      journalEntryId: input.journalEntryId,
      sourceBillId: input.sourceBillId,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Mirrors JournalEntryService.nextEntryNumber()'s shape — sequential, based on register size. */
  private async nextAssetNumber(): Promise<string> {
    const assets = await this.repository.getAll();
    return `FA-${String(assets.length + 1).padStart(4, '0')}`;
  }
}
