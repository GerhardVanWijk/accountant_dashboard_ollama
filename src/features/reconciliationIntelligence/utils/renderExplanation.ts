import type { ReconciliationEvidenceData, ReconciliationIssueType } from '@/types';

/**
 * Turns a fully-populated `ReconciliationEvidenceData` back into the
 * human-readable `ReconciliationIssue.explanation` sentence — so the prose a
 * user reads is *generated from the same data the confidence score is*, never
 * a separately hand-written sentence that could drift from the evidence
 * (docs/BANK_STATEMENT_ARCHITECTURE_AUDIT.md — "do not store only a vague
 * sentence"). Every detector calls this instead of composing its own string.
 */

const rand = (cents: number | undefined): string => `R${Math.abs((cents ?? 0) / 100).toFixed(2)}`;
const signedRand = (cents: number | undefined): string => `${(cents ?? 0) >= 0 ? '+' : '-'}R${Math.abs((cents ?? 0) / 100).toFixed(2)}`;

function combinationArithmetic(d: ReconciliationEvidenceData): string {
  const terms = d.combinationTerms ?? [];
  const total = d.combinationTotalCents ?? terms.reduce((s, t) => s + t.amountCents, 0);
  const lhs = terms.map((t) => `${rand(t.amountCents)} (${t.label})`).join(' + ');
  return `${lhs} = ${rand(total)}`;
}

export function renderExplanation(d: ReconciliationEvidenceData, issueType: ReconciliationIssueType): string {
  const label = d.counterpartyLabel ?? 'this transaction';
  const dateFrom = d.observedDateFrom;
  const exact = d.explainsVarianceExactly
    ? ' This difference exactly equals the reconciliation’s unexplained amount.'
    : '';

  switch (issueType) {
    case 'amount_mismatch':
      return (
        `Bank shows ${rand(d.bankAmountCents)} for "${label}", books show ${rand(d.booksAmountCents)}` +
        ` — a difference of ${rand(d.amountDifferenceCents)}.${exact}`
      );

    case 'transposition_error':
      return (
        `Likely transposed digits for "${label}": bank shows ${rand(d.bankAmountCents)}, ` +
        `books show ${rand(d.booksAmountCents)} — a difference of ${rand(d.amountDifferenceCents)}.${exact}`
      );

    case 'missing_ledger_side':
      return (
        `The bank shows "${label}" for ${rand(d.bankAmountCents)}${dateFrom ? ` on ${dateFrom}` : ''}, ` +
        `but no accounting entry explains it${d.isStale ? ` — ${d.ageDays} day(s) old and still unrecorded` : ''}.`
      );

    case 'missing_bank_side':
      return d.isStale
        ? `The books show "${label}" for ${rand(d.booksAmountCents)}${dateFrom ? ` on ${dateFrom}` : ''}, ` +
            `still not on the bank statement ${d.ageDays} day(s) later — check it was actually processed, and on the right account.`
        : `The books show "${label}" for ${rand(d.booksAmountCents)}${dateFrom ? ` on ${dateFrom}` : ''}, ` +
            `not yet on the bank statement — likely still in transit.`;

    case 'date_offset_timing':
      return (
        `Bank shows this ${d.observedDateFrom}, books record it ${d.observedDateTo} — same amount ` +
        `(${rand(d.bankAmountCents)}), ${d.dateDifferenceDays} day(s) apart. A normal timing difference, not a real discrepancy.`
      );

    case 'duplicate_transaction':
      return (
        `Two ${d.bankAmountCents !== undefined ? 'bank' : 'books'} entries of ` +
        `${rand(d.bankAmountCents ?? d.booksAmountCents)}, ${d.dateDifferenceDays} day(s) apart, look like "${label}" recorded twice.`
      );

    case 'wrong_sign':
      return (
        `Bank shows ${signedRand(d.bankAmountCents)} for "${label}", books show the same amount the opposite way ` +
        `— a likely debit/credit reversal. Reconciliation effect: ${rand(d.swingCents)} (double the transaction amount).`
      );

    case 'wrong_bank_account':
      return (
        `"${label}" (${rand(d.booksAmountCents)}) is unexplained here, but a matching item appears on ` +
        `${d.otherAccountName ?? 'another account'}’s bank statement instead — likely posted to the wrong bank account.`
      );

    case 'vat_difference':
      return (
        `${rand(d.bankAmountCents)} vs ${rand(d.booksAmountCents)} for "${label}" — the ${rand(d.amountDifferenceCents)} gap ` +
        `is consistent with a ${d.vatRatePercent}% VAT inclusive/exclusive mismatch, wrong rate, or VAT posted once instead of twice.`
      );

    case 'grouped_match':
      return (
        `One entry of ${rand(d.groupSingleCents)} matches ${d.groupPartCount} separate entries on the other side: ` +
        `${combinationArithmetic(d)}.`
      );

    case 'combination_match':
      return `We found a combination that explains the ${rand(d.combinationTotalCents)} difference: ${combinationArithmetic(d)}.${exact}`;

    case 'rounding_variance':
      return `Accumulated rounding across ${d.combinationTerms?.length ?? 0} entries exactly explains the ${rand(d.combinationTotalCents)} difference: ${combinationArithmetic(d)}.`;

    case 'opening_balance_discrepancy':
      return (
        `The current period’s own transactions reconcile — the ${rand(d.combinationTotalCents ?? d.varianceExplainedCents)} ` +
        `discrepancy already existed before ${d.observedDateTo}.`
      );

    case 'edited_after_reconciliation':
      return (
        `"${label}" (${rand(d.bankAmountCents ?? d.booksAmountCents)}) was cleared by a finalized reconciliation, but its ` +
        `journal entry was reversed afterward — that reconciliation’s snapshot no longer reflects current posted history.`
      );

    default:
      return `Candidate explanation for ${rand(d.varianceExplainedCents)} of the unexplained difference.`;
  }
}
