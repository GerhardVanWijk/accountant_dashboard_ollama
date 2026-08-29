import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import type { BankAccount, BankStatement, BankStatementLine, ReconciliationIssue } from '@/types';
import { computeReconciliationHealth } from '@/features/reconciliationIntelligence/services/reconciliationHealthService';
import type { InvestigationResult } from '@/features/reconciliationIntelligence/services';
import { ReconciliationWorkspace, type ReconciliationWorkspaceProps } from './ReconciliationWorkspace';
import type { BankTransactionWithAllocations } from '../types';
import type { ReconciliationSummary } from '../services';

const account: BankAccount = {
  id: 'ba-1',
  name: 'Office National Cheque',
  bankName: 'FNB',
  accountNumber: '1',
  accountType: 'checking',
  currency: 'ZAR',
  glAccountId: 'gl-bank',
  openingBalance: 0,
  currentBalance: 0,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const statement: BankStatement = {
  id: 'stmt-1',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  bankAccountId: 'ba-1',
  sourceFilename: 'aug-2026.csv',
  sourceFormat: 'csv',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  openingBalance: 350000,
  closingBalance: 184068.54,
  currency: 'ZAR',
  lineCount: 3,
  importStatus: 'imported',
  reconciliationStatus: 'in_progress',
};

function mkLine(o: Partial<BankStatementLine>): BankStatementLine {
  return {
    id: 'l1',
    createdAt: '',
    updatedAt: '',
    bankStatementId: 'stmt-1',
    bankAccountId: 'ba-1',
    sequence: 1,
    txnDate: '2026-08-05',
    description: 'LINE',
    reference: 'R1',
    amount: 100,
    direction: 'credit',
    rawSource: {},
    lineState: 'unmatched',
    ...o,
  };
}

function mkTxn(o: Partial<BankTransactionWithAllocations>): BankTransactionWithAllocations {
  return {
    id: 't1',
    createdAt: '',
    updatedAt: '',
    bankAccountId: 'ba-1',
    date: '2026-08-05',
    description: 'TXN',
    reference: 'R1',
    amount: 100,
    direction: 'credit',
    status: 'matched',
    source: 'manual',
    allocations: [{ id: 'a1', glAccountId: 'gl-exp', netAmount: 100, taxAmount: 0 }],
    ...o,
  } as BankTransactionWithAllocations;
}

const lines: BankStatementLine[] = [
  mkLine({ id: 'l1', sequence: 1, description: 'BANK CHARGE FEE', reference: 'FEE1', amount: 47.66, direction: 'credit', lineState: 'matched', matchedBankTransactionId: 't1' }),
  mkLine({ id: 'l2', sequence: 2, description: 'UNRECORDED DEBIT ORDER', reference: 'DO9', amount: 185.5, direction: 'credit', lineState: 'unmatched', matchedBankTransactionId: undefined }),
  mkLine({ id: 'l3', sequence: 3, description: 'CUSTOMER DEPOSIT', reference: 'DEP3', amount: 5000, direction: 'debit', lineState: 'matched', matchedBankTransactionId: 't3' }),
];

const transactions: BankTransactionWithAllocations[] = [
  mkTxn({ id: 't1', description: 'Card machine fee', reference: 'FEE1', amount: 47.5, direction: 'credit', journalEntryId: 'je1', allocations: [{ id: 'a1', glAccountId: 'gl-exp', netAmount: 47.5, taxAmount: 0 }] }),
  mkTxn({ id: 't3', description: 'Deposit from ACME', reference: 'DEP3', amount: 5000, direction: 'debit', journalEntryId: 'je3' }),
];

const summary: ReconciliationSummary = {
  bankAccountId: 'ba-1',
  statementDate: '2026-08-31',
  statementBalance: 184068.54,
  glCashbookBalance: 184300.7,
  unpresentedPayments: [],
  unpresentedPaymentsTotal: 0,
  unclearedDeposits: [],
  unclearedDepositsTotal: 0,
  unallocatedItems: [],
  adjustedBankBalance: 184068.54,
  variance: -232.16,
  isBalanced: false,
};

function baseProps(overrides: Partial<ReconciliationWorkspaceProps> = {}): ReconciliationWorkspaceProps {
  return {
    bankAccount: account,
    transactions,
    statement,
    lines,
    statementLoading: false,
    investigation: null,
    glAccountName: (id) => (id === 'gl-exp' ? '6200 Bank charges' : id),
    journalNumberFor: (id) => (id === 'je1' ? 'JE-0101' : undefined),
    journalBalancedFor: () => true,
    statementDate: '2026-08-31',
    setStatementDate: vi.fn(),
    statementBalance: 184068.54,
    setStatementBalance: vi.fn(),
    clearedIds: new Set(),
    toggleCleared: vi.fn(),
    summary,
    isLoading: false,
    isFinalizing: false,
    error: null,
    finalize: vi.fn(),
    onInvestigate: vi.fn(),
    onInvestigateLine: vi.fn(),
    onAllocate: vi.fn(),
    onViewRecord: vi.fn(),
    onMissingInBooksAction: vi.fn(),
    ...overrides,
  };
}

function selectLine(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('ReconciliationWorkspace — side-by-side', () => {
  it('renders the LEFT statement-line list and, on selecting a line, the LEFT detail + RIGHT counterpart + COMPARISON block', () => {
    render(<ReconciliationWorkspace {...baseProps()} />);

    // LEFT list
    expect(screen.getByText('BANK CHARGE FEE')).toBeInTheDocument();
    expect(screen.getByText('CUSTOMER DEPOSIT')).toBeInTheDocument();

    selectLine(/BANK CHARGE FEE/);

    // LEFT detail — sequence
    expect(screen.getByText(/Line 1 of 3/)).toBeInTheDocument();
    // RIGHT counterpart
    expect(screen.getByText(/Vertex believes this matches the bank line/)).toBeInTheDocument();
    expect(screen.getByText('JE-0101')).toBeInTheDocument();
    // COMPARISON
    expect(screen.getByText('Comparison')).toBeInTheDocument();
    expect(screen.getByText('R0.16 difference')).toBeInTheDocument();
  });

  it('a missing-in-books line shows the "cannot find a corresponding accounting entry" state and the workflow buttons call the handler', () => {
    const onMissingInBooksAction = vi.fn();
    render(<ReconciliationWorkspace {...baseProps({ onMissingInBooksAction })} />);

    selectLine(/UNRECORDED DEBIT ORDER/);
    expect(screen.getByText(/cannot find a corresponding accounting entry/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /create bank charge/i }));
    expect(onMissingInBooksAction).toHaveBeenCalledWith('bank_charge', expect.objectContaining({ id: 'l2' }));
  });

  it('an amount-mismatch line shows the exact R0.16 delta and "Investigate" calls onInvestigateLine with the line', () => {
    const onInvestigateLine = vi.fn();
    render(<ReconciliationWorkspace {...baseProps({ onInvestigateLine })} />);

    selectLine(/BANK CHARGE FEE/);
    const investigate = screen.getByRole('button', { name: /Investigate R0\.16 difference/ });
    fireEvent.click(investigate);
    expect(onInvestigateLine).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }));
  });

  it('Next / Previous move the selection and "Line N of M" updates', () => {
    render(<ReconciliationWorkspace {...baseProps()} />);
    selectLine(/BANK CHARGE FEE/);
    expect(screen.getByText(/Line 1 of 3/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next line/i }));
    expect(screen.getByText(/Line 2 of 3/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /previous line/i }));
    expect(screen.getByText(/Line 1 of 3/)).toBeInTheDocument();
  });

  it('candidate evidence renders factors as met "Why" and unmet "Potential concern" — never a bare %', () => {
    const issue: ReconciliationIssue = {
      id: 'iss-1',
      createdAt: '',
      updatedAt: '',
      bankAccountId: 'ba-1',
      statementDate: '2026-08-31',
      issueType: 'amount_mismatch',
      severity: 'medium',
      confidence: 82,
      effectAmount: 0.16,
      relatedBankTransactionIds: ['t1'],
      relatedJournalEntryIds: [],
      relatedSourceDocumentIds: [],
      explanation: 'Bank fee imported as R47.66, recorded as R47.50.',
      evidence: [{ label: 'amount close' }],
      evidenceData: {
        amountDifferenceCents: 16,
        factors: [
          { key: 'ref', label: 'reference exact', points: 20, maxPoints: 20, met: true, observedValue: 'FEE1' },
          { key: 'date', label: 'statement date differs from accounting date', points: 0, maxPoints: 15, met: false, observedValue: '1 day' },
        ],
      },
      suggestedResolution: 'Correct the bank charge allocation.',
      autoResolutionSafe: false,
      status: 'open',
    };
    const investigation = { issues: [issue] } as unknown as InvestigationResult;

    render(<ReconciliationWorkspace {...baseProps({ investigation })} />);
    selectLine(/BANK CHARGE FEE/);

    expect(screen.getByText('Why:')).toBeInTheDocument();
    expect(screen.getByText(/✓ reference exact/)).toBeInTheDocument();
    expect(screen.getByText('Potential concern:')).toBeInTheDocument();
    expect(screen.getByText(/⚠ statement date differs/)).toBeInTheDocument();
    expect(screen.getByText(/82% confidence/)).toBeInTheDocument();
  });

  it('opening a traced record (RecordDetailSheet) does not clear the selected line', () => {
    render(<ReconciliationWorkspace {...baseProps()} />);
    selectLine(/BANK CHARGE FEE/);
    expect(screen.getByText(/Line 1 of 3/)).toBeInTheDocument();

    // click the statement-line description in the LEFT detail → opens the trace sheet
    const detail = screen.getByText(/Line 1 of 3/).closest('div')!.parentElement!;
    fireEvent.click(within(detail).getByRole('button', { name: 'BANK CHARGE FEE' }));

    expect(screen.getAllByText(/Statement line/i).length).toBeGreaterThan(0);
    // selection survives
    expect(screen.getByText(/Line 1 of 3/)).toBeInTheDocument();
    expect(screen.getByText('Comparison')).toBeInTheDocument();
  });

  it('the LEFT detail shows the value date and the running balance for the selected line', () => {
    const withMeta = [
      mkLine({
        id: 'l1',
        sequence: 1,
        description: 'BANK CHARGE FEE',
        reference: 'FEE1',
        amount: 47.66,
        direction: 'credit',
        lineState: 'matched',
        matchedBankTransactionId: 't1',
        valueDate: '2026-08-07',
        runningBalance: 349_952.34,
      }),
      ...lines.slice(1),
    ];
    render(<ReconciliationWorkspace {...baseProps({ lines: withMeta })} />);
    selectLine(/BANK CHARGE FEE/);

    const valueDate = screen.getByText('Value date').closest('div')!;
    expect(valueDate).toHaveTextContent(/2026|Aug/);
    const running = screen.getByText('Running balance').closest('div')!;
    expect(running).toHaveTextContent(/349\D?952\D34/);
  });

  it('the COMPARISON Reference verdict comes from evidenceData.referenceSimilarity, not a bare string compare', () => {
    const txns: BankTransactionWithAllocations[] = [
      mkTxn({ id: 't1', description: 'Card machine fee', reference: 'ZZZ-9', amount: 47.66, direction: 'credit', journalEntryId: 'je1' }),
      transactions[1],
    ];
    const issue: ReconciliationIssue = {
      id: 'iss-ref',
      createdAt: '',
      updatedAt: '',
      bankAccountId: 'ba-1',
      statementDate: '2026-08-31',
      issueType: 'amount_mismatch',
      severity: 'low',
      confidence: 70,
      effectAmount: 0,
      relatedBankTransactionIds: ['t1'],
      relatedJournalEntryIds: [],
      relatedSourceDocumentIds: [],
      explanation: 'x',
      evidence: [],
      evidenceData: { referenceSimilarity: 0.6 },
      suggestedResolution: 'x',
      autoResolutionSafe: false,
      status: 'open',
    };
    const investigation = { issues: [issue] } as unknown as InvestigationResult;

    render(<ReconciliationWorkspace {...baseProps({ transactions: txns, investigation })} />);
    selectLine(/BANK CHARGE FEE/);

    const comparison = screen.getByText('Comparison').closest('div')!;
    const referenceRow = within(comparison).getByText('Reference').closest('tr')!;
    // token compare of "FEE1" vs "ZZZ-9" would be "Different"; the 0.6 similarity makes it "Similar".
    expect(referenceRow).toHaveTextContent('Similar');
  });

  it('the summary never shows "100%" while variance remains, and shows "—" when match coverage is null', () => {
    const health = computeReconciliationHealth(0, 0, 0, 0, 74905, 0, {
      statementClosingBalance: 100,
      booksBankBalance: 74805,
      statementLineCount: 0,
    });
    const investigation = { issues: [], health, sections: { exactCauses: [], strongCandidates: [], timingItems: [], structuralIssues: [], combinationExplanations: [] }, timeline: { points: [] } } as unknown as InvestigationResult;

    render(<ReconciliationWorkspace {...baseProps({ investigation })} />);
    expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
    expect(screen.getByText(/Match coverage/)).toHaveTextContent('—');
  });
});
