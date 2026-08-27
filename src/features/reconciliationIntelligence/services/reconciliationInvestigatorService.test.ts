import { describe, expect, it } from 'vitest';
import { ReconciliationInvestigatorService } from './reconciliationInvestigatorService';
import { MockReconciliationIssueRepository } from '../repositories/MockReconciliationIssueRepository';
import type { BankAccount, JournalEntry, ReconciliationIssue } from '@/types';
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

function buildFixture(opts: { variance: number; transactions?: BankTransactionWithAllocations[]; entries?: JournalEntry[]; history?: BankReconciliation[] }): Fixture {
  const account = bankAccount();
  const transactions = opts.transactions ?? [];
  const issueRepository = new MockReconciliationIssueRepository();

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
