import { describe, it, expect } from 'vitest';
import type { ReconciliationIssueType } from '@/types';
import type { ReconciliationSummary } from '@/features/banking/services';
import { ReconciliationInvestigatorService } from '../services/reconciliationInvestigatorService';
import { MockReconciliationIssueRepository } from '../repositories/MockReconciliationIssueRepository';
import {
  buildDemoReconciliationScenario,
  DEMO_BANK_ACCOUNT_ID,
  DEMO_STATEMENT_DATE,
} from './demoReconciliationScenario';

/**
 * docs/CURRENT_TASKS.md #21 — run the REAL Difference Investigator over the
 * realistic seeded scenario and confirm it finds the deliberately-planted
 * faults. If a detector ever regresses, this test fails with the exact
 * fault type it stopped catching.
 */
describe('Difference Investigator over the demo reconciliation scenario', () => {
  const scenario = buildDemoReconciliationScenario('demo_bank_absa');
  const otherAccount = {
    ...scenario.bankAccount,
    id: 'demo_bank_absa',
    name: 'ABSA Savings',
    glAccountId: 'gl_bank_1001',
  };

  function buildService(varianceOverride?: number) {
    const variance = varianceOverride ?? scenario.expectedVariance;
    const issueRepository = new MockReconciliationIssueRepository();
    const service = new ReconciliationInvestigatorService(
      issueRepository,
      {
        getBankAccount: async (id) =>
          id === scenario.bankAccount.id ? scenario.bankAccount : id === otherAccount.id ? otherAccount : undefined,
        getBankAccounts: async () => [scenario.bankAccount, otherAccount],
      },
      {
        getTransactions: async (bankAccountId?: string) =>
          bankAccountId ? scenario.bankTransactions.filter((t) => t.bankAccountId === bankAccountId) : scenario.bankTransactions,
      },
      { getHistory: async () => [] },
      { getEntries: async () => scenario.journalEntries },
      {
        computeSummary: async (): Promise<ReconciliationSummary> => ({
          bankAccountId: DEMO_BANK_ACCOUNT_ID,
          statementDate: DEMO_STATEMENT_DATE,
          statementBalance: 0,
          glCashbookBalance: variance,
          unpresentedPayments: [],
          unpresentedPaymentsTotal: 0,
          unclearedDeposits: [],
          unclearedDepositsTotal: 0,
          unallocatedItems: [],
          adjustedBankBalance: 0,
          variance,
          isBalanced: false,
        }),
      },
    );
    return { service, issueRepository };
  }

  it('has a non-trivial, deterministic variance to explain', () => {
    expect(scenario.expectedVariance).not.toBe(0);
    expect(buildDemoReconciliationScenario().expectedVariance).toBe(scenario.expectedVariance);
  });

  it('detects every seeded fault category', async () => {
    const { service } = buildService();
    const result = await service.investigate(DEMO_BANK_ACCOUNT_ID, DEMO_STATEMENT_DATE, 0, [], { vatRatesPercent: [15] });

    const types = new Set<ReconciliationIssueType>(result.issues.map((i) => i.issueType));

    // The headline faults the brief calls out:
    expect(types).toContain('missing_ledger_side'); // bank charge R185.50 + interest R62.10
    expect(types).toContain('amount_mismatch'); // card fee books R47.50 vs bank R47.66
    expect(types).toContain('duplicate_transaction'); // landlord rent booked twice
    expect(types).toContain('wrong_sign'); // supplier refund booked the wrong way
    expect(types).toContain('grouped_match'); // R10,000 deposit = 3 receipts
  });

  it('explains a variance that is exactly the pair-combination sum (R801.25)', async () => {
    // The two orphaned journal credits (money out, never on the bank) make
    // the GL cashbook LOWER than the bank → a negative variance of their sum.
    const pairSum = scenario.expectedFaults.pairCombination.reduce((a, b) => a + b, 0);
    const { service } = buildService(-pairSum);
    const result = await service.investigate(DEMO_BANK_ACCOUNT_ID, DEMO_STATEMENT_DATE, 0, []);

    const combo = result.issues.find((i) => i.issueType === 'combination_match');
    expect(combo, `expected a combination_match explaining R${pairSum}`).toBeDefined();
    expect(Math.abs(Math.abs(combo!.effectAmount) - pairSum)).toBeLessThan(0.02);
  });

  it('explains a variance that is exactly the triple-combination sum', async () => {
    const tripleSum = scenario.expectedFaults.tripleCombination.reduce((a, b) => a + b, 0);
    const { service } = buildService(-tripleSum);
    const result = await service.investigate(DEMO_BANK_ACCOUNT_ID, DEMO_STATEMENT_DATE, 0, []);

    expect(result.issues.some((i) => i.issueType === 'combination_match')).toBe(true);
  });

  it('finds the R0.16 card-machine fee mismatch specifically', async () => {
    const { service } = buildService();
    const result = await service.investigate(DEMO_BANK_ACCOUNT_ID, DEMO_STATEMENT_DATE, 0, []);

    const mismatch = result.issues.find(
      (i) => i.issueType === 'amount_mismatch' && Math.abs(Math.abs(i.effectAmount) - 0.16) < 0.005,
    );
    expect(mismatch).toBeDefined();
    expect(mismatch?.explanation.toLowerCase()).toMatch(/card machine|47\.5|47\.66/);
  });

  it('surfaces the missing R185.50 bank charge as a ledger-side gap', async () => {
    const { service } = buildService();
    const result = await service.investigate(DEMO_BANK_ACCOUNT_ID, DEMO_STATEMENT_DATE, 0, []);

    const charge = result.issues.find(
      (i) => i.issueType === 'missing_ledger_side' && Math.abs(Math.abs(i.effectAmount) - 185.5) < 0.005,
    );
    expect(charge).toBeDefined();
  });

  it('every persisted issue starts open (a suggestion, never pre-applied truth)', async () => {
    const { service } = buildService();
    const result = await service.investigate(DEMO_BANK_ACCOUNT_ID, DEMO_STATEMENT_DATE, 0, []);
    expect(result.issues.every((i) => i.status === 'open')).toBe(true);
    // health separates the two questions — never "100% explained" with a gap open
    expect(result.health.varianceRemaining).toBeGreaterThanOrEqual(0);
  });
});
