import { describe, expect, it } from 'vitest';
import type { EclComputation } from '@/types';
import { FakeEclPostingExecutor } from './eclPostingExecutor';

function makeComputation(overrides: Partial<EclComputation> = {}): EclComputation {
  return {
    id: 'ecl_1',
    companyId: 'comp_1',
    financialYearId: 'fy_1',
    financialYearLabel: 'FY2026',
    asOfDate: '2026-12-31T23:59:59.999Z',
    status: 'draft',
    buckets: [],
    totalGrossReceivable: 9500,
    totalExpectedCreditLoss: 950,
    createdAt: '2026-12-31T00:00:00.000Z',
    updatedAt: '2026-12-31T00:00:00.000Z',
    ...overrides,
  };
}

describe('EclPostingExecutor (adversarial)', () => {
  function makeHarness(computation: EclComputation) {
    const computations = new Map([[computation.id, computation]]);
    let journalPostCount = 0;
    const executor = new FakeEclPostingExecutor({
      journal: { postJournalEntry: async () => { journalPostCount += 1; return { id: `je_${journalPostCount}` }; } },
      computations: {
        getById: async (id) => computations.get(id),
        update: async (id, patch) => {
          const updated = { ...computations.get(id)!, ...patch };
          computations.set(id, updated);
          return updated;
        },
      },
    });
    return { computations, executor, journalPostCount: () => journalPostCount };
  }

  it('a failure between validation and the journal post leaves NEITHER committed', async () => {
    const computation = makeComputation();
    const computations = new Map([[computation.id, computation]]);
    let journalPosted = false;

    const executor = new FakeEclPostingExecutor({
      journal: { postJournalEntry: async () => { journalPosted = true; return { id: 'je_1' }; } },
      computations: {
        getById: async (id) => computations.get(id),
        update: async (id, patch) => {
          const updated = { ...computations.get(id)!, ...patch };
          computations.set(id, updated);
          return updated;
        },
      },
      beforeCommit: () => {
        throw new Error('simulated mid-transaction failure');
      },
    });

    await expect(
      executor.postComputation({
        eclComputationId: 'ecl_1',
        date: '2026-12-31',
        memo: 'x',
        source: 'expected_credit_loss',
        lines: [
          { accountId: 'acc_5700', debit: 950, credit: 0 },
          { accountId: 'acc_1150', debit: 0, credit: 950 },
        ],
        movementAmount: 950,
        priorTotalExpectedCreditLoss: undefined,
      }),
    ).rejects.toThrow(/simulated mid-transaction failure/);

    expect(journalPosted).toBe(false);
    expect(computations.get('ecl_1')!.status).toBe('draft');
  });

  it('retrying after a successful post is idempotent — exactly one journal', async () => {
    const { executor, journalPostCount } = makeHarness(makeComputation());
    const input = {
      eclComputationId: 'ecl_1',
      date: '2026-12-31',
      memo: 'x',
      source: 'expected_credit_loss',
      lines: [
        { accountId: 'acc_5700', debit: 950, credit: 0 },
        { accountId: 'acc_1150', debit: 0, credit: 950 },
      ],
      movementAmount: 950,
      priorTotalExpectedCreditLoss: undefined,
    };

    const first = await executor.postComputation(input);
    expect(first.idempotent).toBe(false);
    expect(journalPostCount()).toBe(1);

    const second = await executor.postComputation(input);
    expect(second.idempotent).toBe(true);
    expect(second.journalEntryId).toBe(first.journalEntryId);
    expect(journalPostCount()).toBe(1);
  });

  it('a zero-movement computation (empty lines) still posts with movementAmount 0 and no journal entry', async () => {
    const { computations, executor, journalPostCount } = makeHarness(makeComputation());

    const result = await executor.postComputation({
      eclComputationId: 'ecl_1',
      date: '2026-12-31',
      memo: 'x',
      source: 'expected_credit_loss',
      lines: [],
      movementAmount: 0,
      priorTotalExpectedCreditLoss: 950,
    });

    expect(result.computation.status).toBe('posted');
    expect(result.journalEntryId).toBeUndefined();
    expect(journalPostCount()).toBe(0);
    expect(computations.get('ecl_1')!.movementAmount).toBe(0);
  });

  it('rejects posting a computation that is already posted', async () => {
    const { executor } = makeHarness(makeComputation({ status: 'posted' }));
    await expect(
      executor.postComputation({ eclComputationId: 'ecl_1', date: '2026-12-31', memo: 'x', source: 'expected_credit_loss', lines: [], movementAmount: 0, priorTotalExpectedCreditLoss: undefined }),
    ).rejects.toThrow(/already been posted/);
  });
});
