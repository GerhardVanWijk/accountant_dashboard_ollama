import { describe, expect, it } from 'vitest';
import type { DividendDeclaration } from '@/types';
import { FakeDividendDeclarationPostingExecutor } from './dividendDeclarationPostingExecutor';

function makeDeclaration(overrides: Partial<DividendDeclaration> = {}): DividendDeclaration {
  return {
    id: 'divd_1',
    declarationDate: '2026-06-01',
    totalAmount: 100000,
    exemptPortion: 0,
    status: 'draft',
    taxableAmount: 100000,
    ratePercentApplied: 20,
    dividendsTaxWithheld: 20000,
    netPayableToShareholders: 80000,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeHarness(declaration: DividendDeclaration) {
  const declarations = new Map<string, DividendDeclaration>([[declaration.id, declaration]]);
  let journalPostCount = 0;
  const executor = new FakeDividendDeclarationPostingExecutor({
    journal: {
      postJournalEntry: async () => {
        journalPostCount += 1;
        return { id: `je_${journalPostCount}` };
      },
    },
    declarations: {
      getById: async (id) => declarations.get(id),
      update: async (id, patch) => {
        const updated = { ...declarations.get(id)!, ...patch };
        declarations.set(id, updated);
        return updated;
      },
    },
  });
  return { declarations, executor, journalPostCount: () => journalPostCount };
}

const declareLines = [
  { accountId: 'acc_3900', debit: 100000, credit: 0 },
  { accountId: 'acc_2500', debit: 0, credit: 100000 },
];
const payLines = [
  { accountId: 'acc_2500', debit: 100000, credit: 0 },
  { accountId: 'acc_1000', debit: 0, credit: 80000 },
  { accountId: 'acc_2510', debit: 0, credit: 20000 },
];
const remitLines = [
  { accountId: 'acc_2510', debit: 20000, credit: 0 },
  { accountId: 'acc_1000', debit: 0, credit: 20000 },
];

/**
 * Direct adversarial proof against the dividend lifecycle's Fake executor
 * double — same class of test as taxComputationPostingExecutor.test.ts /
 * provisionalTaxPostingExecutor.test.ts (Tax & Compliance integrity audit
 * continuation, 2026-09-12, §25), plus the dividend-specific proof that
 * declare/pay/remit are three independent transitions sharing one
 * declaration, not deduplicated against each other.
 */
describe('DividendDeclarationPostingExecutor (adversarial)', () => {
  it('a failure between validation and the journal post leaves NEITHER committed — declaration stays in its prior status', async () => {
    const declaration = makeDeclaration();
    const declarations = new Map([[declaration.id, declaration]]);
    let journalPosted = false;

    const executor = new FakeDividendDeclarationPostingExecutor({
      journal: {
        postJournalEntry: async () => {
          journalPosted = true;
          return { id: 'je_1' };
        },
      },
      declarations: {
        getById: async (id) => declarations.get(id),
        update: async (id, patch) => {
          const updated = { ...declarations.get(id)!, ...patch };
          declarations.set(id, updated);
          return updated;
        },
      },
      beforeCommit: () => {
        throw new Error('simulated mid-transaction failure');
      },
    });

    await expect(
      executor.declareDividend({ dividendDeclarationId: 'divd_1', date: '2026-06-01', memo: 'x', source: 'dividend_declaration', lines: declareLines }),
    ).rejects.toThrow(/simulated mid-transaction failure/);

    expect(journalPosted).toBe(false);
    expect(declarations.get('divd_1')!.status).toBe('draft');
    expect(declarations.get('divd_1')!.declarationJournalEntryId).toBeUndefined();
  });

  it('retrying the SAME (declaration, transition) after a successful post is idempotent — exactly one journal', async () => {
    const { declarations, executor, journalPostCount } = makeHarness(makeDeclaration());
    const input = { dividendDeclarationId: 'divd_1', date: '2026-06-01', memo: 'x', source: 'dividend_declaration', lines: declareLines };

    const first = await executor.declareDividend(input);
    expect(first.idempotent).toBe(false);
    expect(journalPostCount()).toBe(1);

    const second = await executor.declareDividend(input);
    expect(second.idempotent).toBe(true);
    expect(second.journalEntryId).toBe(first.journalEntryId);
    expect(journalPostCount()).toBe(1);
    expect(declarations.get('divd_1')!.status).toBe('declared');
  });

  it('declare -> pay -> remit each post their own journal and advance status once each — three real, distinct events on one declaration', async () => {
    const { declarations, executor, journalPostCount } = makeHarness(makeDeclaration());

    await executor.declareDividend({ dividendDeclarationId: 'divd_1', date: '2026-06-01', memo: 'declare', source: 'dividend_declaration', lines: declareLines });
    await executor.payDividend({ dividendDeclarationId: 'divd_1', date: '2026-06-10', memo: 'pay', source: 'dividend_payment', lines: payLines });
    await executor.remitDividendToSars({ dividendDeclarationId: 'divd_1', date: '2026-07-31', memo: 'remit', source: 'dividend_tax_remittance', lines: remitLines });

    expect(journalPostCount()).toBe(3);
    const final = declarations.get('divd_1')!;
    expect(final.status).toBe('remitted');
    expect(final.declarationJournalEntryId).toBe('je_1');
    expect(final.paymentJournalEntryId).toBe('je_2');
    expect(final.remittanceJournalEntryId).toBe('je_3');
    expect(final.paidDate).toBe('2026-06-10');
    expect(final.remittedDate).toBe('2026-07-31');
  });

  it('rejects pay() on a declaration still in draft (wrong prior status)', async () => {
    const { executor } = makeHarness(makeDeclaration({ status: 'draft' }));
    await expect(
      executor.payDividend({ dividendDeclarationId: 'divd_1', date: '2026-06-10', memo: 'x', source: 'dividend_payment', lines: payLines }),
    ).rejects.toThrow(/expected "declared"/);
  });

  it('rejects declare() on an already-declared declaration (idempotency guard on the SAME transition, not a status re-check bypass)', async () => {
    const { executor } = makeHarness(makeDeclaration({ status: 'declared', declarationJournalEntryId: 'je_prior' }));
    // No prior log entry exists for THIS fresh executor instance, so this exercises the live status check, not the log short-circuit.
    await expect(
      executor.declareDividend({ dividendDeclarationId: 'divd_1', date: '2026-06-01', memo: 'x', source: 'dividend_declaration', lines: declareLines }),
    ).rejects.toThrow(/expected "draft"/);
  });

  it('a fully-exempt remit() (empty lines) still advances status with no journal entry', async () => {
    const { declarations, executor, journalPostCount } = makeHarness(makeDeclaration({ status: 'paid', dividendsTaxWithheld: 0 }));

    const result = await executor.remitDividendToSars({
      dividendDeclarationId: 'divd_1',
      date: '2026-07-31',
      memo: 'remit',
      source: 'dividend_tax_remittance',
      lines: [],
    });

    expect(result.declaration.status).toBe('remitted');
    expect(result.journalEntryId).toBeUndefined();
    expect(journalPostCount()).toBe(0);
    expect(declarations.get('divd_1')!.remittedDate).toBe('2026-07-31');
  });
});
