import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReconciliationIssue } from '@/types';
import { computeReconciliationHealth } from '../services/reconciliationHealthService';
import type { InvestigationResult } from '../services';

function issue(o: Partial<ReconciliationIssue>): ReconciliationIssue {
  return {
    id: Math.random().toString(),
    createdAt: '',
    updatedAt: '',
    bankAccountId: 'ba-1',
    statementDate: '2026-08-31',
    issueType: 'amount_mismatch',
    severity: 'medium',
    confidence: 80,
    effectAmount: 100,
    relatedBankTransactionIds: [],
    relatedJournalEntryIds: [],
    relatedSourceDocumentIds: [],
    explanation: 'x',
    evidence: [{ label: 'y' }],
    suggestedResolution: 'z',
    autoResolutionSafe: false,
    status: 'open',
    ...o,
  };
}

const exact = issue({ id: 'exact-1', issueType: 'amount_mismatch', explanation: 'exact cause here' });
const structural = issue({ id: 'struct-1', issueType: 'duplicate_transaction', explanation: 'duplicate rent payment' });
const combo = issue({
  id: 'combo-1',
  issueType: 'combination_match',
  explanation: 'R95.00 + R310.40 = R405.40',
  effectAmount: 405.4,
  evidenceData: { combinationTerms: [{ label: 'a', amountCents: 9500 }, { label: 'b', amountCents: 31040 }], combinationTotalCents: 40540 },
});
const timing = issue({ id: 'timing-1', issueType: 'date_offset_timing', explanation: 'cheque not yet presented' });
const strong = issue({ id: 'strong-1', issueType: 'wrong_bank_account', confidence: 88, explanation: 'strong candidate' });

const result: InvestigationResult = {
  summary: {} as InvestigationResult['summary'],
  fullyExplained: false,
  issues: [exact, structural, combo, timing, strong],
  sections: {
    exactCauses: [exact],
    strongCandidates: [strong],
    timingItems: [timing],
    structuralIssues: [structural],
    combinationExplanations: [combo],
  },
  health: computeReconciliationHealth(10, 6, 2, 1, 405.4, 405.4),
  timeline: { points: [], firstAppearanceDate: undefined },
};

const controller = {
  result,
  isInvestigating: false,
  error: null as Error | null,
  investigate: vi.fn(),
  reviewIssue: vi.fn(),
  dismissIssue: vi.fn(),
  markAutoSafe: vi.fn(),
  resolveIssue: vi.fn(),
};

vi.mock('../hooks/useDifferenceInvestigator', () => ({
  useDifferenceInvestigator: () => controller,
}));

import { DifferenceInvestigatorPanel } from './DifferenceInvestigatorPanel';

describe('DifferenceInvestigatorPanel — sectioned (PART H)', () => {
  function renderPanel() {
    render(
      <DifferenceInvestigatorPanel
        bankAccountId="ba-1"
        statementDate="2026-08-31T00:00:00.000Z"
        statementBalance={100}
        clearedTransactionIds={[]}
        variance={-405.4}
      />,
    );
  }

  it('renders the five headed sections', () => {
    renderPanel();
    expect(screen.getByText('Exact causes found')).toBeInTheDocument();
    expect(screen.getByText('Strong candidates')).toBeInTheDocument();
    expect(screen.getByText('Timing items')).toBeInTheDocument();
    expect(screen.getByText('Structural / bookkeeping issues')).toBeInTheDocument();
    expect(screen.getByText('Combination explanations')).toBeInTheDocument();
  });

  it('the combination section shows the literal arithmetic string', () => {
    renderPanel();
    expect(screen.getByTestId('combination-arithmetic')).toHaveTextContent('R95.00 + R310.40 = R405.40');
  });
});
