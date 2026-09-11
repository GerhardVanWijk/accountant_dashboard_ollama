import type { AssetDisposal, FixedAsset, ID, TaxRate } from '@/types';
import type { IAssetDisposalRepository } from '../repositories/IAssetDisposalRepository';
import type { AccountMapper, NewJournalLineInput } from '@/features/accounting/services';
import type { DisposalExecutor } from './disposalExecutor';
import { newUuid } from '@/lib/uuid';
import { round2 } from './depreciationMath';

/** Half a cent — same rounding tolerance as journalEntryService.ts. */
const EPSILON = 0.005;

/** Default VAT code for a taxable disposal — the standard rate. */
export const DEFAULT_DISPOSAL_VAT_CODE = 'STD';

/**
 * Minimal surface of TaxRateService — resolves a VAT code to the rate
 * version in effect on the disposal date (§83). Fixed Assets never carries
 * its own VAT-rate logic or a hardcoded percentage.
 */
export interface DisposalTaxRateResolver {
  getEffectiveRate(code: string, asOf: Date): Promise<TaxRate | undefined>;
}

/** Minimal surface of FixedAssetRepository this service depends on — read-only, since posting (including the fixed_assets status flip) now goes through DisposalExecutor. */
export interface AssetStore {
  getById(id: ID): Promise<FixedAsset | undefined>;
}

/**
 * Optional collaborator: brings an asset's depreciation current to its
 * disposal date before derecognition (IAS 16.55 — depreciation ceases on
 * derecognition, not before). Satisfied by DepreciationService.
 */
export interface DepreciationCatchUp {
  catchUpToDate(assetId: ID, throughDate: string, postedByUserId?: ID): Promise<unknown>;
}

/**
 * How VAT is treated on the disposal proceeds. `none` — no VAT (e.g. sale of
 * a going concern, or a non-vendor). `inclusive` — the figure entered
 * already includes VAT. `exclusive` — VAT is added on top of the figure
 * entered. When VAT applies, output VAT is credited to the existing VAT
 * Output control account — Fixed Assets never runs its own VAT logic.
 */
/**
 * How the entered proceeds figure relates to VAT. `none` — out of scope
 * (going concern, non-vendor): no output VAT, no VAT source entry.
 * `inclusive` — the figure already includes VAT. `exclusive` — VAT is added
 * on top. The RATE itself always comes from the VAT engine (`vatCode` +
 * disposal date), never typed here.
 */
export type DisposalVatTreatment = 'none' | 'inclusive' | 'exclusive';

export interface DisposeAssetInput {
  assetId: ID;
  disposalDate: string;
  /** The agreed sale figure. Interpreted per `vatTreatment`. Zero = scrapped. */
  proceeds: number;
  /** GL account receiving the cash/receivable — typically Cash and Bank or Accounts Receivable. */
  proceedsAccountId: ID;
  vatTreatment?: DisposalVatTreatment;
  /** VAT code for a taxable disposal — resolved to the effective-dated rate by the VAT engine. Defaults to the standard rate. */
  vatCode?: string;
  postedByUserId?: ID;
  /**
   * Stable, immutable identity of this logical disposal — a UUID generated
   * client-side before the RPC runs. A retry of the same "dispose this
   * asset" intent should re-use it (the RPC returns the original result
   * instead of re-executing); a genuinely new disposal attempt gets a fresh
   * one automatically when omitted. Never derived from mutable state.
   */
  disposalId?: ID;
}

export interface DisposalBreakdown {
  cost: number;
  accumulatedDepreciation: number;
  carryingValue: number;
  /** Cash/receivable recognised — net proceeds plus any output VAT. Stored as `AssetDisposal.proceeds`. */
  grossProceeds: number;
  vatAmount: number;
  netProceeds: number;
  /** netProceeds − carryingValue. Positive = gain, negative = loss. */
  gainLoss: number;
  /** The VAT rate the engine resolved for the disposal date (percent), or undefined when out of scope. */
  vatRatePercent?: number;
}

