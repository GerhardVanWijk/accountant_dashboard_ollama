import { describe, expect, it } from 'vitest';
import type { PayrollRun } from '@/types';
import { FakePayrollRunPostingExecutor } from './payrollRunPostingExecutor';

function makeRun(overrides: Partial<PayrollRun> = {}): PayrollRun {
  return {
    id: 'pr_1',
    runNumber: 'PR-0001',
    payPeriodStart: '2026-06-01',
    payPeriodEnd: '2026-06-30',
    payDate: '2026-06-25',
    status: 'draft',
    payslips: [
      {
        employeeId: 'emp_1', employeeNumber: 'EMP-0001', employeeName: 'A One',
        basicSalary: 20000, overtime: 0, bonus: 0, allowancesTotal: 0, grossPay: 20000,
        payeTaxableIncome: 20000, paye: 3000, uifEmployee: 177.12, uifEmployer: 177.12,
        sdlEmployer: 200, deductionsTotal: 0, netPay: 16822.88,
      },
    ],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Direct adversarial proof against `post_payroll_run`'s Fake executor
 * double — deliberately going beyond Fixed Assets' own precedent test
 * suite (which proves idempotency only at the service level, not the
 * executor's own retry-token/partial-failure contract directly) per the
 * Leases + Payroll integrity audit's explicit item 7 ask: "a failed atomic
 * operation leaves neither GL nor subledger partial state" and "retry does
 * not duplicate accounting", proven at the layer that actually owns those
 * guarantees.
 */
describe('PayrollRunPostingExecutor (adversarial)', () => {
  it('a failure between the journal post and the run-status update leaves NEITHER committed — no orphan journal, run stays draft', async () => {
    const runs = new Map<string, PayrollRun>([['pr_1', makeRun()]]);
    let journalPosted = false;

    const executor = new FakePayrollRunPostingExecutor({
      journal: {
        postJournalEntry: async () => {
          journalPosted = true;
          return { id: 'je_1' };
        },
      },
      runs: {
        getById: async (id) => runs.get(id),
        update: async (id, patch) => {
          const updated = { ...runs.get(id)!, ...patch };
          runs.set(id, updated);
          return updated;
        },
      },
      // Fires AFTER validation but BEFORE the journal is posted — proves
      // the "no partial state" contract exactly like a mid-transaction
      // Postgres error would: nothing has been touched at this point.
      beforeCommit: () => {
        throw new Error('simulated mid-transaction failure');
      },
    });

    await expect(
      executor.postRun({
        payrollRunId: 'pr_1',
        payDate: '2026-06-25',
        memo: 'Payroll run PR-0001',
        source: 'payroll',
        lines: [
          { accountId: 'acc_5400', debit: 20000, credit: 0 },
          { accountId: 'acc_2250', debit: 0, credit: 16822.88 },
          { accountId: 'acc_2200', debit: 0, credit: 3000 },
          { accountId: 'acc_2210', debit: 0, credit: 177.12 },
        ],
        contraAccountId: 'acc_2250',
      }),
    ).rejects.toThrow(/simulated mid-transaction failure/);

    expect(journalPosted).toBe(false);
    expect(runs.get('pr_1')!.status).toBe('draft');
    expect(runs.get('pr_1')!.journalEntryId).toBeUndefined();
  });

  it('retrying the SAME payroll run id after a successful post is idempotent — exactly one journal, no double-post', async () => {
    const run = makeRun();
    const runs = new Map<string, PayrollRun>([['pr_1', run]]);
    let journalPostCount = 0;

    const executor = new FakePayrollRunPostingExecutor({
      journal: {
        postJournalEntry: async () => {
          journalPostCount += 1;
          return { id: `je_${journalPostCount}` };
        },
      },
      runs: {
        getById: async (id) => runs.get(id),
        update: async (id, patch) => {
          const updated = { ...runs.get(id)!, ...patch };
          runs.set(id, updated);
          return updated;
        },
      },
    });

    const input = {
      payrollRunId: 'pr_1',
      payDate: '2026-06-25',
      memo: 'Payroll run PR-0001',
      source: 'payroll',
      lines: [
        { accountId: 'acc_5400', debit: 20000, credit: 0 },
        { accountId: 'acc_2250', debit: 0, credit: 20000 },
      ],
      contraAccountId: 'acc_2250',
    };

    const first = await executor.postRun(input);
    expect(first.idempotent).toBe(false);
    expect(journalPostCount).toBe(1);

    // A genuine retry of the exact same posting intent (network retry,
    // double-click before the button disabled) — the run's own id IS the
    // idempotency key (a run posts at most once, ever), so this must
    // return the SAME result, not attempt a second post.
    const second = await executor.postRun(input);
    expect(second.idempotent).toBe(true);
    expect(second.journalEntryId).toBe(first.journalEntryId);
    expect(journalPostCount).toBe(1);
  });

  it('rejects a Cash and Bank (asset-type) contra account even when everything else about the request is valid', async () => {
    const runs = new Map<string, PayrollRun>([['pr_1', makeRun()]]);
    const executor = new FakePayrollRunPostingExecutor({
      journal: { postJournalEntry: async () => ({ id: 'je_1' }) },
      runs: {
        getById: async (id) => runs.get(id),
        update: async (id, patch) => {
          const updated = { ...runs.get(id)!, ...patch };
          runs.set(id, updated);
          return updated;
        },
      },
      accounts: { getType: async (id) => (id === 'acc_1000' ? 'asset' : 'liability') },
    });

    await expect(
      executor.postRun({
        payrollRunId: 'pr_1',
        payDate: '2026-06-25',
        memo: 'Payroll run PR-0001',
        source: 'payroll',
        lines: [{ accountId: 'acc_5400', debit: 20000, credit: 0 }],
        contraAccountId: 'acc_1000',
      }),
    ).rejects.toThrow(/liability\/clearing account/);
  });
});
