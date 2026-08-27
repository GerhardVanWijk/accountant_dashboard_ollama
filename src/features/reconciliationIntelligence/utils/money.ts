/**
 * Every detector in this module works in integer cents internally so a
 * R0.16 discrepancy can never be lost or fabricated by binary
 * floating-point drift (docs — reconciliation intelligence spec's "never
 * depend on unsafe binary floating-point equality for money"). Conversion
 * happens only at the boundary: reading Rand `number` amounts off existing
 * domain types (BankTransaction.amount, JournalLine.debit/credit — both
 * stay plain decimal Rand, unchanged) in, and formatting back to Rand for
 * ReconciliationIssue.effectAmount / UI display out.
 */
export function toCents(rand: number): number {
  return Math.round(rand * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function centsAbs(cents: number): number {
  return Math.abs(cents);
}
