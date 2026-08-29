import { describe, it, expect } from 'vitest';
import type { ReconciliationSummary } from '@/features/banking/services';
import { ReconciliationInvestigatorService } from '../services/reconciliationInvestigatorService';
import { MockReconciliationIssueRepository } from '../repositories/MockReconciliationIssueRepository';
import { buildOfficeNationalReconciliationScenario, ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE } from './officeNationalReconciliationScenario';

/**
 * Queen Bee "Office National Demo" hive, Agent 7 (QA) — Phase 19 / Track 1.
 *
 * Runs the REAL ReconciliationInvestigatorService (the same class that backs
 * the live app's Difference Investigator) over a fixture built from the REAL
 * seeded numbers documented in docs/OFFICE_NATIONAL_RECON_EXPECTATIONS.md, and
 * asserts every one of the 12 deliberately-planted reconciliation faults is
 * still correctly detected. See officeNationalReconciliationScenario.ts's
 * header comment for exactly why this is a reconstructed two-sided fixture
 * rather than a literal dump of the `bank_transactions` table, and why a real
 * authenticated Supabase round-trip isn't available in this environment.
 *
 * Maps to docs/OFFICE_NATIONAL_DEMO_TASKS.md Phase 19 / the 33-point brief:
 * #20 timing (date-offset), #21 R0.16 mismatch, #22 missing R185.50 charge,
 * #23 R62.10 interest, #24 duplicate, #25 wrong-sign, #27 one-to-many, #28
 * pair combination, #29 triple combination, #30 outstanding deposit, #31
 * outstanding payment. (#19 clean-match count and #26 wrong-account are
 * Track 2 only — see docs/OFFICE_NATIONAL_REGRESSION_EVIDENCE.md.)
 */
