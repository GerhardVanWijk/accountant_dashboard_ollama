import { describe, expect, it } from 'vitest';
import type { PayrollRun } from '@/types';
import { FakePayrollSettlementExecutor } from './payrollSettlementExecutor';

/**
 * FINAL PRE-MIGRATION HARDENING, PART A — database-level clearing
 * over-settlement protection. These tests exercise `settle_payroll_net_pay`'s
 * Fake double directly, INCLUDING its `KeyedMutex`-based simulation of the
 * real RPC's `FOR UPDATE` row lock, so the concurrency proofs below are
 * genuine: two "concurrent" `settle()` calls for the SAME run really do
 * serialise through the fake exactly as they would through the real lock,
 * not race freely the way a naive check-then-write double would.
 */
describe('PayrollSettlementExecutor (adversarial — over-settlement protection)', () => {
  function makeRun(overrides: Partial<{ status: string; reversedAt?: string }> = {}): PayrollRun & { status: string } {
    return {
      id: 'pr_1',
      runNumber: 'PR-0001',
      payPeriodStart: '2026-06-01',
      payPeriodEnd: '2026-06-30',
      payDate: '2026-06-25',
      status: 'posted',
      journalEntryId: 'je_original',
      contraAccountId: 'acc_2250',
      payslips: [],
      createdAt: '',
      updatedAt: '',
      ...overrides,
    } as PayrollRun & { status: string };
  }

  /** A run whose posted journal credited acc_2250 exactly R10,000 — the authoritative original obligation every test in this file settles against. */
  function makeHarness(originalObligation = 10000) {
    const run = makeRun();
    const bankTransactions: unknown[] = [];
    let journalPostCount = 0;

    const executor = new FakePayrollSettlementExecutor({
      journal: {
        getEntry: async (id) =>
          id === 'je_original'
            ? { lines: [{ accountId: 'acc_5400', debit: originalObligation, credit: 0 }, { accountId: 'acc_2250', debit: 0, credit: originalObligation }] }
            : undefined,
        postJournalEntry: async () => {
          journalPostCount += 1;
          return { id: `je_settle_${journalPostCount}` };
        },
      },
      runs: { getById: async (id) => (id === run.id ? run : undefined) },
      bankAccounts: { getById: async (id) => (id === 'bank_1' ? { id: 'bank_1', glAccountId: 'acc_1000' } : undefined) },
      bankTransactions: {
        create: async (entity) => {
          const id = `btx_${bankTransactions.length + 1}`;
          bankTransactions.push({ id, ...(entity as object) });
          return { id };
        },
      },
    });

    return { executor, run, bankTransactions, journalPostCount: () => journalPostCount };
  }

  const settleInput = (amount: number, settlementId: string, bankAccountId = 'bank_1') => ({
    settlementId,
    payrollRunId: 'pr_1',
    bankAccountId,
    date: '2026-06-26',
    amount,
  });

  it('exact settlement succeeds: R10,000 outstanding -> R10,000 settlement -> R0.00 remaining, and a subsequent settlement fails cleanly', async () => {
    const { executor } = makeHarness(10000);

    const result = await executor.settle(settleInput(10000, 'stl_1'));
    expect(result.idempotent).toBe(false);
    expect(result.bankTransactionId).toBeDefined();
    expect(result.journalEntryId).toBeDefined();

    // Outstanding is now R0 — any further settlement, any amount clearly
    // above rounding tolerance, fails (0.01 is the RPC's own float-rounding
    // epsilon, not a real amount — see settle_payroll_net_pay's `+ 0.01`).
    await expect(executor.settle(settleInput(0.02, 'stl_2'))).rejects.toThrow(/exceeds outstanding/);
    await expect(executor.settle(settleInput(1, 'stl_3'))).rejects.toThrow(/exceeds outstanding/);
  });

  it('rejects an over-settlement attempt outright — R10,001 against R10,000 outstanding', async () => {
    const { executor, bankTransactions, journalPostCount } = makeHarness(10000);
    await expect(executor.settle(settleInput(10001, 'stl_1'))).rejects.toThrow(/exceeds outstanding/);
    // ZERO partial state: no journal, no bank transaction.
    expect(journalPostCount()).toBe(0);
    expect(bankTransactions).toHaveLength(0);
  });

  it('partial settlements work — R4,000 then R6,000 against R10,000, both succeed, outstanding tracked correctly throughout', async () => {
    const { executor, bankTransactions } = makeHarness(10000);

    const first = await executor.settle(settleInput(4000, 'stl_1'));
    expect(first.idempotent).toBe(false);

    // R6,001 would now exceed the R6,000 remaining — rejected.
    await expect(executor.settle(settleInput(6001, 'stl_2'))).rejects.toThrow(/exceeds outstanding/);

    // Exactly R6,000 succeeds — fully settled.
    const second = await executor.settle(settleInput(6000, 'stl_3'));
    expect(second.idempotent).toBe(false);
    expect(bankTransactions).toHaveLength(2);

    // Nothing left — even a clearly-above-rounding-tolerance amount now fails.
    await expect(executor.settle(settleInput(0.02, 'stl_4'))).rejects.toThrow(/exceeds outstanding/);
  });

  it('CONCURRENCY: outstanding R10,000 — two "concurrent" R7,000 attempts — only one may succeed, NEVER R14,000 settled', async () => {
    const { executor, bankTransactions } = makeHarness(10000);

    const [resultA, resultB] = await Promise.allSettled([
      executor.settle(settleInput(7000, 'stl_a')),
      executor.settle(settleInput(7000, 'stl_b')),
    ]);

    const succeeded = [resultA, resultB].filter((r) => r.status === 'fulfilled');
    const failed = [resultA, resultB].filter((r) => r.status === 'rejected');

    // Exactly one of the two succeeds; the other is cleanly rejected.
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason.message).toMatch(/exceeds outstanding/);

    // The total actually settled is R7,000 — there is NO route to R14,000.
    const totalSettled = bankTransactions.reduce((s: number, t) => s + (t as { amount: number }).amount, 0);
    expect(totalSettled).toBe(7000);
    expect(totalSettled).toBeLessThanOrEqual(10000);
  });

  it('CONCURRENCY: two "concurrent" exact-outstanding attempts (R10,000 each against R10,000 outstanding) — only one succeeds', async () => {
    const { executor, bankTransactions } = makeHarness(10000);

    const results = await Promise.allSettled([executor.settle(settleInput(10000, 'stl_a')), executor.settle(settleInput(10000, 'stl_b'))]);
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    expect(succeeded).toHaveLength(1);
    const totalSettled = bankTransactions.reduce((s: number, t) => s + (t as { amount: number }).amount, 0);
    expect(totalSettled).toBe(10000);
  });

  it('SAME idempotency token cannot duplicate a settlement — retrying settlementId "stl_1" returns the original result, not a second settlement', async () => {
    const { executor, bankTransactions, journalPostCount } = makeHarness(10000);

    const first = await executor.settle(settleInput(4000, 'stl_1'));
    const retry = await executor.settle(settleInput(4000, 'stl_1'));

    expect(retry.idempotent).toBe(true);
    expect(retry.bankTransactionId).toBe(first.bankTransactionId);
    expect(retry.journalEntryId).toBe(first.journalEntryId);
    expect(bankTransactions).toHaveLength(1); // still one, not two
    expect(journalPostCount()).toBe(1); // still one journal, not two

    // Confirms the retry did NOT consume more of the outstanding balance —
    // R6,000 more (up to the true R10,000 - R4,000 = R6,000 remaining) still succeeds.
    const second = await executor.settle(settleInput(6000, 'stl_2'));
    expect(second.idempotent).toBe(false);
  });

  it('CONCURRENCY: retrying the SAME settlementId concurrently also cannot duplicate (two tabs double-submitting the identical request)', async () => {
    const { executor, bankTransactions, journalPostCount } = makeHarness(10000);

    const [a, b] = await Promise.all([executor.settle(settleInput(4000, 'stl_1')), executor.settle(settleInput(4000, 'stl_1'))]);
    // One of them is the "real" post, the other resolves idempotent — either order is fine.
    expect([a.idempotent, b.idempotent].sort()).toEqual([false, true]);
    expect(bankTransactions).toHaveLength(1);
    expect(journalPostCount()).toBe(1);
  });

  it('a failure between validation and posting leaves ZERO partial state — no journal, no bank transaction, no settlement recorded', async () => {
    const run = makeRun();
    const bankTransactions: unknown[] = [];
    let journalPosted = false;
    let shouldFail = true;

    const executor = new FakePayrollSettlementExecutor({
      journal: {
        getEntry: async () => ({ lines: [{ accountId: 'acc_2250', debit: 0, credit: 10000 }] }),
        postJournalEntry: async () => {
          journalPosted = true;
          return { id: 'je_x' };
        },
      },
      runs: { getById: async () => run },
      bankAccounts: { getById: async () => ({ id: 'bank_1', glAccountId: 'acc_1000' }) },
      bankTransactions: { create: async (e) => { bankTransactions.push(e); return { id: 'btx_x' }; } },
      // Fails only the FIRST call — simulates one mid-transaction failure,
      // not a permanently broken dependency, so the follow-up below proves
      // the failed attempt truly left nothing behind (the full R10,000 is
      // still available), not merely that the executor is unusable.
      beforeCommit: () => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error('simulated mid-transaction failure');
        }
      },
    });

    await expect(executor.settle({ settlementId: 'stl_1', payrollRunId: 'pr_1', bankAccountId: 'bank_1', date: '2026-06-26', amount: 5000 })).rejects.toThrow(
      /simulated mid-transaction failure/,
    );
    expect(journalPosted).toBe(false);
    expect(bankTransactions).toHaveLength(0);

    // And the settlement never happened — the full R10,000 is still available.
    const followUp = await executor.settle({ settlementId: 'stl_2', payrollRunId: 'pr_1', bankAccountId: 'bank_1', date: '2026-06-26', amount: 10000 });
    expect(followUp.idempotent).toBe(false);
  });

  it('rejects settling a run that has been reversed — its net pay was never disbursed', async () => {
    const run = makeRun({ reversedAt: '2026-06-27T00:00:00.000Z' });
    const executor = new FakePayrollSettlementExecutor({
      journal: { getEntry: async () => ({ lines: [] }), postJournalEntry: async () => ({ id: 'je_x' }) },
      runs: { getById: async () => run },
      bankAccounts: { getById: async () => ({ id: 'bank_1', glAccountId: 'acc_1000' }) },
      bankTransactions: { create: async () => ({ id: 'btx_x' }) },
    });
    await expect(executor.settle(settleInput(100, 'stl_1'))).rejects.toThrow(/reversed/);
  });

  it('rejects a zero or negative amount', async () => {
    const { executor } = makeHarness(10000);
    await expect(executor.settle(settleInput(0, 'stl_1'))).rejects.toThrow(/greater than zero/);
    await expect(executor.settle(settleInput(-1, 'stl_2'))).rejects.toThrow(/greater than zero/);
  });

  it('rejects settling a draft (unposted) run', async () => {
    const run = makeRun({ status: 'draft' });
    const executor = new FakePayrollSettlementExecutor({
      journal: { getEntry: async () => ({ lines: [] }), postJournalEntry: async () => ({ id: 'je_x' }) },
      runs: { getById: async () => run },
      bankAccounts: { getById: async () => ({ id: 'bank_1', glAccountId: 'acc_1000' }) },
      bankTransactions: { create: async () => ({ id: 'btx_x' }) },
    });
    await expect(executor.settle(settleInput(100, 'stl_1'))).rejects.toThrow(/is not posted/);
  });
});
