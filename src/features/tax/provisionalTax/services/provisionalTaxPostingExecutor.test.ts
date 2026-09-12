import { describe, expect, it } from 'vitest';
import type { ProvisionalTaxPeriod } from '@/types/provisionalTax';
import { FakeProvisionalTaxPostingExecutor } from './provisionalTaxPostingExecutor';

function makePeriod(overrides: Partial<ProvisionalTaxPeriod> = {}): ProvisionalTaxPeriod {
  return {
    id: 'pt_1',
    companyId: 'comp_1',
    financialYearId: 'fy_1',
    financialYearLabel: 'FY2026',
    first: { dueDate: '2026-08-31T00:00:00.000Z', estimatedTaxableIncome: 300000, estimatedTaxLiability: 40500 },
    second: { dueDate: '2027-02-28T00:00:00.000Z', estimatedTaxableIncome: 600000, estimatedTaxLiability: 81000 },
    topUp: { dueDate: '2027-09-30T00:00:00.000Z' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Direct adversarial proof against `pay_provisional_tax`'s Fake executor
 * double — same class of test as taxComputationPostingExecutor.test.ts /
 * payrollRunPostingExecutor.test.ts (Tax & Compliance integrity audit
 * continuation, 2026-09-12, §25 "Concurrency/idempotency"), plus the
 * ProvisionalTaxPeriod-specific proof that first/second/topUp are three
 * independent legitimate events, not deduplicated against each other.
 */
describe('ProvisionalTaxPostingExecutor (adversarial)', () => {
  function makeHarness(period: ProvisionalTaxPeriod) {
    const periods = new Map<string, ProvisionalTaxPeriod>([[period.id, period]]);
    let journalPostCount = 0;
    const executor = new FakeProvisionalTaxPostingExecutor({
      journal: {
        postJournalEntry: async () => {
          journalPostCount += 1;
          return { id: `je_${journalPostCount}` };
        },
      },
      periods: {
        getById: async (id) => periods.get(id),
        update: async (id, patch) => {
          const updated = { ...periods.get(id)!, ...patch };
          periods.set(id, updated);
          return updated;
        },
      },
    });
    return { periods, executor, journalPostCount: () => journalPostCount };
  }

  it('a failure between validation and the journal post leaves NEITHER committed — no orphan journal, slot stays unpaid', async () => {
    const period = makePeriod();
    const periods = new Map([[period.id, period]]);
    let journalPosted = false;

    const executor = new FakeProvisionalTaxPostingExecutor({
      journal: {
        postJournalEntry: async () => {
          journalPosted = true;
          return { id: 'je_1' };
        },
      },
      periods: {
        getById: async (id) => periods.get(id),
        update: async (id, patch) => {
          const updated = { ...periods.get(id)!, ...patch };
          periods.set(id, updated);
          return updated;
        },
      },
      beforeCommit: () => {
        throw new Error('simulated mid-transaction failure');
      },
    });

    await expect(
      executor.payProvisionalTax({
        periodId: 'pt_1',
        slot: 'first',
        amountPaid: 40500,
        date: '2026-08-25',
        memo: 'First provisional tax payment - FY2026',
        source: 'provisional_tax',
        lines: [
          { accountId: 'acc_2300', debit: 40500, credit: 0 },
          { accountId: 'acc_1000', debit: 0, credit: 40500 },
        ],
      }),
    ).rejects.toThrow(/simulated mid-transaction failure/);

    expect(journalPosted).toBe(false);
    expect(periods.get('pt_1')!.first.paidDate).toBeUndefined();
  });

  it('retrying the SAME (period, slot) after a successful post is idempotent — exactly one journal, no double-post', async () => {
    const { periods, executor, journalPostCount } = makeHarness(makePeriod());

    const input = {
      periodId: 'pt_1',
      slot: 'first' as const,
      amountPaid: 40500,
      date: '2026-08-25',
      memo: 'First provisional tax payment - FY2026',
      source: 'provisional_tax',
      lines: [
        { accountId: 'acc_2300', debit: 40500, credit: 0 },
        { accountId: 'acc_1000', debit: 0, credit: 40500 },
      ],
    };

    const first = await executor.payProvisionalTax(input);
    expect(first.idempotent).toBe(false);
    expect(journalPostCount()).toBe(1);

    const second = await executor.payProvisionalTax(input);
    expect(second.idempotent).toBe(true);
    expect(second.journalEntryId).toBe(first.journalEntryId);
    expect(journalPostCount()).toBe(1);
    expect(periods.get('pt_1')!.first.paidDate).toBe('2026-08-25');
  });

  it('first and second slot payments on the SAME period coexist — paying one does not block or dedupe the other', async () => {
    const { periods, executor, journalPostCount } = makeHarness(makePeriod());

    await executor.payProvisionalTax({
      periodId: 'pt_1',
      slot: 'first',
      amountPaid: 40500,
      date: '2026-08-25',
      memo: 'First provisional tax payment - FY2026',
      source: 'provisional_tax',
      lines: [
        { accountId: 'acc_2300', debit: 40500, credit: 0 },
        { accountId: 'acc_1000', debit: 0, credit: 40500 },
      ],
    });
    await executor.payProvisionalTax({
      periodId: 'pt_1',
      slot: 'second',
      amountPaid: 81000,
      date: '2027-02-20',
      memo: 'Second provisional tax payment - FY2026',
      source: 'provisional_tax',
      lines: [
        { accountId: 'acc_2300', debit: 81000, credit: 0 },
        { accountId: 'acc_1000', debit: 0, credit: 81000 },
      ],
    });

    expect(journalPostCount()).toBe(2);
    const updated = periods.get('pt_1')!;
    expect(updated.first.paidDate).toBe('2026-08-25');
    expect(updated.first.amountPaid).toBe(40500);
    expect(updated.second.paidDate).toBe('2027-02-20');
    expect(updated.second.amountPaid).toBe(81000);
  });

  it('rejects paying a slot that is already recorded as paid', async () => {
    const period = makePeriod({ first: { dueDate: '2026-08-31T00:00:00.000Z', amountPaid: 40500, paidDate: '2026-08-20', journalEntryId: 'je_prior' } });
    const { executor } = makeHarness(period);

    await expect(
      executor.payProvisionalTax({
        periodId: 'pt_1',
        slot: 'first',
        amountPaid: 40500,
        date: '2026-08-25',
        memo: 'x',
        source: 'provisional_tax',
        lines: [],
      }),
    ).rejects.toThrow(/already been recorded as paid/);
  });
});
