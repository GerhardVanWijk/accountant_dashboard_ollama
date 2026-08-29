import { describe, expect, it } from 'vitest';
import { buildEvidence, DETECTOR_VERSION } from './evidence';
import { renderExplanation } from './renderExplanation';

describe('buildEvidence', () => {
  it('scores confidence as the sum of met factors only, and reports the ceiling', () => {
    const { value, valueMax, evidence } = buildEvidence({
      detectorType: 'amount_mismatch',
      factors: [
        { key: 'a', label: 'Same date', points: 25, maxPoints: 25, met: true },
        { key: 'b', label: 'Reference matches', points: 20, maxPoints: 20, met: false },
        { key: 'c', label: 'Description overlaps', points: 15, maxPoints: 15, met: true },
        { key: 'd', label: 'Exactly explains variance', points: 40, maxPoints: 40, met: false },
      ],
    });

    expect(value).toBe(40); // 25 + 15
    expect(valueMax).toBe(100); // 25 + 20 + 15 + 40
    // Prose view is MET factors only — it reads as the explanation of the score.
    expect(evidence.map((e) => e.label)).toEqual(['Same date', 'Description overlaps']);
  });

  it('populates every ReconciliationEvidenceData field the detector supplied, plus the full factor scorecard', () => {
    const { evidenceData } = buildEvidence({
      detectorType: 'amount_mismatch',
      factors: [
        { key: 'same_date', label: 'Same date', points: 25, maxPoints: 25, met: true, observedValue: '0 days' },
        { key: 'reference_match', label: 'Reference matches', points: 20, maxPoints: 20, met: false, observedValue: 0.16 },
        { key: 'explains_whole_variance', label: 'Difference exactly equals the unexplained reconciliation amount', points: 40, maxPoints: 40, met: true, observedValue: true },
      ],
      fields: {
        amountDifferenceCents: -16,
        dateDifferenceDays: 0,
        referenceSimilarity: 0.16,
        sameCounterparty: true,
        sameDirection: true,
        sameBankAccount: true,
        candidateSourceType: 'journal_entry',
        candidateSourceId: 'je-1',
        varianceExplainedCents: 16,
        explainsVarianceExactly: true,
        bankAmountCents: -4766,
        booksAmountCents: -4750,
        counterpartyLabel: 'Card machine settlement fee',
        observedDateFrom: '2026-08-20',
        observedDateTo: '2026-08-20',
      },
    });

    expect(evidenceData.detectorType).toBe('amount_mismatch');
    expect(evidenceData.detectorVersion).toBe(DETECTOR_VERSION);
    expect(evidenceData.confidenceMax).toBe(85);
    expect(evidenceData.amountDifferenceCents).toBe(-16);
    expect(evidenceData.dateDifferenceDays).toBe(0);
    expect(evidenceData.referenceSimilarity).toBe(0.16);
    expect(evidenceData.sameCounterparty).toBe(true);
    expect(evidenceData.sameDirection).toBe(true);
    expect(evidenceData.sameBankAccount).toBe(true);
    expect(evidenceData.candidateSourceType).toBe('journal_entry');
    expect(evidenceData.candidateSourceId).toBe('je-1');
    expect(evidenceData.varianceExplainedCents).toBe(16);
    expect(evidenceData.explainsVarianceExactly).toBe(true);
    expect(evidenceData.bankAmountCents).toBe(-4766);
    expect(evidenceData.booksAmountCents).toBe(-4750);
    expect(evidenceData.counterpartyLabel).toBe('Card machine settlement fee');

    // The factor scorecard keeps MET and UNMET factors so a reader sees "2 of 3 met".
    expect(evidenceData.factors).toHaveLength(3);
    const unmet = evidenceData.factors!.filter((f) => !f.met);
    expect(unmet.map((f) => f.key)).toEqual(['reference_match']);
    expect(unmet[0].points).toBe(0);
    expect(unmet[0].maxPoints).toBe(20);
    const met = evidenceData.factors!.find((f) => f.key === 'same_date')!;
    expect(met.points).toBe(25);
    expect(met.observedValue).toBe('0 days');
  });

  it('the explanation is rendered from the evidence data, not hand-written', () => {
    const { evidenceData } = buildEvidence({
      detectorType: 'missing_ledger_side',
      factors: [{ key: 'no_ledger_counterpart', label: 'No matching accounting entry', points: 30, maxPoints: 30, met: true }],
      fields: {
        bankAmountCents: -18550,
        counterpartyLabel: 'Cash handling fee',
        observedDateFrom: '2026-08-22',
        ageDays: 9,
        isStale: true,
      },
    });

    const text = renderExplanation(evidenceData, 'missing_ledger_side');
    expect(text).toContain('Cash handling fee');
    expect(text).toContain('R185.50');
    expect(text).toContain('2026-08-22');
  });

  it('clamps confidence to 0-100 even if the factor points overshoot', () => {
    const { value, valueMax } = buildEvidence({
      detectorType: 'combination_match',
      factors: [
        { key: 'a', label: 'a', points: 80, maxPoints: 80, met: true },
        { key: 'b', label: 'b', points: 80, maxPoints: 80, met: true },
      ],
    });
    expect(value).toBe(100);
    expect(valueMax).toBe(100);
  });
});
