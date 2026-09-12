import { describe, expect, it } from 'vitest';
import type { TaxComputation } from '@/types';
import { FakeTaxComputationPostingExecutor } from './taxComputationPostingExecutor';

function makeComputation(overrides: Partial<TaxComputation> = {}): TaxComputation {
  return {
    id: 'tc_1',
    companyId: 'comp_1',
    financialYearId: 'fy_1',
    financialYearLabel: 'FY2026',
    status: 'draft',
    accountingProfit: 300000,
    isSbcEligible: false,
    adjustments: [],
    taxableIncome: 300000,
    taxConfigId: 'itc_1',
    taxConfigTaxYearLabel: '2026/2027',
    taxLiability: 81000,
    createdAt: '2026-12-31T00:00:00.000Z',
    updatedAt: '2026-12-31T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Direct adversarial proof against `post_income_tax_computation`'s Fake
 * executor double — same class of test as payrollRunPostingExecutor.test.ts
 * (Tax & Compliance integrity audit, 2026-09-12, item "Concurrency/
 * idempotency" §25): "a failed atomic operation leaves neither GL nor
 * subledger partial state" and "retry does not duplicate accounting",
 * proven at the layer that actually owns those guarantees.
 */
describe('TaxComputationPostingExecutor (adversarial)', () => {
  it('a failure between validation and the journal post leaves NEITHER committed — no orphan journal, computation stays draft', async () => {
    const computations = new Map<string, TaxComputation>([['tc_1', makeComputation()]]);
    let journalPosted = false;

    const executor = new FakeTaxComputationPostingExecutor({
      journal: {
        postJournalEntry: async () => {
          journalPosted = true;
          return { id: 'je_1' };
        },
      },
      computations: {
        getById: async (id) => computations.get(id),
        update: async (id, patch) => {
          const updated = { ...computations.get(id)!, ...patch };
          computations.set(id, updated);
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
      executor.postComputation({
        taxComputationId: 'tc_1',
        date: '2026-12-31',
        memo: 'Corporate income tax - FY2026',
        source: 'income_tax',
        lines: [
          { accountId: 'acc_5500', debit: 81000, credit: 0 },
          { accountId: 'acc_2300', debit: 0, credit: 81000 },
        ],
      }),
    ).rejects.toThrow(/simulated mid-transaction failure/);

    expect(journalPosted).toBe(false);
    expect(computations.get('tc_1')!.status).toBe('draft');
    expect(computations.get('tc_1')!.journalEntryId).toBeUndefined();
  });

  it('retrying the SAME tax computation id after a successful post is idempotent — exactly one journal, no double-post', async () => {
    const computations = new Map<string, TaxComputation>([['tc_1', makeComputation()]]);
    let journalPostCount = 0;

    const executor = new FakeTaxComputationPostingExecutor({
      journal: {
        postJournalEntry: async () => {
          journalPostCount += 1;
          return { id: `je_${journalPostCount}` };
        },
      },
      computations: {
        getById: async (id) => computations.get(id),
        update: async (id, patch) => {
          const updated = { ...computations.get(id)!, ...patch };
          computations.set(id, updated);
          return updated;
        },
      },
    });

    const input = {
      taxComputationId: 'tc_1',
      date: '2026-12-31',
      memo: 'Corporate income tax - FY2026',
      source: 'income_tax',
      lines: [
        { accountId: 'acc_5500', debit: 81000, credit: 0 },
        { accountId: 'acc_2300', debit: 0, credit: 81000 },
      ],
    };

    const first = await executor.postComputation(input);
    expect(first.idempotent).toBe(false);
    expect(journalPostCount).toBe(1);

    // A retry (double-click, dropped response, two tabs) must NOT post a second journal.
    const second = await executor.postComputation(input);
    expect(second.idempotent).toBe(true);
    expect(second.journalEntryId).toBe(first.journalEntryId);
    expect(journalPostCount).toBe(1);
  });

  it('a nil-liability computation (empty lines) still moves to posted with no journal entry', async () => {
    const computations = new Map<string, TaxComputation>([['tc_1', makeComputation({ taxLiability: 0 })]]);
    let journalPostCount = 0;

    const executor = new FakeTaxComputationPostingExecutor({
      journal: { postJournalEntry: async () => { journalPostCount += 1; return { id: 'je_1' }; } },
      computations: {
        getById: async (id) => computations.get(id),
        update: async (id, patch) => {
          const updated = { ...computations.get(id)!, ...patch };
          computations.set(id, updated);
          return updated;
        },
      },
    });

    const result = await executor.postComputation({
      taxComputationId: 'tc_1',
      date: '2026-12-31',
      memo: 'Corporate income tax - FY2026',
      source: 'income_tax',
      lines: [],
    });

    expect(result.computation.status).toBe('posted');
    expect(result.journalEntryId).toBeUndefined();
    expect(journalPostCount).toBe(0);
  });

  it('rejects posting a computation that is already posted', async () => {
    const computations = new Map<string, TaxComputation>([['tc_1', makeComputation({ status: 'posted' })]]);
    const executor = new FakeTaxComputationPostingExecutor({
      journal: { postJournalEntry: async () => ({ id: 'je_1' }) },
      computations: {
        getById: async (id) => computations.get(id),
        update: async (id, patch) => ({ ...computations.get(id)!, ...patch }),
      },
    });

    await expect(
      executor.postComputation({ taxComputationId: 'tc_1', date: '2026-12-31', memo: 'x', source: 'income_tax', lines: [] }),
    ).rejects.toThrow(/already been posted/);
  });
});