/** Splits an entered proceeds figure into gross cash / output VAT / net, per the VAT treatment and a rate resolved by the VAT engine. Pure — shared by the service and the disposal form so the preview can never disagree with what posts. */
export function splitProceeds(input: { proceeds: number; vatTreatment?: DisposalVatTreatment; vatRatePercent?: number }): { grossProceeds: number; vatAmount: number; netProceeds: number } {
  const treatment = input.vatTreatment ?? 'none';
  if (treatment === 'none') {
    return { grossProceeds: round2(input.proceeds), vatAmount: 0, netProceeds: round2(input.proceeds) };
  }
  const rate = input.vatRatePercent;
  if (rate === undefined || rate < 0) {
    throw new Error(`Disposal VAT treatment "${treatment}" needs a VAT rate resolved from the tax engine.`);
  }
  if (rate === 0) {
    return { grossProceeds: round2(input.proceeds), vatAmount: 0, netProceeds: round2(input.proceeds) };
  }
  if (treatment === 'inclusive') {
    const net = round2(input.proceeds / (1 + rate / 100));
    const vat = round2(input.proceeds - net);
    return { grossProceeds: round2(input.proceeds), vatAmount: vat, netProceeds: net };
  }
  const vat = round2(input.proceeds * (rate / 100));
  return { grossProceeds: round2(input.proceeds + vat), vatAmount: vat, netProceeds: round2(input.proceeds) };
}

/**
 * Asset disposal (SA_ACCOUNTING_MASTER_SPEC §116 Phase 7). Brings
 * depreciation current to the disposal date, then posts:
 *   CR Fixed Asset for the full original cost
 *   DR Accumulated Depreciation for whatever has built up
 *   DR proceedsAccountId for the cash/receivable (net proceeds + output VAT)
 *   CR VAT Output for any output VAT
 *   the balancing gain (CR 4200) or loss (DR 5300) on net proceeds vs
 *   carrying value
 * then flips the asset to 'disposed' — terminal. An asset can only be
 * disposed once.
 *
 * Posting goes through `disposalExecutor` — one atomic
 * `post_fixed_asset_disposal` RPC call (migration 0083) that commits the
 * journal, the `asset_disposals` evidence row, the `fixed_assets` status
 * flip, and (for a taxable disposal) the `vat_source_entries` evidence row
 * together, or none of them. Catch-up depreciation stays a separate, earlier
 * step (`depreciationCatchUp`) — each missed period is its own accounting
 * event, posted through DepreciationService's own atomic RPC calls before
 * this function ever runs.
 */
export class AssetDisposalService {
  constructor(
    private readonly disposalRepository: IAssetDisposalRepository,
    private readonly assetStore: AssetStore,
    private readonly disposalExecutor: DisposalExecutor,
    private readonly accounts: AccountMapper,
    private readonly depreciationCatchUp?: DepreciationCatchUp,
    private readonly taxRates?: DisposalTaxRateResolver,
  ) {}

  async getDisposals(): Promise<AssetDisposal[]> {
    return this.disposalRepository.getAll();
  }

  async getDisposalForAsset(assetId: ID): Promise<AssetDisposal | undefined> {
    return this.disposalRepository.getByAsset(assetId);
  }

  /**
   * Resolves the VAT rate for a disposal from the tax engine (§83) — the
   * version of `vatCode` in effect on the disposal date. Returns undefined
   * for an out-of-scope disposal. Throws if a taxable disposal names a code
   * with no configured rate for that date (never falls back to a hardcoded
   * percentage).
   */
  private async resolveVatRate(input: DisposeAssetInput): Promise<TaxRate | undefined> {
    if ((input.vatTreatment ?? 'none') === 'none') return undefined;
    if (!this.taxRates) {
      throw new Error('A taxable disposal needs the VAT rate engine wired to AssetDisposalService.');
    }
    const code = input.vatCode ?? DEFAULT_DISPOSAL_VAT_CODE;
    const rate = await this.taxRates.getEffectiveRate(code, new Date(input.disposalDate));
    if (!rate) {
      throw new Error(
        `No VAT rate for code "${code}" is configured for ${input.disposalDate.slice(0, 10)} — configure it in the tax settings before disposing.`,
      );
    }
    return rate;
  }

