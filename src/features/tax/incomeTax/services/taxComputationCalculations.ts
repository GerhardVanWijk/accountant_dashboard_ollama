import type { Account, AssetDisposal, FixedAsset, ID, IncomeTaxYearConfig, JournalEntry, SbcTaxBracket, TaxAdjustment } from '@/types';

/** Half a cent — same rounding tolerance as journalEntryService.ts/depreciationService.ts. */
const EPSILON = 0.005;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Matches taxRegisterService.ts's yearsElapsed() constant exactly, so a cumulative-allowance-to-date figure computed here never disagrees with the Tax Register's own math. */
const MS_PER_YEAR = 365.25 * MS_PER_DAY;

/** Chart of Accounts code this module reads — the periodic accounting depreciation charge, not tax-deductible on its own (§51). Matched by `code`, not a fixed id (account ids are real Supabase-generated uuids). */
const DEPRECIATION_EXPENSE_ACCOUNT_CODE = '5200';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function yearsElapsed(fromISO: string, toISO: string): number {
  return Math.max(0, (new Date(toISO).getTime() - new Date(fromISO).getTime()) / MS_PER_YEAR);
}

/**
 * Accounting profit for a financial year (SA_ACCOUNTING_MASTER_SPEC.md
 * §51's reconciliation starting point): sum(revenue-type net movement) -
 * sum(expense-type net movement) across every POSTED JournalEntry dated
 * within [startDateISO, endDateISO], inclusive. Mirrors
 * src/features/dashboard/utils/calculateMonthlyFinancials.ts's approach
 * (own aggregator, not imported — that file is dashboard-owned) but over
 * one financial-year range instead of month buckets. A reversal entry is
 * itself 'posted' (the original is never mutated), so including every
 * posted entry nets a reversed transaction back to zero automatically,
 * same rationale as the dashboard's version.
 */
export function calculateAccountingProfit(
  entries: JournalEntry[],
  accounts: Account[],
  startDateISO: string,
  endDateISO: string,
): number {
  const accountType = new Map(accounts.map((a) => [a.id, a.type]));
  const start = new Date(startDateISO).getTime();
  const end = new Date(endDateISO).getTime();
  let revenue = 0;
  let expenses = 0;

  for (const entry of entries) {
    if (entry.status !== 'posted') continue;
    const t = new Date(entry.date).getTime();
    if (t < start || t > end) continue;

    for (const line of entry.lines) {
      const type = accountType.get(line.accountId);
      if (type === 'revenue') {
        revenue += line.credit - line.debit;
      } else if (type === 'expense') {
        expenses += line.debit - line.credit;
      }
    }
  }

  return round2(revenue - expenses);
}

/**
 * The accounting depreciation charge posted to acc_5200 within the
 * period — an ADD-BACK for tax purposes (§51): accounting depreciation is
 * never itself SARS-deductible, only the wear-and-tear allowance is (see
 * calculateWearAndTearAllowanceForPeriod below).
 */
export function calculateDepreciationAddback(entries: JournalEntry[], accounts: Account[], startDateISO: string, endDateISO: string): number {
  const depreciationExpenseAccountId = accounts.find((a) => a.code === DEPRECIATION_EXPENSE_ACCOUNT_CODE)?.id;
  const start = new Date(startDateISO).getTime();
  const end = new Date(endDateISO).getTime();
  let total = 0;

  for (const entry of entries) {
    if (entry.status !== 'posted') continue;
    const t = new Date(entry.date).getTime();
    if (t < start || t > end) continue;

    for (const line of entry.lines) {
      if (depreciationExpenseAccountId && line.accountId === depreciationExpenseAccountId) {
        total += line.debit - line.credit;
      }
    }
  }

  return round2(total);
}

/**
 * Each eligible asset's SARS wear-and-tear allowance FOR THIS PERIOD
 * SPECIFICALLY (§51/§53's tax-allowances category), not cumulative to
 * date — a DEDUCTION for tax purposes. For every asset with a
 * taxWearTearRatePercent set that was held (capitalized, not yet disposed
 * before the period started) at some point during [periodStartISO,
 * periodEndISO]:
 *
 *   annualAllowance = cost * (taxWearTearRatePercent / 100)
 *   prorated by the fraction of the period actually held (acquired or
 *     disposed mid-period narrows the window), then
 *   capped so the CUMULATIVE allowance claimed (as of the period start,
 *     computed the same way taxRegisterService.ts's yearsElapsed-based
 *     allowanceClaimed is) plus this period's charge never exceeds cost —
 *     mirrors depreciationService.calculateMonthlyDepreciation()'s
 *     "clip the last period's charge to whatever remains" pattern, applied
 *     to the tax allowance instead of the accounting depreciation charge.
 *
 * Draft assets (never capitalized) are excluded, same as
 * TaxRegisterService.getTaxRegister().
 */
