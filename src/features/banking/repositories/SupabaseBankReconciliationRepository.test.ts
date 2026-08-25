import { describe, it, expect, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseBankReconciliationRepository } from './SupabaseBankReconciliationRepository';
import type { BankReconciliation } from '../types';

/**
 * No SupabaseXxxRepository has a committed test file anywhere in this
 * codebase yet (docs/SUPABASE_MIGRATION_GUIDE.md's "Testing note": every
 * prior phase's live-database proof was run ad hoc through the Supabase MCP
 * tools during the session, then cleaned up — never persisted as a vitest
 * file, since `npm test` is meant to stay network-independent). This file
 * establishes that convention rather than following one: a minimal in-memory
 * fake mimicking the exact `supabase-js` query-builder chains
 * SupabaseBankReconciliationRepository actually calls
 * (`.from().select()/.insert().eq().order().limit().single()/.maybeSingle()`),
 * backed by a plain object of arrays kept OUTSIDE any repository instance —
 * so two separately-`new`'d repository instances sharing one fake client see
 * the same data, exactly like two real repository instances sharing one
 * live Postgres table would. This exercises the repository's real
 * query-shaping and row-mapping code (the actual risk surface — column-name
 * typos, wrong operators, wrong array handling) without a network
 * dependency.
 */
interface FakeRow {
  [key: string]: unknown;
}

class FakeQueryBuilder {
  private op: 'select' | 'insert' = 'select';
  private insertPayload?: Record<string, unknown>;
  private filters: Array<[string, unknown]> = [];
  private orderCol?: string;
  private orderAsc = true;
  private limitN?: number;
  private wantSingle = false;
  private wantMaybeSingle = false;

  constructor(
    private readonly table: string,
    private readonly store: Record<string, FakeRow[]>,
  ) {}

  select(_columns?: string): this {
    return this;
  }