  /** Read-side: the disposal maths for a proposed disposal, no posting. Drives the disposal preview/waterfall. */
  async previewDisposal(input: DisposeAssetInput): Promise<DisposalBreakdown> {
    const asset = await this.requireDisposable(input);
    const accumulated = asset.accumulatedDepreciation;
    const carryingValue = round2(asset.cost - accumulated);
    const rate = await this.resolveVatRate(input);
    const { grossProceeds, vatAmount, netProceeds } = splitProceeds({ ...input, vatRatePercent: rate?.rate });
    return {
      cost: asset.cost,
      accumulatedDepreciation: accumulated,
      carryingValue,
      grossProceeds,
      vatAmount,
      netProceeds,
      gainLoss: round2(netProceeds - carryingValue),
      vatRatePercent: rate?.rate,
    };
  }

  async disposeAsset(input: DisposeAssetInput): Promise<AssetDisposal> {
    let asset = await this.requireDisposable(input);
    const rate = await this.resolveVatRate(input);

    if (this.depreciationCatchUp && asset.status === 'active') {
      await this.depreciationCatchUp.catchUpToDate(asset.id, input.disposalDate, input.postedByUserId);
      asset = (await this.assetStore.getById(input.assetId)) ?? asset;
    }

    const carryingValue = round2(asset.cost - asset.accumulatedDepreciation);
    const { grossProceeds, vatAmount, netProceeds } = splitProceeds({ ...input, vatRatePercent: rate?.rate });
    const gainLoss = round2(netProceeds - carryingValue);

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
        debit: round2(asset.accumulatedDepreciation),
        credit: 0,
      });
    }
    if (grossProceeds > EPSILON) {
      lines.push({
        accountId: input.proceedsAccountId,
        description: `Disposal of ${asset.assetNumber} - proceeds`,
        debit: grossProceeds,
        credit: 0,
      });
    }
    if (vatAmount > EPSILON) {
      lines.push({
        accountId: await this.accounts.getAccountId('VAT_OUTPUT'),
        description: `Disposal of ${asset.assetNumber} - output VAT`,
        debit: 0,
        credit: vatAmount,
      });
    }
    if (gainLoss > EPSILON) {
      lines.push({
        accountId: await this.accounts.getAccountId('GAIN_ON_DISPOSAL'),
        description: `Disposal of ${asset.assetNumber} - gain on disposal`,
        debit: 0,
        credit: gainLoss,
      });
    } else if (gainLoss < -EPSILON) {
      lines.push({
        accountId: await this.accounts.getAccountId('LOSS_ON_DISPOSAL'),
        description: `Disposal of ${asset.assetNumber} - loss on disposal`,
        debit: -gainLoss,
        credit: 0,
      });
    }

    // Everything below is ONE atomic command (post_fixed_asset_disposal,
    // migration 0083): the journal, the asset_disposals evidence row, the
    // fixed_assets status flip, and — for a taxable disposal — the
    // vat_source_entries evidence row, commit together or not at all. See
    // docs/FIXED_ASSETS.md "Disposal transaction atomicity".
    const taxable = rate !== undefined && (input.vatTreatment ?? 'none') !== 'none';
    const result = await this.disposalExecutor.postDisposal({
      disposalId: input.disposalId ?? newUuid(),
      assetId: asset.id,
      disposalDate: input.disposalDate,
      memo: `Disposal of ${asset.assetNumber} - ${asset.name}`,
      source: 'asset_disposal',
      lines,
      proceeds: grossProceeds,
      carryingValue,
      accumulatedDepreciation: round2(asset.accumulatedDepreciation),
      gainLoss,
      // Authoritative VAT source/evidence (migration 0080) — so the VAT
      // return and the VAT control reconciliation see this taxable supply,
      // not just the GL. Written for any in-scope treatment, even a
      // zero-rated one.
      vat: taxable
        ? {
            taxRateId: rate!.id,
            treatment: rate!.treatment,
            direction: 'output',
            taxableAmount: netProceeds,
            vatAmount,
            grossAmount: grossProceeds,
            classification: 'capital_goods',
            reason: `Disposal of ${asset.assetNumber} - ${asset.name}`,
          }
        : undefined,
      createdBy: input.postedByUserId,
    });

    return result.disposal;
  }

  private async requireDisposable(input: DisposeAssetInput): Promise<FixedAsset> {
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
    return asset;
  }
}
