import { describe, expect, it } from 'vitest';
import type { LeaseAmortizationEntry } from '@/types/lease';
import { FakeLeaseAmortizationPeriodExecutor, type FakeLeaseAmortizationPeriodExecutorDeps } from './leaseAmortizationPeriodExecutor';

interface FakeLeaseRow {
  id: string;
  status: string;
  outstandingLeaseLiability: number;
  accumulatedDepreciation: number;
}

/**
 * Direct adversarial proof against `post_lease_amortization_period`'s Fake
 * executor double — same escalation beyond Fixed Assets' own precedent as
 * `payrollRunPostingExecutor.test.ts` (Leases + Payroll integrity audit,
 * item 7): "a failed atomic operation leaves neither GL nor subledger
 * partial state", "duplicate posting cannot duplicate", proven directly at
 * the layer that owns those guarantees, for a run touching MULTIPLE leases
 * at once (the case a single fixed-asset-style 2-line entry can't
 * exercise).
 */
describe('LeaseAmortizationPeriodExecutor (adversarial)', () => {
  function makeHarness(overrides: Partial<FakeLeaseAmortizationPeriodExecutorDeps> = {}) {
    const leases = new Map<string, FakeLeaseRow>([
      ['lease_a', { id: 'lease_a', status: 'active', outstandingLeaseLiability: 10000, accumulatedDepreciation: 1000 }],
      ['lease_b', { id: 'lease_b', status: 'active', outstandingLeaseLiability: 5000, accumulatedDepreciation: 500 }],
    ]);
    const entries: LeaseAmortizationEntry[] = [];
    let journalPostCount = 0;

    const executor = new FakeLeaseAmortizationPeriodExecutor({
      journal: {
        postJournalEntry: async () => {
          journalPostCount += 1;
          return { id: `je_${journalPostCount}` };
        },
      },
      leases: {
        getById: async (id) => leases.get(id),
        update: async (id, patch) => {
          const current = leases.get(id)!;
          leases.set(id, { ...current, ...patch });
        },
      },
      amortizationEntries: {
        create: async (entity) => {
          const created: LeaseAmortizationEntry = { ...entity, id: `entry_${entries.length + 1}`, createdAt: '', updatedAt: '' };
          entries.push(created);
          return created;
        },
      },
      ...overrides,
    });

    return { executor, leases, entries, journalPostCount: () => journalPostCount };
  }

  const twoLeasePeriodInput = (runId: string) => ({
    runId,
    periodEnd: '2026-06-30',
    memo: 'Lease amortization run for period ending 2026-06-30',
    source: 'lease_amortization',
    lines: [
      { leaseId: 'lease_a', interest: 100, principal: 400, depreciation: 200, outstandingLeaseLiabilityAfter: 9600, accumulatedDepreciationAfter: 1200 },
      { leaseId: 'lease_b', interest: 50, principal: 200, depreciation: 100, outstandingLeaseLiabilityAfter: 4800, accumulatedDepreciationAfter: 600 },
    ],
    journalLines: [
      { accountId: 'acc_5810', debit: 150, credit: 0 },
      { accountId: 'acc_2450', debit: 600, credit: 0 },
      { accountId: 'acc_2460', debit: 0, credit: 750 },
      { accountId: 'acc_5800', debit: 300, credit: 0 },
      { accountId: 'acc_1790', debit: 0, credit: 300 },
    ],
    leasePaymentClearingAccountId: 'acc_2460',
  });

  it('a failure between the journal post and the per-lease writes leaves NEITHER lease updated and NO entries created', async () => {
    const { executor, leases, entries, journalPostCount } = makeHarness({
      // Fires after validation/locking but BEFORE the journal is posted —
      // proves the "no partial state" contract: at this point nothing
      // (not the journal, not either lease's snapshot, not either entry
      // row) has been written yet.
      beforeCommit: () => {
        throw new Error('simulated mid-transaction failure');
      },
    });

    await expect(executor.postPeriod(twoLeasePeriodInput('run_1'))).rejects.toThrow(/simulated mid-transaction failure/);

    expect(journalPostCount()).toBe(0);
    expect(entries).toHaveLength(0);
    expect(leases.get('lease_a')!.outstandingLeaseLiability).toBe(10000); // unchanged
    expect(leases.get('lease_b')!.outstandingLeaseLiability).toBe(5000); // unchanged
  });

  it('rejects a duplicate lease+period (the DB UNIQUE(company_id, lease_id, period_end) constraint this mirrors) and leaves that lease untouched', async () => {
    const { executor, leases } = makeHarness();
    await executor.postPeriod(twoLeasePeriodInput('run_1'));
    expect(leases.get('lease_a')!.outstandingLeaseLiability).toBe(9600);

    // A second, genuinely different run (fresh run_id) that includes
    // lease_a again for the SAME period must be rejected outright.
    await expect(executor.postPeriod(twoLeasePeriodInput('run_2'))).rejects.toThrow(/already has an amortization entry/);
    // lease_a's balance must NOT have been touched a second time.
    expect(leases.get('lease_a')!.outstandingLeaseLiability).toBe(9600);
  });

  it('retrying the SAME run id is idempotent — exactly one journal, no duplicate entries', async () => {
    const { executor, entries, journalPostCount } = makeHarness();
    const input = twoLeasePeriodInput('run_1');

    const first = await executor.postPeriod(input);
    expect(first.idempotent).toBe(false);
    expect(entries).toHaveLength(2);
    expect(journalPostCount()).toBe(1);

    const second = await executor.postPeriod(input);
    expect(second.idempotent).toBe(true);
    expect(second.journalEntryId).toBe(first.journalEntryId);
    expect(entries).toHaveLength(2); // still 2 — no duplicate rows from the retry
    expect(journalPostCount()).toBe(1); // still 1 — no second journal posted
  });

  it('rejects a Cash and Bank (asset-type) clearing account', async () => {
    const { executor } = makeHarness({
      accounts: { getType: async (id) => (id === 'acc_1000' ? 'asset' : 'liability') },
    });

    await expect(
      executor.postPeriod({ ...twoLeasePeriodInput('run_1'), leasePaymentClearingAccountId: 'acc_1000' }),
    ).rejects.toThrow(/liability\/clearing account/);
  });
});