  insert(payload: Record<string, unknown>): this {
    this.op = 'insert';
    this.insertPayload = payload;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderCol = column;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  maybeSingle(): this {
    this.wantMaybeSingle = true;
    return this;
  }

  single(): this {
    this.wantSingle = true;
    return this;
  }

  private isMalformedUuid(value: unknown): boolean {
    return typeof value === 'string' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  // Produces a real-uuid-SHAPED id (not a genuine v4, just format-valid) so
  // getById()'s isInvalidUuidError() simulation above doesn't reject an id
  // this same fake just generated.
  private fakeUuid(): string {
    const hex = () => Math.floor(Math.random() * 16).toString(16);
    const group = (n: number) => Array.from({ length: n }, hex).join('');
    return `${group(8)}-${group(4)}-${group(4)}-${group(4)}-${group(12)}`;
  }

  private execute(): { data: unknown; error: { code?: string; message: string } | null } {
    if (this.op === 'insert') {
      const now = new Date().toISOString();
      const row: FakeRow = {
        id: this.fakeUuid(),
        created_at: now,
        updated_at: now,
        ...this.insertPayload,
      };
      this.store[this.table] = this.store[this.table] ?? [];
      this.store[this.table].push(row);
      return { data: this.wantSingle ? row : [row], error: null };
    }

    for (const [, value] of this.filters) {
      if (this.isMalformedUuid(value)) {
        return { data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' } };
      }
    }

    let rows = [...(this.store[this.table] ?? [])];
    for (const [column, value] of this.filters) {
      rows = rows.filter((r) => r[column] === value);
    }
    if (this.orderCol) {
      const col = this.orderCol;
      rows.sort((a, b) => {
        const av = String(a[col]);
        const bv = String(b[col]);
        return (av < bv ? -1 : av > bv ? 1 : 0) * (this.orderAsc ? 1 : -1);
      });
    }
    if (this.limitN !== undefined) rows = rows.slice(0, this.limitN);

    if (this.wantSingle) {
      if (rows.length !== 1) return { data: null, error: { message: 'no rows / not exactly one row' } };
      return { data: rows[0], error: null };
    }
    if (this.wantMaybeSingle) {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  // supabase-js query builders are themselves thenable -- `await` without an
  // explicit terminal call (getAll()'s case) resolves the query directly.
  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

function makeFakeClient(store: Record<string, FakeRow[]>): SupabaseClient {
  return {
    from(table: string) {
      return new FakeQueryBuilder(table, store);
    },
  } as unknown as SupabaseClient;
}

const COMPANY_ID = '11111111-1111-1111-1111-111111111111';
const BANK_ACCOUNT_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_BANK_ACCOUNT_ID = '33333333-3333-3333-3333-333333333333';

function makeReconciliation(overrides: Partial<BankReconciliation> = {}): BankReconciliation {
  return {
    id: '',
    createdAt: '',
    updatedAt: '',
    bankAccountId: BANK_ACCOUNT_ID,
    statementDate: '2026-03-31T00:00:00.000Z',
    statementBalance: 1500,
    glCashbookBalance: 1500,
    adjustedBankBalance: 1500,
    variance: 0,
    clearedTransactionIds: ['txn-1', 'txn-2'],
    unpresentedTransactionIds: ['txn-3'],
    unclearedDepositIds: ['txn-4'],
    finalizedAt: '2026-04-01T00:00:00.000Z',
    finalizedByUserId: 'system',
    notes: 'Month-end reconciliation',
    ...overrides,
  };
}

describe('SupabaseBankReconciliationRepository', () => {
  let store: Record<string, FakeRow[]>;

  beforeEach(() => {
    store = {
      companies: [{ id: COMPANY_ID, created_at: '2026-01-01T00:00:00.000Z' }],
      reconciliations: [],
    };
  });

  it('creates a finalized reconciliation, resolving company_id internally', async () => {
    const repo = new SupabaseBankReconciliationRepository(makeFakeClient(store));
    const record = await repo.create(makeReconciliation());

    expect(record.id).toBeTruthy();
    expect(record.bankAccountId).toBe(BANK_ACCOUNT_ID);
    expect(record.variance).toBe(0);
    expect(store.reconciliations).toHaveLength(1);
    expect(store.reconciliations[0].company_id).toBe(COMPANY_ID);
  });

  it('data mapping preserves every BankReconciliation field through a create -> getById round trip', async () => {
    const repo = new SupabaseBankReconciliationRepository(makeFakeClient(store));
    const input = makeReconciliation({
      statementBalance: 2345.67,
      glCashbookBalance: 2345.67,
      adjustedBankBalance: 2345.67,
      variance: 0,
      clearedTransactionIds: ['t1', 't2', 't3'],
      unpresentedTransactionIds: ['t4'],
      unclearedDepositIds: ['t5', 't6'],
      notes: 'Reconciled against March bank statement',
    });
    const created = await repo.create(input);
    const fetched = await repo.getById(created.id);

    expect(fetched).toBeDefined();
    expect(fetched?.bankAccountId).toBe(input.bankAccountId);
    expect(fetched?.statementDate).toBe(input.statementDate);
    expect(fetched?.statementBalance).toBe(2345.67);
    expect(fetched?.glCashbookBalance).toBe(2345.67);
    expect(fetched?.adjustedBankBalance).toBe(2345.67);
    expect(fetched?.variance).toBe(0);
    expect(fetched?.clearedTransactionIds).toEqual(['t1', 't2', 't3']);
    expect(fetched?.unpresentedTransactionIds).toEqual(['t4']);
    expect(fetched?.unclearedDepositIds).toEqual(['t5', 't6']);
    expect(fetched?.finalizedAt).toBe(input.finalizedAt);
    expect(fetched?.finalizedByUserId).toBe('system');
    expect(fetched?.notes).toBe('Reconciled against March bank statement');
    expect(fetched?.createdAt).toBeTruthy();
    expect(fetched?.updatedAt).toBeTruthy();
  });

  it('retrieves undefined for a malformed id, matching every Mock repository getById() contract', async () => {
    const repo = new SupabaseBankReconciliationRepository(makeFakeClient(store));
    await expect(repo.getById('not-a-real-uuid')).resolves.toBeUndefined();
  });

  it('retrieves all reconciliations across every account', async () => {
    const repo = new SupabaseBankReconciliationRepository(makeFakeClient(store));
    await repo.create(makeReconciliation({ bankAccountId: BANK_ACCOUNT_ID, finalizedAt: '2026-01-01T00:00:00.000Z' }));
    await repo.create(makeReconciliation({ bankAccountId: OTHER_BANK_ACCOUNT_ID, finalizedAt: '2026-02-01T00:00:00.000Z' }));

    const all = await repo.getAll();
    expect(all).toHaveLength(2);
  });

  it('retrieves only the reconciliations for one bank account', async () => {
    const repo = new SupabaseBankReconciliationRepository(makeFakeClient(store));
    await repo.create(makeReconciliation({ bankAccountId: BANK_ACCOUNT_ID }));
    await repo.create(makeReconciliation({ bankAccountId: OTHER_BANK_ACCOUNT_ID }));
    await repo.create(makeReconciliation({ bankAccountId: BANK_ACCOUNT_ID }));

    const forAccount = await repo.getByAccount(BANK_ACCOUNT_ID);
    expect(forAccount).toHaveLength(2);
    expect(forAccount.every((r) => r.bankAccountId === BANK_ACCOUNT_ID)).toBe(true);
  });

  it('persists across repository re-instantiation (a second instance sees data the first one wrote)', async () => {
    const client = makeFakeClient(store);
    const firstInstance = new SupabaseBankReconciliationRepository(client);
    const created = await firstInstance.create(makeReconciliation());

    const secondInstance = new SupabaseBankReconciliationRepository(client);
    const fetched = await secondInstance.getById(created.id);
    const all = await secondInstance.getAll();

    expect(fetched?.id).toBe(created.id);
    expect(all).toHaveLength(1);
  });

  it('append-only: exposes no update() or delete() method at all', () => {
    const repo = new SupabaseBankReconciliationRepository(makeFakeClient(store));
    expect((repo as unknown as { update?: unknown }).update).toBeUndefined();
    expect((repo as unknown as { delete?: unknown }).delete).toBeUndefined();
  });
});
