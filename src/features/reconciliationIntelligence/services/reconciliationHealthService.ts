export interface ReconciliationHealth {
  totalBankTransactions: number;
  confirmed: number;
  probable: number;
  needsReview: number;
  unexplained: number;
  /** 0-100. */
  explainedPercent: number;
  unexplainedAmount: number;
}

/**
 * The single top-line "how good is this reconciliation" summary (spec's
 * "Reconciliation Health" example: "327 bank transactions, 318 confirmed,
 * 6 probable, 2 require review, 1 unexplained, 99.7% explained"). Scoped to
 * the BANK-side candidate pool specifically (the imported statement lines
 * for the period) since that is what the accountant is actually trying to
 * clear — every number here is a count of already-classified candidates,
 * never re-derived; this function only aggregates and computes the
 * percentage.
 */
export function computeReconciliationHealth(
  totalBankTransactions: number,
  confirmed: number,
  probable: number,
  needsReview: number,
  unexplainedAmount: number,
): ReconciliationHealth {
  const explained = confirmed + probable;
  const unexplained = Math.max(0, totalBankTransactions - confirmed - probable - needsReview);
  const explainedPercent = totalBankTransactions === 0 ? 100 : Math.round((explained / totalBankTransactions) * 1000) / 10;

  return {
    totalBankTransactions,
    confirmed,
    probable,
    needsReview,
    unexplained,
    explainedPercent,
    unexplainedAmount,
  };
}
