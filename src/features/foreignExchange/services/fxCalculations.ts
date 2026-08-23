/**
 * Pure FX gain/loss math (SA_ACCOUNTING_MASTER_SPEC.md §33). Every function
 * here is deterministic and side-effect free — no repository, no service,
 * just numbers in and numbers out — so it's independently testable with
 * hand-computable examples and safe to call directly from a client-side UI
 * (the FX Calculator page) without a service round-trip.
 *
 * SCOPE NOTE: these functions compute the gain/loss a foreign-currency
 * position WOULD produce; nothing in this codebase yet calls them from a
 * real posted document (no foreign-currency Invoice/Bill exists — see
 * exchangeRateService.ts's doc comment), so nothing here posts to the GL.
 */

/** Half a cent — same rounding tolerance used across every other posting/calculation service in this codebase. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** A foreign-currency position is either an ASSET (e.g. a foreign receivable) or a LIABILITY (e.g. a foreign payable) — the sign of the resulting gain/loss depends on which. */
export type FxPositionType = 'asset' | 'liability';

/** amount * rate, rounded to cents — centralizes rounding for every FX conversion in this module. */
export function convertAmount(amount: number, rate: number): number {
  return round2(amount * rate);
}

/**
 * Shared math behind both calculateRealizedFxGainLoss() and
 * calculateUnrealizedFxGainLoss(): the movement in the functional-currency
 * value of a fixed foreign-currency amount between two rates.
 *
 * For an ASSET (e.g. a foreign receivable — money owed TO the business),
 * the functional-currency value moving from rateA to rateB is a genuine
 * economic gain when the rate rises (each foreign-currency unit is now
 * worth more ZAR) — so gain/loss = valueAtB - valueAtA, unchanged sign.
 *
 * For a LIABILITY (e.g. a foreign payable — money owed BY the business),
 * the relationship inverts: when the rate rises, the business now owes
 * MORE functional currency to settle the same foreign-currency debt, which
 * is a LOSS, not a gain — so the sign of (valueAtB - valueAtA) must be
 * flipped for a liability.
 */
function fxMovement(foreignAmount: number, rateA: number, rateB: number, positionType: FxPositionType): number {
  const valueAtA = foreignAmount * rateA;
  const valueAtB = foreignAmount * rateB;
  const movement = valueAtB - valueAtA;
  return round2(positionType === 'asset' ? movement : -movement);
}

/**
 * Realized FX gain/loss: a foreign-currency amount recognized at
 * `rateAtRecognition` (e.g. invoice date) and actually settled at
 * `rateAtSettlement` (e.g. receipt/payment date) — the transaction is
 * closed out, so this gain/loss is final, not a revaluation estimate.
 *
 * Example: USD 1,000 recognized at 18.00, settled at 18.50.
 *  - Asset (foreign receivable): +R500 gain (each dollar received converts
 *    to more rand than it was booked at).
 *  - Liability (foreign payable): -R500 loss (it now costs R500 more to
 *    buy the dollars needed to settle the same debt).
 */
export function calculateRealizedFxGainLoss(
  foreignAmount: number,
  rateAtRecognition: number,
  rateAtSettlement: number,
  positionType: FxPositionType,
): number {
  return fxMovement(foreignAmount, rateAtRecognition, rateAtSettlement, positionType);
}

/**
 * Unrealized FX gain/loss: the same movement, but applied to a foreign
 * balance that is STILL OPEN at a period-end revaluation date rather than
 * actually settled — SA_ACCOUNTING_MASTER_SPEC.md §33/§34's "foreign
 * currency revaluation" at year-end (or any period-end). The math and sign
 * convention are identical to the realized case; only the meaning of the
 * second rate/date changes (a revaluation estimate, not a real settlement).
 */
export function calculateUnrealizedFxGainLoss(
  openForeignBalance: number,
  rateAtOriginalRecognition: number,
  rateAtRevaluationDate: number,
  positionType: FxPositionType,
): number {
  return fxMovement(openForeignBalance, rateAtOriginalRecognition, rateAtRevaluationDate, positionType);
}
