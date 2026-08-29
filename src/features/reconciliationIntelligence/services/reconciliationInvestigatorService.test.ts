import { describe, expect, it } from 'vitest';
import { ReconciliationInvestigatorService } from './reconciliationInvestigatorService';
import { MockReconciliationIssueRepository } from '../repositories/MockReconciliationIssueRepository';
import { MockBankStatementLineRepository } from '@/features/banking/repositories';
import type { BankAccount, BankStatementLine, JournalEntry, ReconciliationIssue } from '@/types';
import type { BankReconciliation, BankTransactionWithAllocations } from '@/features/banking/types';
import type { ReconciliationSummary } from '@/features/banking/services';

function bankAccount(overrides: Partial<BankAccount> = {}): BankAccount {
  return {
    id: 'acc1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    name: 'FNB Current',
    bankName: 'FNB',
    accountNumber: '12345',
    accountType: 'checking',
    currency: 'ZAR',
    glAccountId: 'gl_bank_1000',
    openingBalance: 0,
    currentBalance: 0,
    status: 'active',
    ...overrides,
  };
}

function transaction(overrides: Partial<BankTransactionWithAllocations> = {}): BankTransactionWithAllocations {
  return {
    id: 't1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    bankAccountId: 'acc1',
    date: '2026-08-01',
    description: 'Item',
    amount: 100,
    direction: 'debit',
    status: 'unreconciled',
    allocations: [],
    source: 'import',
    ...overrides,
  };
}

function summary(variance: number, overrides: Partial<ReconciliationSummary> = {}): ReconciliationSummary {
  return {
    bankAccountId: 'acc1',
    statementDate: '2026-08-27',
    statementBalance: 1000,
    glCashbookBalance: 1000 + variance,
    unpresentedPayments: [],
    unpresentedPaymentsTotal: 0,
    unclearedDeposits: [],
    unclearedDepositsTotal: 0,
    unallocatedItems: [],
    adjustedBankBalance: 1000,
    variance,
    isBalanced: Math.abs(variance) <= 0.005,
    ...overrides,
  };
}

interface Fixture {
  service: ReconciliationInvestigatorService;
  issueRepository: MockReconciliationIssueRepository;
  transactions: BankTransactionWithAllocations[];
}

function statementLine(overrides: Partial<BankStatementLine> = {}): BankStatementLine {
  return {
    id: 'sl1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    bankStatementId: 'stmt1',
    bankAccountId: 'acc1',
    sequence: 1,
    txnDate: '2026-08-10',
    description: 'Statement line',
    amount: 100,
    direction: 'credit',
    rawSource: {},
    lineState: 'unmatched',
    ...overrides,
  };
}

function buildFixture(opts: {
  variance: number;
  transactions?: BankTransactionWithAllocations[];
  entries?: JournalEntry[];
  history?: BankReconciliation[];
  statementLines?: BankStatementLine[];
}): Fixture {
  const account = bankAccount();
  const transactions = opts.transactions ?? [];
  const issueRepository = new MockReconciliationIssueRepository();
  const lineRepository = new MockBankStatementLineRepository(opts.statementLines ?? []);

  const service = new ReconciliationInvestigatorService(
    issueRepository,
    {
      getBankAccount: async (id) => (id === account.id ? account : undefined),
      getBankAccounts: async () => [account],
    },
    {
      getTransactions: async (bankAccountId) => (bankAccountId ? transactions.filter((t) => t.bankAccountId === bankAccountId) : transactions),
    },
    {
      getHistory: async () => opts.history ?? [],
    },
    {
      getEntries: async () => opts.entries ?? [],
    },
    {
      computeSummary: async () => summary(opts.variance),
    },
    lineRepository,
  );

  return { service, issueRepository, transactions };
}