describe('Difference Investigator over the real Office National reconciliation scenario', () => {
  function buildService(varianceOverride: number) {
    const scenario = buildOfficeNationalReconciliationScenario();
    const issueRepository = new MockReconciliationIssueRepository();
    const service = new ReconciliationInvestigatorService(
      issueRepository,
      {
        getBankAccount: async (id) => (id === scenario.bankAccount.id ? scenario.bankAccount : undefined),
        getBankAccounts: async () => [scenario.bankAccount],
      },
      {
        getTransactions: async (bankAccountId?: string) =>
          bankAccountId ? scenario.bankTransactions.filter((t) => t.bankAccountId === bankAccountId) : scenario.bankTransactions,
      },
      { getHistory: async () => [] },
      { getEntries: async () => scenario.journalEntries },
      {
        computeSummary: async (): Promise<ReconciliationSummary> => ({
          bankAccountId: ON_BANK_ACCOUNT_ID,
          statementDate: ON_STATEMENT_DATE,
          statementBalance: 0,
          glCashbookBalance: varianceOverride,
          unpresentedPayments: [],
          unpresentedPaymentsTotal: 0,
          unclearedDeposits: [],
          unclearedDepositsTotal: 0,
          unallocatedItems: [],
          adjustedBankBalance: 0,
          variance: varianceOverride,
          isBalanced: varianceOverride === 0,
        }),
      },
    );
    return { service, scenario };
  }

  // Any nonzero value works here — investigate() only short-circuits entirely
  // when the variance is exactly zero (see reconciliationInvestigatorService.ts).
  // The combination-search detector is the one exception that needs the EXACT
  // target variance, which is why it gets its own dedicated tests below.
  const ARBITRARY_NONZERO_VARIANCE = -1;

  it('#20/#21/#22/#23/#24/#25/#27 — detects every seeded fault category in one pass', async () => {
    const { service } = buildService(ARBITRARY_NONZERO_VARIANCE);
    const result = await service.investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, 0, []);
    const types = new Set(result.issues.map((i) => i.issueType));

    expect(types).toContain('date_offset_timing'); // #20 — PAY-2007, book 25 Aug / bank 27 Aug
    expect(types).toContain('amount_mismatch'); // #21 — JE-3001 books R47.50 vs bank R47.66
    expect(types).toContain('missing_ledger_side'); // #22/#23 — R185.50 charge + R62.10 interest
    expect(types).toContain('duplicate_transaction'); // #24 — PAY-2220 booked twice
    expect(types).toContain('wrong_sign'); // #25 — REC-1020 captured as an outflow
    expect(types).toContain('grouped_match'); // #27 (and the many-to-one debit order)
    expect(types).toContain('missing_bank_side'); // #30/#31 — outstanding deposit/payment
  });

  it('#21 — finds the R0.16 mismatch specifically (JE-3001: books R47.50 vs bank R47.66)', async () => {
    const { service } = buildService(ARBITRARY_NONZERO_VARIANCE);
    const result = await service.investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, 0, []);

    const mismatch = result.issues.find((i) => i.issueType === 'amount_mismatch' && Math.abs(Math.abs(i.effectAmount) - 0.16) < 0.005);
    expect(mismatch).toBeDefined();
    expect(mismatch?.explanation).toMatch(/47\.50|47\.66/);
  });

  it('#22 — surfaces the missing R185.50 bank charge as a ledger-side gap', async () => {
    const { service } = buildService(ARBITRARY_NONZERO_VARIANCE);
    const result = await service.investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, 0, []);

    const charge = result.issues.find((i) => i.issueType === 'missing_ledger_side' && Math.abs(Math.abs(i.effectAmount) - 185.5) < 0.005);
    expect(charge).toBeDefined();
    expect(charge?.explanation).toMatch(/Cash handling fee/);
  });

  it('#23 — surfaces the R62.10 interest received as a ledger-side gap', async () => {
    const { service } = buildService(ARBITRARY_NONZERO_VARIANCE);
    const result = await service.investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, 0, []);

    const interest = result.issues.find((i) => i.issueType === 'missing_ledger_side' && Math.abs(Math.abs(i.effectAmount) - 62.1) < 0.005);
    expect(interest).toBeDefined();
    expect(interest?.explanation).toMatch(/Interest Received/);
  });

  it('#24 — flags PAY-2220 (JE-2063 real + JE-2064 duplicate) as a duplicate posting', async () => {
    const { service, scenario } = buildService(ARBITRARY_NONZERO_VARIANCE);
    const result = await service.investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, 0, []);

    const dup = result.issues.find((i) => i.issueType === 'duplicate_transaction' && Math.abs(Math.abs(i.effectAmount) - 4_600.0) < 0.005);
    expect(dup).toBeDefined();
    // Both real ids (JE-2063's id and JE-2064's id, used as the fixture's bank-transaction ids) are the two flagged legs.
    expect(dup?.relatedBankTransactionIds).toEqual(expect.arrayContaining(['283cca35-9321-4b61-9502-8fe2ef431d71', '58666e95-7939-4f64-a23d-1767cb90c987']));
    void scenario;
  });

  it('#25 — flags REC-1020 (R1,834.30) as wrong-sign, effect = double the amount', async () => {
    const { service } = buildService(ARBITRARY_NONZERO_VARIANCE);
    const result = await service.investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, 0, []);

    const wrongSign = result.issues.find((i) => i.issueType === 'wrong_sign');
    expect(wrongSign).toBeDefined();
    expect(Math.abs(wrongSign!.effectAmount - 2 * 1_834.3)).toBeLessThan(0.01);
  });

  it('#27 — flags the R25,000.00 deposit as REC-1201+1202+1203 (grouped_match, 3 items)', async () => {
    const { service } = buildService(ARBITRARY_NONZERO_VARIANCE);
    const result = await service.investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, 0, []);

    const grouped = result.issues.filter((i) => i.issueType === 'grouped_match');
    const oneToMany = grouped.find((i) => i.relatedJournalEntryIds.length === 0 && i.relatedBankTransactionIds.length === 4);
    expect(oneToMany, 'expected a 4-leg (1 bank + 3 books) grouped match for the R25,000 deposit').toBeDefined();
    expect(oneToMany!.explanation).toMatch(/25,?000\.00/);
  });

  it('detects the many-to-one R3,000.00 debit order (PAY-2210 + PAY-2211) as grouped_match too', async () => {
    const { service } = buildService(ARBITRARY_NONZERO_VARIANCE);
    const result = await service.investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, 0, []);

    const grouped = result.issues.filter((i) => i.issueType === 'grouped_match');
    const manyToOne = grouped.find((i) => i.relatedBankTransactionIds.length === 3 && i.explanation.match(/3,?000\.00/));
    expect(manyToOne, 'expected a 3-leg (1 bank + 2 books) grouped match for the R3,000 debit order').toBeDefined();
  });

  it('#30/#31 — the outstanding deposit (REC-1001) and outstanding payment (PAY-2004) are non-stale, auto-resolution-safe timing items', async () => {
    const { service } = buildService(ARBITRARY_NONZERO_VARIANCE);
    const result = await service.investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, 0, []);

    const deposit = result.issues.find(
      (i) => i.issueType === 'missing_bank_side' && Math.abs(i.effectAmount - 2_295.29) < 0.005,
    );
    const payment = result.issues.find(
      (i) => i.issueType === 'missing_bank_side' && Math.abs(Math.abs(i.effectAmount) - 46_041.29) < 0.005,
    );
    expect(deposit, 'expected REC-1001 to surface as an outstanding deposit').toBeDefined();
    expect(payment, 'expected PAY-2004 to surface as an outstanding payment').toBeDefined();
    // Both are within STALE_AFTER_DAYS of the 31 Aug statement date — genuine
    // in-transit timing items, not evidence of a real problem.
    expect(deposit!.autoResolutionSafe).toBe(true);
    expect(payment!.autoResolutionSafe).toBe(true);
  });

  it('#28 — explains a variance that is exactly the pair-combination sum (R95.00 + R310.40 = R405.40)', async () => {
    const pairSum = 95.0 + 310.4;
    const { service } = buildService(-pairSum); // both fixture legs are credit (outflow) -> negative signed cents
    const result = await service.investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, 0, []);

    const combo = result.issues.find((i) => i.issueType === 'combination_match');
    expect(combo, `expected a combination_match explaining R${pairSum.toFixed(2)}`).toBeDefined();
    expect(Math.abs(Math.abs(combo!.effectAmount) - pairSum)).toBeLessThan(0.02);
    expect(combo!.explanation).toMatch(/95\.00/);
    expect(combo!.explanation).toMatch(/310\.40/);
  });

  it('#29 — explains a variance that is exactly the triple-combination sum (R42.00 + R118.50 + R64.75 = R225.25)', async () => {
    const tripleSum = 42.0 + 118.5 + 64.75;
    const { service } = buildService(-tripleSum);
    const result = await service.investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, 0, []);

    const combo = result.issues.find((i) => i.issueType === 'combination_match');
    expect(combo, `expected a combination_match explaining R${tripleSum.toFixed(2)}`).toBeDefined();
    expect(Math.abs(Math.abs(combo!.effectAmount) - tripleSum)).toBeLessThan(0.02);
    expect(combo!.explanation).toMatch(/42\.00/);
    expect(combo!.explanation).toMatch(/118\.50/);
    expect(combo!.explanation).toMatch(/64\.75/);
  });

  it('every persisted issue starts open (a suggestion, never pre-applied truth)', async () => {
    const { service } = buildService(ARBITRARY_NONZERO_VARIANCE);
    const result = await service.investigate(ON_BANK_ACCOUNT_ID, ON_STATEMENT_DATE, 0, []);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.every((i) => i.status === 'open')).toBe(true);
  });
});
