import type { InvestigationCandidate, ReconciliationIssueDraft } from '../types';
import { buildEvidence } from '../utils/evidence';
import { renderExplanation } from '../utils/renderExplanation';
import { fromCents } from '../utils/money';

const STALE_AFTER_DAYS = 7;

function daysBefore(date: string, statementDate: string): number {
  const diffMs = new Date(statementDate).getTime() - new Date(date).getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Every candidate that classifyMatches() (and any earlier, more specific
 * detector — amount mismatch, wrong-sign, grouped/combination matches) left
 * genuinely unexplained becomes either a "the bank shows this, nothing in
 * the books" (missing_ledger_side — a bank fee/interest/debit order/EFT fee
 * nobody recorded, spec's worked examples) or "the books show this, nothing
 * on the bank" (missing_bank_side — a payment entered but never processed,
 * or dated/banked wrong). Confidence rises with age past
 * `staleAfterDays` — a genuinely recent item is an ordinary outstanding
 * timing difference (already correctly netted by
 * bankReconciliationService.computeSummary()'s adjustedBankBalance
 * formula), not evidence of a real problem yet.
 */
export function detectMissingEntries(
  unmatchedBank: InvestigationCandidate[],
  unmatchedBooks: InvestigationCandidate[],
  statementDate: string,
  staleAfterDays: number = STALE_AFTER_DAYS,
): ReconciliationIssueDraft[] {
  const issues: ReconciliationIssueDraft[] = [];

  for (const item of unmatchedBank) {
    const ageDays = daysBefore(item.date, statementDate);
    const isStale = ageDays > staleAfterDays;
    const bankInitiated = /fee|charge|interest|debit order|levy/i.test(item.description);
    const { value: confidence, evidence, evidenceData } = buildEvidence({
      detectorType: 'missing_ledger_side',
      factors: [
        { key: 'no_ledger_counterpart', points: 30, maxPoints: 30, label: 'No matching accounting entry found within the tolerance window', met: true },
        { key: 'aged_past_stale', points: 30, maxPoints: 30, label: `${ageDays} day(s) old as of the statement date`, met: isStale, observedValue: `${ageDays} days` },
        { key: 'bank_initiated_shape', points: 15, maxPoints: 15, label: 'Likely a bank-initiated item (fee, interest, or debit order)', met: bankInitiated, observedValue: bankInitiated },
      ],
      fields: {
        candidateSourceType: item.kind === 'statement_line' ? 'statement_line' : 'bank_transaction',
        candidateSourceId: item.id,
        varianceExplainedCents: Math.abs(item.amountCents),
        sameDirection: true,
        sameBankAccount: true,
        bankAmountCents: item.amountCents,
        counterpartyLabel: item.description,
        observedDateFrom: item.date,
        observedDateTo: item.date,
        ageDays,
        isStale,
      },
    });

    issues.push({
      issueType: 'missing_ledger_side',
      severity: isStale ? 'high' : 'medium',
      confidence,
      effectAmount: fromCents(item.amountCents),
      affectedDateFrom: item.date,
      affectedDateTo: item.date,
      relatedBankTransactionIds: [item.bankTransactionId].filter((x): x is string => Boolean(x)),
      relatedJournalEntryIds: [],
      relatedSourceDocumentIds: [],
      explanation: renderExplanation(evidenceData, 'missing_ledger_side'),
      evidence,
      evidenceData,
      suggestedResolution: 'Record the missing transaction through the normal Banking flow (e.g. Direct Payment/Receipt), then re-run the investigation.',
      autoResolutionSafe: false,
    });
  }

  for (const item of unmatchedBooks) {
    const ageDays = daysBefore(item.date, statementDate);
    const isStale = ageDays > staleAfterDays;
    const { value: confidence, evidence, evidenceData } = buildEvidence({
      detectorType: 'missing_bank_side',
      factors: [
        { key: 'no_bank_counterpart', points: 25, maxPoints: 25, label: 'No matching bank statement line found within the tolerance window', met: true },
        { key: 'aged_past_stale', points: 25, maxPoints: 25, label: `${ageDays} day(s) old as of the statement date`, met: isStale, observedValue: `${ageDays} days` },
        { key: 'recorded_in_books', points: 15, maxPoints: 15, label: 'Not from a bank import — recorded directly in the books', met: item.kind === 'bank_transaction' },
        { key: 'orphaned_journal', points: 20, maxPoints: 20, label: 'Posted straight to the bank GL account with no BankTransaction behind it', met: item.kind === 'journal_entry' },
      ],
      fields: {
        candidateSourceType: item.kind === 'journal_entry' ? 'journal_entry' : 'bank_transaction',
        candidateSourceId: item.id,
        varianceExplainedCents: Math.abs(item.amountCents),
        sameDirection: true,
        sameBankAccount: true,
        booksAmountCents: item.amountCents,
        counterpartyLabel: item.description,
        observedDateFrom: item.date,
        observedDateTo: item.date,
        ageDays,
        isStale,
      },
    });

    issues.push({
      issueType: 'missing_bank_side',
      severity: isStale ? 'medium' : 'low',
      confidence,
      effectAmount: fromCents(item.amountCents),
      affectedDateFrom: item.date,
      affectedDateTo: item.date,
      relatedBankTransactionIds: [item.bankTransactionId].filter((x): x is string => Boolean(x)),
      relatedJournalEntryIds: [item.journalEntryId].filter((x): x is string => Boolean(x)),
      relatedSourceDocumentIds: [],
      explanation: renderExplanation(evidenceData, 'missing_bank_side'),
      evidence,
      evidenceData,
      suggestedResolution: isStale
        ? 'Confirm the payment/deposit was actually processed by the bank; if it never was, correct or reverse it through the proper accounting flow.'
        : 'No action needed yet — a normal outstanding item. Revisit if it is still unmatched next period.',
      autoResolutionSafe: !isStale,
    });
  }

  return issues;
}
