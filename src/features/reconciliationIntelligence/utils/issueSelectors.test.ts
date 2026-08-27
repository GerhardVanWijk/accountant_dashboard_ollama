import { describe, expect, it } from 'vitest';
import { selectIssuesForDisplay, filterIssuesByDate } from './issueSelectors';
import type { ReconciliationIssue } from '@/types';

function issue(overrides: Partial<ReconciliationIssue>): ReconciliationIssue {
  return {
    id: 'i1',
    createdAt: '',
    updatedAt: '',
    bankAccountId: 'acc1',
    statementDate: '2026-08-27',
    issueType: 'amount_mismatch',
    severity: 'medium',
    confidence: 50,
    effectAmount: 16.73,
    relatedBankTransactionIds: [],
    relatedJournalEntryIds: [],
    relatedSourceDocumentIds: [],
    explanation: '',
    evidence: [],
    suggestedResolution: '',
    autoResolutionSafe: false,
    status: 'open',
    ...overrides,
  };
}

describe('selectIssuesForDisplay', () => {
  it('ranks open/reviewed issues by confidence, highest first', () => {
    const issues = [issue({ id: 'a', confidence: 40 }), issue({ id: 'b', confidence: 90 }), issue({ id: 'c', confidence: 60, status: 'reviewed' })];

    const { ranked } = selectIssuesForDisplay(issues);

    expect(ranked.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('separates dismissed/resolved issues into settled, not re-ranked into the actionable list', () => {
    const issues = [issue({ id: 'a', status: 'dismissed' }), issue({ id: 'b', status: 'resolved' }), issue({ id: 'c', status: 'open' })];

    const { ranked, settled } = selectIssuesForDisplay(issues);

    expect(ranked.map((i) => i.id)).toEqual(['c']);
    expect(settled.map((i) => i.id).sort()).toEqual(['a', 'b']);
  });
});

describe('filterIssuesByDate', () => {
  it('returns every issue unchanged when no date is selected', () => {
    const issues = [issue({ id: 'a', affectedDateFrom: '2026-08-01', affectedDateTo: '2026-08-05' })];
    expect(filterIssuesByDate(issues, null)).toEqual(issues);
  });

  it('keeps only issues whose date range covers the selected date', () => {
    const inWindow = issue({ id: 'a', affectedDateFrom: '2026-08-01', affectedDateTo: '2026-08-10' });
    const outsideWindow = issue({ id: 'b', affectedDateFrom: '2026-08-20', affectedDateTo: '2026-08-25' });

    const result = filterIssuesByDate([inWindow, outsideWindow], '2026-08-05');

    expect(result.map((i) => i.id)).toEqual(['a']);
  });

  it('excludes an issue with no dated evidence at all once a date is selected', () => {
    const undated = issue({ id: 'a' });
    expect(filterIssuesByDate([undated], '2026-08-05')).toEqual([]);
  });
});
