/**
 * PART P — short, accountant-friendly help text for the reconciliation state
 * chips and the summary metric labels. `docs/CURRENT_TASKS.md` PART P is still
 * a stub header (no verbatim strings to lift), so these are written here to
 * PART P's brief: plain language, one sentence, non-accountant readable. If
 * PART P is later filled in with exact copy, replace these values in place.
 */
export const RECON_TOOLTIPS = {
  // line / issue state chips
  confirmed: 'Vertex found one accounting entry that matches this bank line exactly — same amount, date and direction.',
  probable: 'Vertex found a likely accounting entry, but something differs (usually the date or the reference). Check it before confirming.',
  needsReview: 'Vertex could not confidently match this line. A person needs to look at it.',
  missingInBooks: 'The bank shows this transaction, but there is no matching entry in Vertex yet — it still needs to be recorded.',
  unmatched: 'No accounting counterpart has been linked to this bank line yet.',
  outstanding: 'This has been recorded in Vertex but has not appeared on the bank statement yet — a normal timing difference.',
  amountMismatch: 'The bank and the books show different amounts for the same transaction.',
  wrongSign: 'The transaction was recorded as a payment where it should be a receipt, or the other way around.',
  explained: 'This line is not a direct match, but the difference has been accounted for by a documented cause.',
  ignored: 'A person deliberately excluded this line from the reconciliation.',

  // summary metrics
  statementLineCount: 'How many individual transactions the bank statement lists for this period.',
  varianceExplained: 'Of the money gap between the bank and the books, how much now has a documented cause.',
  varianceRemaining: 'The part of the money gap that still has no explanation.',
  statementClosingBalance: 'The closing balance the bank states on this statement.',
  booksBankBalance: "Vertex's own balance for this bank account (the general-ledger cashbook).",
  statementVsBooksDifference: 'The bank closing balance minus the Vertex bank balance. Zero means they agree.',
  matchCoverage: 'The share of bank lines that found their accounting counterpart. Not the same as the money being fully explained.',
} as const;

export type ReconTooltipKey = keyof typeof RECON_TOOLTIPS;
