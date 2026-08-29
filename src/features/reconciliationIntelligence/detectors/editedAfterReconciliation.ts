import type { JournalEntry } from '@/types';
import type { BankReconciliation, BankTransactionWithAllocations } from '@/features/banking/types';
import type { ReconciliationIssueDraft } from '../types';
import { buildEvidence } from '../utils/evidence';
import { renderExplanation } from '../utils/renderExplanation';
import { toCents } from '../utils/money';

/**
 * This app already structurally prevents editing a reconciled
 * BankTransaction's accounting-relevant fields — allocateTransaction()/
 * deleteTransaction() both refuse once status is 'reconciled', and a
 * posted JournalEntry has no update() at all (docs/LEDGER_ARCHITECTURE.md).
 * The one path that genuinely remains, and is real and detectable: the
 * JournalEntry a cleared transaction was linked to gets REVERSED later —
 * reverseJournalEntry() has no guard against reversing an entry that
 * backs a finalized reconciliation. That's a legitimate correction
 * mechanism, but it means the reconciliation's own snapshot is now stale
 * — the cleared amount it certified no longer reflects current posted
 * history. Detected by checking, for every transaction a finalized
 * reconciliation cleared, whether any OTHER entry reverses its linked
 * JournalEntry at a date after the reconciliation's own finalizedAt.
 */
export function detectEditedAfterReconciliation(
  reconciliations: BankReconciliation[],
  transactions: BankTransactionWithAllocations[],
  journalEntries: JournalEntry[],
): ReconciliationIssueDraft[] {
  const issues: ReconciliationIssueDraft[] = [];
  const transactionById = new Map(transactions.map((t) => [t.id, t]));
  const entryById = new Map(journalEntries.map((e) => [e.id, e]));
  const reversalsByOriginalId = new Map<string, JournalEntry>();
  for (const entry of journalEntries) {
    if (entry.reversalOfEntryId) reversalsByOriginalId.set(entry.reversalOfEntryId, entry);
  }

  for (const reconciliation of reconciliations) {
    for (const transactionId of reconciliation.clearedTransactionIds) {
      const transaction = transactionById.get(transactionId);
      if (!transaction?.journalEntryId) continue;

      const originalEntry = entryById.get(transaction.journalEntryId);
      const reversal = reversalsByOriginalId.get(transaction.journalEntryId);
      if (!originalEntry || !reversal) continue;
      if (!reversal.postedAt || reversal.postedAt <= reconciliation.finalizedAt) continue;

      const { value: confidence, evidence, evidenceData } = buildEvidence({
        detectorType: 'edited_after_reconciliation',
        factors: [
          {
            key: 'cleared_by_finalized_reconciliation',
            points: 50,
            maxPoints: 50,
            label: 'Cleared by a finalized reconciliation',
            detail: `${reconciliation.statementDate} (finalized ${reconciliation.finalizedAt})`,
            met: true,
          },
          {
            key: 'journal_entry_reversed_after',
            points: 50,
            maxPoints: 50,
            label: 'Its journal entry was reversed afterward',
            detail: `Reversal ${reversal.entryNumber}, posted ${reversal.postedAt}`,
            met: true,
          },
        ],
        fields: {
          varianceExplainedCents: toCents(transaction.amount),
          bankAmountCents: toCents(transaction.amount),
          counterpartyLabel: transaction.description,
          candidateSourceType: 'journal_entry',
          candidateSourceId: reversal.id,
          observedDateFrom: transaction.date,
          observedDateTo: reversal.date,
        },
      });

      issues.push({
        issueType: 'edited_after_reconciliation',
        severity: 'critical',
        confidence,
        effectAmount: transaction.amount,
        affectedDateFrom: transaction.date,
        affectedDateTo: reversal.date,
        relatedBankTransactionIds: [transaction.id],
        relatedJournalEntryIds: [originalEntry.id, reversal.id],
        relatedSourceDocumentIds: [],
        explanation: renderExplanation(evidenceData, 'edited_after_reconciliation'),
        evidence,
        evidenceData,
        suggestedResolution: 'Review the reversal and prepare a correcting entry for the next open period — the finalized reconciliation itself cannot and should not be edited.',
        autoResolutionSafe: false,
      });
    }
  }

  return issues;
}
