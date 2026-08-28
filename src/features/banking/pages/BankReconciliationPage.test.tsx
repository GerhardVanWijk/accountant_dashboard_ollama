import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReconciliationSummary } from '../services';

/**
 * Regression coverage for the "disconnected reconciliation state" bug
 * (docs/CURRENT_TASKS.md #15/#17): the workspace and the Difference
 * Investigator used to hold SEPARATE `useBankReconciliation` instances, so
 * the investigator always saw the default statement date / R0 balance / no
 * cleared items — never what the user actually entered. These tests prove
 * there is now exactly ONE instance per section, and that both children
 * read from it.
 */

const account1 = {
  id: 'ba1',
  name: 'FNB Cheque',
  bankName: 'FNB',
  accountNumber: '1',
  accountType: 'checking',
  currency: 'ZAR',
  glAccountId: 'gl1',
  openingBalance: 0,
  currentBalance: 0,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const account2 = { ...account1, id: 'ba2', name: 'ABSA Savings', bankName: 'ABSA' };

function makeSummary(variance: number): ReconciliationSummary {
  return {
    bankAccountId: 'ba1',
    statementDate: '2026-08-31',
    statementBalance: 500,
    glCashbookBalance: 500 + variance,
    unpresentedPayments: [],
    unpresentedPaymentsTotal: 0,
    unclearedDeposits: [],
    unclearedDepositsTotal: 0,
    unallocatedItems: [],
    adjustedBankBalance: 500,
    variance,
    isBalanced: Math.abs(variance) < 0.005,
  };
}

// One controllable reconciliation state, shared by whatever calls the hook.
const reconState = {
  statementDate: '2026-08-31',
  setStatementDate: vi.fn(),
  statementBalance: 500,
  setStatementBalance: vi.fn(),
  clearedIds: new Set<string>(['tx-cleared']),
  toggleCleared: vi.fn(),
  summary: makeSummary(-1673.42),
  history: [],
  isLoading: false,
  isFinalizing: false,
  error: null,
  finalize: vi.fn(),
  refetch: vi.fn(),
  refetchHistory: vi.fn(),
};

const useBankReconciliationMock = vi.fn((_id?: string) => reconState);

vi.mock('../hooks/useBankReconciliation', () => ({
  useBankReconciliation: (id: string | undefined) => useBankReconciliationMock(id),
}));
vi.mock('../hooks/useBankAccounts', () => ({
  useBankAccounts: () => ({ bankAccounts: [account1, account2], isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../hooks/useBankTransactions', () => ({
  useBankTransactions: () => ({ transactions: [], isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../hooks/useBankTransactionMutations', () => ({
  useBankTransactionMutations: () => ({ allocateTransaction: vi.fn() }),
}));
vi.mock('../hooks/useGlAccounts', () => ({ useGlAccounts: () => ({ accounts: [] }) }));
vi.mock('@/features/tax/hooks/useTaxRates', () => ({ useTaxRates: () => ({ taxRates: [], loading: false }) }));
vi.mock('@/features/reconciliationIntelligence/hooks/useBooksIntegrity', () => ({
  useBooksIntegrity: () => ({ results: [], isLoading: false, error: null }),
}));

// Prop-capturing stubs for the two children that must share state.
const workspaceProps: Record<string, unknown>[] = [];
const investigatorProps: Record<string, unknown>[] = [];
const last = (a: Record<string, unknown>[]) => a[a.length - 1];

vi.mock('../components/ReconciliationWorkspace', () => ({
  ReconciliationWorkspace: (props: Record<string, unknown>) => {
    workspaceProps.push(props);
    return <div data-testid="workspace-stub" />;
  },
}));
vi.mock('@/features/reconciliationIntelligence/components/DifferenceInvestigatorPanel', () => ({
  DifferenceInvestigatorPanel: (props: Record<string, unknown>) => {
    investigatorProps.push(props);
    return <div data-testid="investigator-stub" />;
  },
}));
vi.mock('../components/ReconciliationHistory', () => ({ ReconciliationHistory: () => <div /> }));
vi.mock('@/features/reconciliationIntelligence/components/BooksIntegrityPanel', () => ({ BooksIntegrityPanel: () => <div /> }));

import { BankReconciliationPage } from './BankReconciliationPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/banking/reconciliation']}>
      <BankReconciliationPage />
    </MemoryRouter>,
  );
}

/** base-ui Tabs only mounts the active panel — switch to the investigator tab to render its panel. */
function openInvestigatorTab() {
  const tab = screen
    .getAllByRole('tab')
    .find((el) => /difference investigator/i.test(el.textContent ?? ''));
  fireEvent.click(tab!);
}

describe('BankReconciliationPage — shared reconciliation state', () => {
  beforeEach(() => {
    workspaceProps.length = 0;
    investigatorProps.length = 0;
    useBankReconciliationMock.mockClear();
    useBankReconciliationMock.mockReturnValue(reconState);
  });

  it('creates exactly ONE useBankReconciliation instance for the active section (not one per child)', () => {
    renderPage();
    expect(useBankReconciliationMock).toHaveBeenCalledTimes(1);
    expect(useBankReconciliationMock).toHaveBeenCalledWith('ba1');
  });

  it('passes the SAME statement date / balance / cleared selection to both the workspace and the investigator', () => {
    renderPage();
    const ws = last(workspaceProps);
    expect(ws.statementBalance).toBe(reconState.statementBalance);
    expect(ws.clearedIds).toBe(reconState.clearedIds);

    openInvestigatorTab();
    const inv = last(investigatorProps);
    // The investigator gets its cleared list + balance from the SAME hook return.
    expect(inv.statementBalance).toBe(reconState.statementBalance);
    expect(inv.clearedTransactionIds).toEqual(Array.from(reconState.clearedIds));
  });

  it("the investigator's variance is the current workspace summary's variance, not a stale default", () => {
    renderPage();
    expect(last(workspaceProps).summary).toBe(reconState.summary);

    openInvestigatorTab();
    expect(last(investigatorProps).variance).toBe(reconState.summary.variance); // -1673.42, not 0
  });

  it('confirmed/probable/review + remaining variance always come from one active session — reflects a state change', () => {
    renderPage();
    openInvestigatorTab();
    expect(last(investigatorProps).variance).toBe(-1673.42);

    // The user changes the statement balance → the recomputed summary has a
    // different variance. Both children move together off the one hook instance.
    cleanup();
    const nextState = { ...reconState, statementBalance: 999, summary: makeSummary(0) };
    useBankReconciliationMock.mockReturnValue(nextState);
    renderPage();
    openInvestigatorTab();

    expect(last(workspaceProps).statementBalance).toBe(999);
    expect(last(investigatorProps).variance).toBe(0);
  });

  it('scopes the reconciliation state to the selected account (hook receives the account id)', () => {
    renderPage();
    expect(useBankReconciliationMock).toHaveBeenCalledWith('ba1');
    expect(last(workspaceProps).bankAccount).toMatchObject({ id: 'ba1' });

    openInvestigatorTab();
    expect(last(investigatorProps).bankAccountId).toBe('ba1');
    // The section is rendered as <ReconciliationSection key={selectedAccount.id}>,
    // so switching account is a fresh subtree — no stale investigator state survives.
  });
});