export function calculateWearAndTearAllowanceForPeriod(
  assets: FixedAsset[],
  periodStartISO: string,
  periodEndISO: string,
): number {
  const periodStart = new Date(periodStartISO).getTime();
  const periodEnd = new Date(periodEndISO).getTime();
  const periodDays = (periodEnd - periodStart) / MS_PER_DAY + 1;
  if (periodDays <= 0) return 0;

  let total = 0;
  for (const asset of assets) {
    if (asset.status === 'draft') continue;
    if (asset.taxWearTearRatePercent === undefined) continue;

    const acquisition = new Date(asset.acquisitionDate).getTime();
    const disposal = asset.disposalDate ? new Date(asset.disposalDate).getTime() : undefined;
    const effectiveStart = Math.max(acquisition, periodStart);
    const effectiveEnd = Math.min(disposal ?? periodEnd, periodEnd);
    if (effectiveStart > effectiveEnd) continue; // not held at any point during this period

    const daysHeld = (effectiveEnd - effectiveStart) / MS_PER_DAY + 1;
    const annualAllowance = asset.cost * (asset.taxWearTearRatePercent / 100);
    const proratedAllowance = annualAllowance * (daysHeld / periodDays);

    const allowanceClaimedToStart = Math.min(asset.cost, annualAllowance * yearsElapsed(asset.acquisitionDate, periodStartISO));
    const remainingCap = Math.max(0, asset.cost - allowanceClaimedToStart);

    total += Math.max(0, Math.min(proratedAllowance, remainingCap));
  }

  return round2(total);
}

/**
 * Suggested (pre-filled, user-editable) adjustment lines for every Fixed
 * Asset disposal dated within the period, one per disposal, per
 * SA_ACCOUNTING_MASTER_SPEC.md §55's "separate accounting gain/loss from
 * taxable capital gain" instruction: the ACCOUNTING gainLoss (already
 * posted to acc_4200/acc_5300 by AssetDisposalService) must be fully
 * removed from taxable income here — a gain is subtracted back out
 * (it will be taxed separately as a recoupment/capital gain once the
 * capital-gains module exists), a loss is added back (a capital loss is
 * not an ordinary tax deduction). Zero-gainLoss disposals produce no line.
 */
export function suggestDisposalAddbackAdjustments(
  disposals: AssetDisposal[],
  assets: FixedAsset[],
  periodStartISO: string,
  periodEndISO: string,
): TaxAdjustment[] {
  const assetsById = new Map<ID, FixedAsset>(assets.map((a) => [a.id, a]));
  const start = new Date(periodStartISO).getTime();
  const end = new Date(periodEndISO).getTime();
  const adjustments: TaxAdjustment[] = [];
  let seq = 0;

  for (const disposal of disposals) {
    const t = new Date(disposal.disposalDate).getTime();
    if (t < start || t > end) continue;
    if (Math.abs(disposal.gainLoss) <= EPSILON) continue;

    const asset = assetsById.get(disposal.assetId);
    const label = asset ? `${asset.assetNumber} - ${asset.name}` : disposal.assetId;
    seq += 1;

    if (disposal.gainLoss > 0) {
      adjustments.push({
        id: `sugg_disposal_${seq}`,
        category: 'disposal_gain_loss_addback',
        description: `Remove accounting gain on disposal of ${label} (taxed separately as a recoupment/capital gain — see the placeholder line below, not ordinary income)`,
        amount: round2(disposal.gainLoss),
        direction: 'subtract',
      });
    } else {
      adjustments.push({
        id: `sugg_disposal_${seq}`,
        category: 'disposal_gain_loss_addback',
        description: `Add back accounting loss on disposal of ${label} (not deductible as an ordinary loss)`,
        amount: round2(-disposal.gainLoss),
        direction: 'add',
      });
    }
  }

  return adjustments;
}

/** Signed sum of every adjustment line: 'add' lines increase taxable income, 'subtract' lines decrease it. */
export function netAdjustmentAmount(adjustments: TaxAdjustment[]): number {
  return round2(adjustments.reduce((sum, a) => sum + (a.direction === 'add' ? a.amount : -a.amount), 0));
}

/** accountingProfit + sum(adjustments, signed) — §51's reconciliation result. */
export function calculateTaxableIncome(accountingProfit: number, adjustments: TaxAdjustment[]): number {
  return round2(accountingProfit + netAdjustmentAmount(adjustments));
}

/** Flat corporate rate (§52) — a loss (taxableIncome <= 0) owes nothing, never a negative liability. */
export function calculateFlatTaxLiability(taxableIncome: number, ratePercent: number): number {
  const base = Math.max(0, taxableIncome);
  return round2(base * (ratePercent / 100));
}

/**
 * SBC progressive bracket tax (§53): baseAmount + (taxableIncome -
 * appliesAboveAmount) * marginalRatePercent, using whichever bracket's
 * [lowerBound, upperBound] range contains taxableIncome. Continuous at
 * every boundary by construction of the seeded table (e.g. exactly
 * R365,000 -> R18,620, exactly R550,000 -> R57,470) — see
 * src/mock-data/corporateTaxConfig.ts. A loss or zero taxable income owes
 * nothing.
 */
export function calculateSbcTaxLiability(taxableIncome: number, brackets: SbcTaxBracket[]): number {
  if (taxableIncome <= 0) return 0;
  const bracket = brackets.find(
    (b) => taxableIncome >= b.lowerBound && (b.upperBound === null || taxableIncome <= b.upperBound),
  );
  if (!bracket) {
    throw new Error(`No SBC tax bracket covers taxable income of ${taxableIncome} — check the bracket table for gaps.`);
  }
  return round2(bracket.baseAmount + (taxableIncome - bracket.appliesAboveAmount) * (bracket.marginalRatePercent / 100));
}

/** Dispatches to the SBC bracket table or the flat corporate rate, per Company.isSbcEligible. */
export function calculateTaxLiability(taxableIncome: number, isSbcEligible: boolean, config: IncomeTaxYearConfig): number {
  return isSbcEligible
    ? calculateSbcTaxLiability(taxableIncome, config.sbcBrackets)
    : calculateFlatTaxLiability(taxableIncome, config.corporateTaxRatePercent);
}
