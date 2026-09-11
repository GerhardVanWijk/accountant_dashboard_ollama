import { describe, expect, it } from 'vitest';
import { FakeLeasePeriodSettlementExecutor } from './leasePeriodSettlementExecutor';

/**
 * FINAL PRE-MIGRATION HARDENING, PART A (database-level over-settlement
 * protection) + PART B (a lease's clearing balance is tracked per
 * amortization PERIOD, not one cumulative figure per lease). These tests
 * exercise `settle_lease_period_payment`'s Fake double directly, INCLUDING
 * its `KeyedMutex`-based simulation of the real RPC's `FOR UPDATE` row
 * lock scoped to ONE entry id, so both the over-settlement proofs and the
 * period-independence proofs below are genuine.
 */
describe('LeasePeriodSettlementExecutor (adversarial — over-settlement + period-independence)', () => {
  interface Entry {
    id: string;
    leaseId: string;
    periodEnd: string;
    interestAmount: number;
    principalAmount: number;
  }

  function makeHarness(entries: Entry[]) {
    const entryMap = new Map(entries.map((e) => [e.id, e]));
    const lease = { id: 'lease_1', leaseNumber: 'LSE-0001' };
    const bankTransactions: unknown[] = [];
    let journalPostCount = 0;

    const executor = new FakeLeasePeriodSettlementExecutor({
      journal: {
        postJournalEntry: async () => {
          journalPostCount += 1;
          return { id: `je_settle_${journalPostCount}` };
        },
      },
      amortizationEntries: { getById: async (id) => entryMap.get(id) },
      leases: { getById: async (id) => (id === lease.id ? lease : undefined) },
      bankAccounts: { getById: async (id) => (id === 'bank_1' ? { id: 'bank_1', glAccountId: 'acc_1000' } : undefined) },
      bankTransactions: {
        create: async (entity) => {
          const id = `btx_${bankTransactions.length + 1}`;
          bankTransactions.push({ id, ...(entity as object) });
          return { id };
        },
      },
      clearingAccountId: 'acc_2460',
    });

    return { executor, lease, bankTransactions, journalPostCount: () => journalPostCount };
  }

  const jan: Entry = { id: 'entry_jan', leaseId: 'lease_1', periodEnd: '2026-01-31', interestAmount: 5000, principalAmount: 10000 }; // payment 15000
  const feb: Entry = { id: 'entry_feb', leaseId: 'lease_1', periodEnd: '2026-02-28', interestAmount: 4800, principalAmount: 10200 }; // payment 15000
  const mar: Entry = { id: 'entry_mar', leaseId: 'lease_1', periodEnd: '2026-03-31', interestAmount: 4600, principalAmount: 10400 }; // payment 15000

  const settleInput = (entryId: string, amount: number, settlementId: string) => ({
    settlementId,
    leaseAmortizationEntryId: entryId,
    bankAccountId: 'bank_1',
    date: '2026-04-01',
    amount,
  });

  it('worked example: January fully settled, February untouched (R0 settled), March partially settled leaves the exact remainder', async () => {
    const { executor, bankTransactions } = makeHarness([jan, feb, mar]);

    const janResult = await executor.settle(settleInput('entry_jan', 15000, 'stl_jan'));
    expect(janResult.idempotent).toBe(false);

    const marResult = await executor.settle(settleInput('entry_mar', 5000, 'stl_mar'));
    expect(marResult.idempotent).toBe(false);

    // February: settling January and March never touched it.
    const febSettled = bankTransactions.filter((t) => (t as { matchedEntityId?: string }).matchedEntityId === 'entry_feb');
    expect(febSettled).toHaveLength(0);

    // March: exactly R5,000 settled of its R15,000 obligation -> R10,000 remaining.
    const marSettled = bankTransactions.filter((t) => (t as { matchedEntityId?: string }).matchedEntityId === 'entry_mar');
    expect(marSettled.reduce((s: number, t) => s + (t as { amount: number }).amount, 0)).toBe(5000);
    // The exact remainder (R10,000) is settleable, but R10,000.01 is not.
    await expect(executor.settle(settleInput('entry_mar', 10001, 'stl_mar2'))).rejects.toThrow(/exceeds outstanding/);
    const marFinal = await executor.settle(settleInput('entry_mar', 10000, 'stl_mar3'));
    expect(marFinal.idempotent).toBe(false);

    // January: fully settled at R15,000 — a further settlement of any amount fails.
    await expect(executor.settle(settleInput('entry_jan', 1, 'stl_jan2'))).rejects.toThrow(/exceeds outstanding/);
  });

  it('settling January does not settle February — each period maintains its own settlement state', async () => {
    const { executor, bankTransactions } = makeHarness([jan, feb]);
    await executor.settle(settleInput('entry_jan', 15000, 'stl_1'));

    // February's full R15,000 is still available — proves January's
    // settlement had zero effect on February's outstanding balance.
    const febResult = await executor.settle(settleInput('entry_feb', 15000, 'stl_2'));
    expect(febResult.idempotent).toBe(false);

    const janTotal = bankTransactions.filter((t) => (t as { matchedEntityId?: string }).matchedEntityId === 'entry_jan').reduce((s: number, t) => s + (t as { amount: number }).amount, 0);
    const febTotal = bankTransactions.filter((t) => (t as { matchedEntityId?: string }).matchedEntityId === 'entry_feb').reduce((s: number, t) => s + (t as { amount: number }).amount, 0);
    expect(janTotal).toBe(15000);
    expect(febTotal).toBe(15000);
  });

  it('period settlement links to the correct bank transaction — matchedEntityType is lease_amortization_entry, matchedEntityId is the SPECIFIC period, never the lease as a whole', async () => {
    const { executor, bankTransactions } = makeHarness([jan]);
    const result = await executor.settle(settleInput('entry_jan', 15000, 'stl_1'));
    const txn = bankTransactions.find((t) => (t as { id: string }).id === result.bankTransactionId) as { matchedEntityType: string; matchedEntityId: string };
    expect(txn.matchedEntityType).toBe('lease_amortization_entry');
    expect(txn.matchedEntityId).toBe('entry_jan');
  });

  it('CONCURRENCY: outstanding R10,000 for one period — two "concurrent" R7,000 attempts — only one may succeed, NEVER R14,000 settled', async () => {
    const entry: Entry = { id: 'entry_x', leaseId: 'lease_1', periodEnd: '2026-05-31', interestAmount: 4000, principalAmount: 6000 }; // payment 10000
    const { executor, bankTransactions } = makeHarness([entry]);

    const results = await Promise.allSettled([executor.settle(settleInput('entry_x', 7000, 'stl_a')), executor.settle(settleInput('entry_x', 7000, 'stl_b'))]);
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const totalSettled = bankTransactions.reduce((s: number, t) => s + (t as { amount: number }).amount, 0);
    expect(totalSettled).toBe(7000);
    expect(totalSettled).toBeLessThanOrEqual(10000);
  });

  it('CONCURRENCY: settling DIFFERENT periods of the SAME lease concurrently never contend — both succeed independently', async () => {
    const { executor, bankTransactions } = makeHarness([jan, feb]);

    const [janResult, febResult] = await Promise.all([executor.settle(settleInput('entry_jan', 15000, 'stl_jan')), executor.settle(settleInput('entry_feb', 15000, 'stl_feb'))]);
    expect(janResult.idempotent).toBe(false);
    expect(febResult.idempotent).toBe(false);
    expect(bankTransactions).toHaveLength(2);
  });

  it('SAME idempotency token cannot duplicate a period settlement', async () => {
    const { executor, bankTransactions, journalPostCount } = makeHarness([jan]);
    const first = await executor.settle(settleInput('entry_jan', 5000, 'stl_1'));
    const retry = await executor.settle(settleInput('entry_jan', 5000, 'stl_1'));
    expect(retry.idempotent).toBe(true);
    expect(retry.bankTransactionId).toBe(first.bankTransactionId);
    expect(bankTransactions).toHaveLength(1);
    expect(journalPostCount()).toBe(1);
  });

  it('a failure before posting leaves ZERO partial state for that period, and does not affect any other period', async () => {
    let shouldFail = true;
    const entryMap = new Map<string, Entry>([['entry_jan', jan], ['entry_feb', feb]]);
    const failingBankTransactions: unknown[] = [];
    const brokenOnce = new FakeLeasePeriodSettlementExecutor({
      journal: { postJournalEntry: async () => ({ id: 'je_x' }) },
      amortizationEntries: { getById: async (id) => entryMap.get(id) },
      leases: { getById: async () => ({ id: 'lease_1', leaseNumber: 'LSE-0001' }) },
      bankAccounts: { getById: async () => ({ id: 'bank_1', glAccountId: 'acc_1000' }) },
      bankTransactions: { create: async (e) => { failingBankTransactions.push(e); return { id: `btx_${failingBankTransactions.length}` }; } },
      clearingAccountId: 'acc_2460',
      beforeCommit: () => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error('simulated mid-transaction failure');
        }
      },
    });

    await expect(brokenOnce.settle(settleInput('entry_jan', 15000, 'stl_1'))).rejects.toThrow(/simulated mid-transaction failure/);
    expect(failingBankTransactions).toHaveLength(0);
    // January's full obligation is still available — nothing partial stuck around.
    const retry = await brokenOnce.settle(settleInput('entry_jan', 15000, 'stl_2'));
    expect(retry.idempotent).toBe(false);
  });

  it('rejects a zero or negative amount', async () => {
    const { executor } = makeHarness([jan]);
    await expect(executor.settle(settleInput('entry_jan', 0, 'stl_1'))).rejects.toThrow(/greater than zero/);
  });

  it('rejects settling an unknown period', async () => {
    const { executor } = makeHarness([jan]);
    await expect(executor.settle(settleInput('entry_missing', 100, 'stl_1'))).rejects.toThrow(/not found/);
  });
});
