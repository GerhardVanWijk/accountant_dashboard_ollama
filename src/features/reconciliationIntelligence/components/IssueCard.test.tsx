import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReconciliationIssue } from '@/types';
import { IssueCard } from './IssueCard';

function issue(overrides: Partial<ReconciliationIssue>): ReconciliationIssue {
  return {
    id: 'iss-1',
    createdAt: '',
    updatedAt: '',
    bankAccountId: 'ba-1',
    statementDate: '2026-08-31',
    issueType: 'amount_mismatch',
    severity: 'medium',
    confidence: 78,
    effectAmount: 0.16,
    relatedBankTransactionIds: [],
    relatedJournalEntryIds: [],
    relatedSourceDocumentIds: [],
    explanation: 'Bank fee recorded as R47.50 but imported as R47.66.',
    evidence: [{ label: 'prose fallback bullet' }],
    suggestedResolution: 'Correct the bank charge allocation.',
    autoResolutionSafe: false,
    status: 'open',
    ...overrides,
  };
}

const noop = vi.fn(async () => {});
const handlers = { onReview: noop, onDismiss: noop, onMarkAutoSafe: noop, onResolve: noop };

describe('IssueCard — structured evidence', () => {
  it('renders evidenceData.factors as met "Why" and unmet "Potential concern" instead of the prose bullets', () => {
    render(
      <IssueCard
        {...handlers}
        issue={issue({
          evidenceData: {
            factors: [
              { key: 'amt', label: 'amount exact', points: 30, maxPoints: 30, met: true },
              { key: 'date', label: 'date within 1 day', points: 10, maxPoints: 10, met: true },
              { key: 'ref', label: 'reference differs', points: 0, maxPoints: 15, met: false },
            ],
          },
        })}
      />,
    );

    expect(screen.getByText('Why:')).toBeInTheDocument();
    expect(screen.getByText(/✓ amount exact/)).toBeInTheDocument();
    expect(screen.getByText('Potential concern:')).toBeInTheDocument();
    expect(screen.getByText(/⚠ reference differs/)).toBeInTheDocument();
    expect(screen.queryByText(/prose fallback bullet/)).not.toBeInTheDocument();
  });

  it('falls back to prose evidence bullets when there are no factors', () => {
    render(<IssueCard {...handlers} issue={issue({})} />);
    expect(screen.getByText(/prose fallback bullet/)).toBeInTheDocument();
  });

  it('a combination issue shows the literal arithmetic string', () => {
    render(
      <IssueCard
        {...handlers}
        issue={issue({
          issueType: 'combination_match',
          effectAmount: 405.4,
          evidenceData: {
            combinationTerms: [
              { label: 'fee a', amountCents: 9500 },
              { label: 'fee b', amountCents: 31040 },
            ],
            combinationTotalCents: 40540,
          },
        })}
      />,
    );
    expect(screen.getByTestId('combination-arithmetic')).toHaveTextContent('R95.00 + R310.40 = R405.40');
  });
});