describe('ReconciliationInvestigatorService — truth vs. suggestion boundary', () => {
  it('does nothing and persists no issues when the variance is already zero — a clean reconciliation is never second-guessed', async () => {
    const { service, issueRepository } = buildFixture({ variance: 0 });

    const result = await service.investigate('acc1', '2026-08-27', 1000, []);

    expect(result.fullyExplained).toBe(true);
    expect(result.issues).toEqual([]);
    expect(await issueRepository.getAll()).toEqual([]);
  });

  it('every persisted issue starts as status "open" — a suggestion, never pre-confirmed as accounting truth', async () => {
    const bank = transaction({ id: 'b1', date: '2026-08-10', description: 'Bank fee', amount: 47.66, direction: 'credit', source: 'import' });
    const { service } = buildFixture({ variance: 47.66, transactions: [bank] });

    const result = await service.investigate('acc1', '2026-08-27', 1000, []);

    expect(result.fullyExplained).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    for (const issue of result.issues) {
      expect(issue.status).toBe('open');
    }
    // The deterministic summary numbers (variance, statement/GL balances) are untouched
    // by any detector — they come straight from the injected SummaryComputer, never
    // recomputed or overridden by a "likely" match.
    expect(result.summary.variance).toBeCloseTo(47.66);
  });
});

describe('ReconciliationInvestigatorService — re-running an investigation', () => {
  it('replaces stale open issues rather than accumulating duplicates on a second run', async () => {
    const bank = transaction({ id: 'b1', date: '2026-08-10', description: 'Bank fee', amount: 47.66, direction: 'credit', source: 'import' });
    const { service, issueRepository } = buildFixture({ variance: 47.66, transactions: [bank] });

    const first = await service.investigate('acc1', '2026-08-27', 1000, []);
    const second = await service.investigate('acc1', '2026-08-27', 1000, []);

    const allStored = await issueRepository.getByAccount('acc1');
    // Not first.length + second.length — the second run's persistence step deletes the
    // first run's still-open rows before inserting its own.
    expect(allStored.length).toBe(second.issues.length);
    expect(first.issues.length).toBe(second.issues.length);
  });

  it('never deletes or mutates an issue a human has already reviewed/dismissed/resolved', async () => {
    const bank = transaction({ id: 'b1', date: '2026-08-10', description: 'Bank fee', amount: 47.66, direction: 'credit', source: 'import' });
    const { service, issueRepository } = buildFixture({ variance: 47.66, transactions: [bank] });

    const first = await service.investigate('acc1', '2026-08-27', 1000, []);
    const humanDecided = await issueRepository.update(first.issues[0].id, {
      status: 'dismissed',
      resolutionReason: 'Confirmed unrelated — checked with the bank.',
      resolutionActorUserId: 'user1',
    });

    await service.investigate('acc1', '2026-08-27', 1000, []);

    const stillThere = await issueRepository.getById(humanDecided.id);
    expect(stillThere).toBeDefined();
    expect(stillThere!.status).toBe('dismissed');
    expect(stillThere!.resolutionReason).toBe('Confirmed unrelated — checked with the bank.');
  });

  it('leaves a prior statement date\'s issues alone when investigating a different, later statement date', async () => {
    const bank = transaction({ id: 'b1', date: '2026-07-10', description: 'Bank fee', amount: 47.66, direction: 'credit', source: 'import' });
    const { service, issueRepository } = buildFixture({ variance: 47.66, transactions: [bank] });

    const julyRun = await service.investigate('acc1', '2026-07-31', 1000, []);
    await service.investigate('acc1', '2026-08-27', 1000, []);

    const julyIssueStillExists = await issueRepository.getById(julyRun.issues[0].id);
    expect(julyIssueStillExists).toBeDefined();
    expect(julyIssueStillExists!.statementDate).toBe('2026-07-31');
  });
});

describe('ReconciliationInvestigatorService — small differences are never silently rounded to zero', () => {
  const smallAmounts = [0.01, 0.02, 0.05, 0.16, 1.0, 16.73];

  it.each(smallAmounts)('R%s stays open — explained, not silently dismissed as immaterial', async (amount) => {
    const bank = transaction({ id: 'b1', date: '2026-08-14', description: 'Bank fee', amount, direction: 'credit', source: 'import' });
    const { service } = buildFixture({ variance: amount, transactions: [bank] });

    const result = await service.investigate('acc1', '2026-08-27', 1000, []);

    expect(result.fullyExplained).toBe(false);
    expect(result.summary.variance).toBeCloseTo(amount);
    // Either a candidate cause was found (an issue exists to review/confirm), or none
    // was — but the variance itself is never quietly zeroed out by this call.
    if (result.issues.length === 0) {
      expect(result.summary.variance).not.toBe(0);
    } else {
      expect(result.issues.every((i: ReconciliationIssue) => i.status === 'open')).toBe(true);
    }
  });
});

