import { describe, it, expect } from 'vitest';
import type { BankStatementLine, ReconciliationIssue } from '@/types';
import { buildComparison, buildProof, referenceVerdict, selectLineCandidates, signedLineAmount, type LineCounterpart } from './lineReconciliation';

function line(overrides: Partial<BankStatementLine> = {}): BankStatementLine {
  return {
    id: 'line-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    bankStatementId: 'stmt-1',
    bankAccountId: 'ba-1',
    sequence: 12,
    txnDate: '2026-08-10',
    description: 'CARD MACHINE RENTAL',
    reference: 'REF123',
    amount: 47.66,
    direction: 'credit',
    rawSource: {},
    lineState: 'matched',
    matchedBankTransactionId: 'txn-1',
    ...overrides,
  };
}

function counterpart(overrides: Partial<LineCounterpart> = {}): LineCounterpart {
  return {
    sourceLabel: 'Imported bank transaction',
    sourceNumber: 'REF123',
    accountingDate: '2026-08-10',
    reference: 'REF123',
    amountSigned: -47.5,
    direction: 'credit',
    glAccountLabels: ['6200 Bank charges'],
    journalNumber: 'JE-0101',
    journalEntryId: 'je-1',
    bankTransactionId: 'txn-1',
    vatAmount: 0,
    status: 'matched',
    reconciliationState: 'Not reconciled',
    journalBalanced: true,
    ...overrides,
  };
}

describe('signedLineAmount', () => {
  it('debit is money in (positive), credit is money out (negative)', () => {
    expect(signedLineAmount({ amount: 100, direction: 'debit' })).toBe(100);
    expect(signedLineAmount({ amount: 100, direction: 'credit' })).toBe(-100);
  });
});

describe('referenceVerdict', () => {
  it('exact / similar / different / not-comparable', () => {
    expect(referenceVerdict('INV-2084', 'INV-2084')).toBe('ok');
    expect(referenceVerdict('INV-2084', 'INV 2084 payment')).toBe('warn');
    expect(referenceVerdict('INV-2084', 'REC-1028')).toBe('bad');
    expect(referenceVerdict('INV-2084', undefined)).toBe('na');
  });
  it('prefers the engine similarity score when supplied', () => {
    expect(referenceVerdict('a', 'b', 1)).toBe('ok');
    expect(referenceVerdict('a', 'b', 0.7)).toBe('warn');
    expect(referenceVerdict('a', 'b', 0.1)).toBe('bad');
  });
});

describe('buildComparison', () => {
  it('flags the R0.16 amount difference and agreeing direction', () => {
    const rows = buildComparison({ line: line(), counterpart: counterpart() });
    const amount = rows.find((r) => r.key === 'amount')!;
    expect(amount.verdict).toBe('bad');
    expect(amount.delta).toBe('R0.16 difference');
    expect(rows.find((r) => r.key === 'direction')!.verdict).toBe('ok');
    expect(rows.find((r) => r.key === 'date')!.verdict).toBe('ok');
    expect(rows.find((r) => r.key === 'reference')!.verdict).toBe('ok');
  });

  it('a missing counterpart is a single "not found in Vertex" row', () => {
    const rows = buildComparison({ line: line({ matchedBankTransactionId: undefined }), counterpart: null });
    expect(rows).toHaveLength(1);
    expect(rows[0].booksValue).toMatch(/not found in vertex/i);
  });

  it('adds a VAT row only when the counterpart carries VAT', () => {
    expect(buildComparison({ line: line(), counterpart: counterpart() }).some((r) => r.key === 'vat')).toBe(false);
    expect(buildComparison({ line: line(), counterpart: counterpart({ vatAmount: 6.21 }) }).some((r) => r.key === 'vat')).toBe(true);
  });
});

describe('buildProof', () => {
  it('yes/no/na answers derived from the pair', () => {
    const items = buildProof({ line: line(), counterpart: counterpart({ amountSigned: -47.5 }) });
    const byKey = Object.fromEntries(items.map((i) => [i.key, i.answer]));
    expect(byKey['exists-in-vertex']).toBe('yes');
    expect(byKey['amounts-agree']).toBe('no'); // R0.16 out
    expect(byKey['directions-agree']).toBe('yes');
    expect(byKey['journal-balanced']).toBe('yes');
    expect(byKey['vat-consistent']).toBe('na');
  });

  it('a missing counterpart answers "does this bank line exist in Vertex?" no', () => {
    const items = buildProof({ line: line({ matchedBankTransactionId: undefined }), counterpart: null });
    expect(items.find((i) => i.key === 'exists-in-vertex')!.answer).toBe('no');
  });
});

describe('selectLineCandidates', () => {
  const issue = (overrides: Partial<ReconciliationIssue>): ReconciliationIssue =>
    ({
      id: 'iss-1',
      createdAt: '',
      updatedAt: '',
      bankAccountId: 'ba-1',
      statementDate: '2026-08-31',
      issueType: 'amount_mismatch',
      severity: 'medium',
      confidence: 80,
      effectAmount: 0.16,
      relatedBankTransactionIds: [],
      relatedJournalEntryIds: [],
      relatedSourceDocumentIds: [],
      explanation: 'x',
      evidence: [],
      suggestedResolution: 'x',
      autoResolutionSafe: false,
      status: 'open',
      ...overrides,
    }) as ReconciliationIssue;

  it('matches on evidenceData.candidateSourceId', () => {
    const found = selectLineCandidates(
      [issue({ evidenceData: { candidateSourceType: 'statement_line', candidateSourceId: 'line-1' } })],
      { id: 'line-1', matchedBankTransactionId: undefined },
    );
    expect(found).toHaveLength(1);
  });

  it('matches on the matched bank transaction id', () => {
    const found = selectLineCandidates([issue({ relatedBankTransactionIds: ['txn-1'] })], { id: 'line-1', matchedBankTransactionId: 'txn-1' });
    expect(found).toHaveLength(1);
  });

  it('ignores unrelated issues', () => {
    expect(selectLineCandidates([issue({ relatedBankTransactionIds: ['other'] })], { id: 'line-1', matchedBankTransactionId: 'txn-1' })).toHaveLength(0);
  });
});
