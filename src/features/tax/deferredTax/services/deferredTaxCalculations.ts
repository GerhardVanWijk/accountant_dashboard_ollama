import type { DeferredTaxComputation, DeferredTaxTemporaryDifference, ID, TemporaryDifferenceClassification } from '@/types';
import type { TaxRegisterRow } from '@/features/assets/services/taxRegisterService';

/** Half a cent — same rounding tolerance used across every other posting service in this codebase. */
export const EPSILON = 0.005;

let localIdSeq = 0;
function nextItemId(prefix: string): string {
  localIdSeq += 1;
  return `${prefix}_${localIdSeq}`;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * carryingAmount > taxBase => 'taxable' (will increase future taxable
 * profit on reversal — always gives rise to a Deferred Tax Liability).
 * Otherwise => 'deductible' (a Deferred Tax Asset CANDIDATE, subject to
 * recognition — see DeferredTaxTemporaryDifference.recognized's doc
 * comment). A zero difference is classified 'deductible' by this rule but
 * contributes nothing either way (deferredTaxAmount is 0 for a zero
 * temporary difference regardless of classification).
 */
export function classifyTemporaryDifference(carryingAmount: number, taxBase: number): TemporaryDifferenceClassification {
  return carryingAmount > taxBase ? 'taxable' : 'deductible';
}

/**
 * §50: a taxable temporary difference is ALWAYS recognized as a Deferred
 * Tax Liability (no threshold). A deductible one only contributes a
 * Deferred Tax Asset if `item.recognized` is true — the accountant's own
 * confirmation that future taxable profit is probable, never assumed.
 */
export function calculateItemDeferredTax(
  item: Pick<DeferredTaxTemporaryDifference, 'classification' | 'temporaryDifference' | 'recognized'>,
  taxRatePercent: number,
): number {
  const effectivelyRecognized = item.classification === 'taxable' ? true : item.recognized;
  if (!effectivelyRecognized) return 0;
  return round2(Math.abs(item.temporaryDifference) * (taxRatePercent / 100));
}

/**
 * Recomputes classification/temporaryDifference/deferredTaxAmount for one
 * item after an edit to its carryingAmount/taxBase/recognized fields —
 * never trust a stale computed field once the inputs it was derived from
 * changed. A 'taxable' item's `recognized` is forced back to true
 * regardless of what was passed in (never optional for a liability).
 */
export function recalculateItem(item: DeferredTaxTemporaryDifference, taxRatePercent: number): DeferredTaxTemporaryDifference {
  const classification = classifyTemporaryDifference(item.carryingAmount, item.taxBase);
  const temporaryDifference = round2(item.carryingAmount - item.taxBase);
  const recognized = classification === 'taxable' ? true : item.recognized;
  const next: DeferredTaxTemporaryDifference = { ...item, classification, temporaryDifference, recognized, deferredTaxAmount: 0 };
  next.deferredTaxAmount = calculateItemDeferredTax(next, taxRatePercent);
  return next;
}

/**
 * Auto-suggests one temporary-difference item per Fixed Asset Tax Register
 * row with a real difference between accounting carrying value and SARS
 * wear-and-tear tax written-down value (`taxRegisterService.getTaxRegister()`)
 * — the one source of temporary differences this codebase can compute
 * without guessing. An asset with no wear-and-tear rate set, or with a
 * difference under EPSILON, is skipped (nothing real to report). Every
 * suggestion stays fully user-editable, same "auto-suggest, never gospel"
 * pattern TaxComputation's adjustment lines already use (§111).
 */
export function suggestFixedAssetTemporaryDifferences(
  taxRegisterRows: TaxRegisterRow[],
  taxRatePercent: number,
): DeferredTaxTemporaryDifference[] {
  return taxRegisterRows
    .filter((row) => row.taxWrittenDownValue !== undefined && Math.abs(row.taxWrittenDownValue - row.accountingCarryingValue) > EPSILON)
    .map((row) => {
      const carryingAmount = row.accountingCarryingValue;
      const taxBase = row.taxWrittenDownValue as number;
      const classification = classifyTemporaryDifference(carryingAmount, taxBase);
      const item: DeferredTaxTemporaryDifference = {
        id: nextItemId('dt_fa'),
        source: 'fixed_asset',
        sourceId: row.assetId,
        description: `${row.name} (${row.assetNumber}) — accounting carrying value vs. SARS wear-and-tear tax written-down value`,
        carryingAmount,
        taxBase,
        temporaryDifference: round2(carryingAmount - taxBase),
        classification,
        recognized: classification === 'taxable',
        deferredTaxAmount: 0,
      };
      item.deferredTaxAmount = calculateItemDeferredTax(item, taxRatePercent);
      return item;
    });
}

export interface DeferredTaxTotals {
  totalDeferredTaxLiability: number;
  totalDeferredTaxAsset: number;
  netDeferredTaxLiability: number;
}

/** Sums every 'taxable' item into the liability total and every RECOGNIZED 'deductible' item into the asset total — an unrecognized deductible item contributes to neither (its deferredTaxAmount is already 0, see calculateItemDeferredTax). */
export function calculateDeferredTaxTotals(items: DeferredTaxTemporaryDifference[]): DeferredTaxTotals {
  const totalDeferredTaxLiability = round2(
    items.filter((i) => i.classification === 'taxable').reduce((sum, i) => sum + i.deferredTaxAmount, 0),
  );
  const totalDeferredTaxAsset = round2(
    items.filter((i) => i.classification === 'deductible' && i.recognized).reduce((sum, i) => sum + i.deferredTaxAmount, 0),
  );
  return {
    totalDeferredTaxLiability,
    totalDeferredTaxAsset,
    netDeferredTaxLiability: round2(totalDeferredTaxLiability - totalDeferredTaxAsset),
  };
}

/**
 * The most recent POSTED DeferredTaxComputation for a company measured as
 * of strictly before `beforeAsOfDate` — what a new computation's movement
 * must be measured against (§50's "movements"/"reconciliation"). Shared
 * between the service (which needs this to actually post) and the UI
 * (which previews the movement on a still-draft computation before
 * posting) so there is only one definition of "the prior computation."
 */
export function findMostRecentPostedBefore(
  computations: DeferredTaxComputation[],
  companyId: ID,
  beforeAsOfDate: string,
  excludeId?: ID,
): DeferredTaxComputation | undefined {
  return computations
    .filter((c) => c.companyId === companyId && c.status === 'posted' && c.id !== excludeId && c.asOfDate.slice(0, 10) < beforeAsOfDate.slice(0, 10))
    .sort((a, b) => b.asOfDate.localeCompare(a.asOfDate))[0];
}