describe('ReconciliationInvestigatorService — P2.1 evidence model + sectioned output', () => {
  it('uses persisted bank_statement_lines as the bank side when a statement covers the window', async () => {
    const lines = [
      statementLine({ id: 'sl_fee', txnDate: '2026-08-12', description: 'Cash handling fee', amount: 185.5, direction: 'credit' }),
    ];
    const { service } = buildFixture({ variance: -185.5, statementLines: lines });

    const result = await service.investigate('acc1', '2026-08-27', 1000, []);

    const fee = result.issues.find((i) => i.issueType === 'missing_ledger_side');
    expect(fee).toBeDefined();
    // The candidate came off the statement line, not a source='import' bank_transaction.
    expect(fee!.evidenceData?.candidateSourceType).toBe('statement_line');
    expect(fee!.evidenceData?.candidateSourceId).toBe('sl_fee');
    expect(fee!.evidenceData?.detectorType).toBe('missing_ledger_side');
    expect(fee!.evidenceData?.detectorVersion).toBeTruthy();
    expect(result.health.statementLineCount).toBe(1);
  });

  it('every persisted issue carries structured evidenceData and a dedupe_key', async () => {
    const bank = transaction({ id: 'b1', date: '2026-08-10', description: 'Bank fee', amount: 47.66, direction: 'credit', source: 'import' });
    const { service } = buildFixture({ variance: 47.66, transactions: [bank] });

    const result = await service.investigate('acc1', '2026-08-27', 1000, []);

    for (const issue of result.issues) {
      expect(issue.dedupeKey).toBeTruthy();
      expect(issue.dedupeKey).toContain('2026-08-27');
      expect(issue.dedupeKey!.startsWith(issue.issueType)).toBe(true);
      expect(issue.evidenceData?.factors?.length).toBeGreaterThan(0);
      expect(issue.explanation.length).toBeGreaterThan(0);
    }
  });

  it('classifies issues into the sections the workspace renders', async () => {
    const bank = transaction({ id: 'b1', date: '2026-08-10', description: 'Bank charges', amount: 185.5, direction: 'credit', source: 'import' });
    const { service } = buildFixture({ variance: -185.5, transactions: [bank] });

    const result = await service.investigate('acc1', '2026-08-27', 1000, []);

    // The R185.50 bank charge with no ledger side exactly equals the R185.50 gap.
    expect(result.sections.exactCauses.some((i) => i.issueType === 'missing_ledger_side')).toBe(true);
    expect(result.sections).toHaveProperty('strongCandidates');
    expect(result.sections).toHaveProperty('timingItems');
    expect(result.sections).toHaveProperty('structuralIssues');
    expect(result.sections).toHaveProperty('combinationExplanations');
  });

  it('re-running updates the matching open issues in place — no duplicate rows, deterministic order', async () => {
    const bank = transaction({ id: 'b1', date: '2026-08-10', description: 'Bank fee', amount: 47.66, direction: 'credit', source: 'import' });
    const { service, issueRepository } = buildFixture({ variance: 47.66, transactions: [bank] });

    const first = await service.investigate('acc1', '2026-08-27', 1000, []);
    const second = await service.investigate('acc1', '2026-08-27', 1000, []);

    const stored = await issueRepository.getByAccount('acc1');
    expect(stored.length).toBe(second.issues.length);
    expect(first.issues.map((i) => i.dedupeKey).sort()).toEqual(second.issues.map((i) => i.dedupeKey).sort());

    // getIssuesForAccount is a total order: confidence DESC, then |effect| DESC, then type, then key.
    const ranked = await service.getIssuesForAccount('acc1');
    for (let i = 1; i < ranked.length; i++) {
      const a = ranked[i - 1];
      const b = ranked[i];
      const ok =
        a.confidence > b.confidence ||
        (a.confidence === b.confidence && Math.abs(a.effectAmount) >= Math.abs(b.effectAmount));
      expect(ok).toBe(true);
    }
  });
});
