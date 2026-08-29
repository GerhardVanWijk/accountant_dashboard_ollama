import { describe, it, expect, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseBankStatementRepository } from './SupabaseBankStatementRepository';
import { SupabaseBankStatementLineRepository } from './SupabaseBankStatementLineRepository';
import type { BankStatement, BankStatementLine } from '@/types';

/**
 * Same approach as SupabaseBankReconciliationRepository.test.ts: an in-memory
 * fake mimicking the exact supabase-js query-builder chains these two
 * repositories call — exercises the real row-mapping / query-shaping code
 * (column-name typos, wrong operators, array handling) with no network.
 */
interface FakeRow {
  [key: string]: unknown;
}

class FakeQueryBuilder {
  private op: 'select' | 'insert' | 'update' = 'select';
  private payload?: Record<string, unknown> | Record<string, unknown>[];
  private filters: Array<[string, 'eq' | 'gte' | 'lte', unknown]> = [];
  private orderCol?: string;
  private orderAsc = true;
  private limitN?: number;
  private wantSingle = false;
  private wantMaybeSingle = false;

  constructor(
    private readonly table: string,
    private readonly store: Record<string, FakeRow[]>,
  ) {}

  select(): this {
    return this;
  }
  insert(payload: Record<string, unknown> | Record<string, unknown>[]): this {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: Record<string, unknown>): this {
    this.op = 'update';
    this.payload = payload;
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push([column, 'eq', value]);
    return this;
  }
  gte(column: string, value: unknown): this {
    this.filters.push([column, 'gte', value]);
    return this;
  }
  lte(column: string, value: unknown): this {
    this.filters.push([column, 'lte', value]);
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
    return typeof value === 'string' && value.length > 0 && !/^[0-9a-f-]{16,}$/i.test(value) && value.includes('not-a');
  }

  private fakeUuid(): string {
    const hex = () => Math.floor(Math.random() * 16).toString(16);
    const group = (n: number) => Array.from({ length: n }, hex).join('');
    return `${group(8)}-${group(4)}-${group(4)}-${group(4)}-${group(12)}`;
  }

  private matches(row: FakeRow): boolean {
    return this.filters.every(([col, kind, value]) => {
      const cell = row[col];
      if (kind === 'eq') return cell === value;
      if (kind === 'gte') return String(cell) >= String(value);
      return String(cell) <= String(value);
    });
  }

  private execute(): { data: unknown; error: { code?: string; message: string } | null } {
    const now = new Date().toISOString();
    this.store[this.table] = this.store[this.table] ?? [];

    if (this.op === 'insert') {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((p) => ({
        id: this.fakeUuid(),
        created_at: now,
        updated_at: now,
        ...p,
      }));
      this.store[this.table].push(...rows);
      if (this.wantSingle) return { data: rows[0], error: null };
      return { data: rows, error: null };
    }

    if (this.op === 'update') {
      const updated: FakeRow[] = [];
      this.store[this.table] = this.store[this.table].map((row) => {
        if (this.matches(row)) {
          const next = { ...row, ...this.payload, updated_at: now };
          updated.push(next);
          return next;
        }
        return row;
      });
      if (this.wantMaybeSingle) return { data: updated[0] ?? null, error: null };
      return { data: updated, error: null };
    }

    for (const [, , value] of this.filters) {
      if (this.isMalformedUuid(value)) {
        return { data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' } };
      }
    }

    let rows = this.store[this.table].filter((r) => this.matches(r));
    if (this.orderCol) {
      const col = this.orderCol;
      rows = [...rows].sort((a, b) => {
        const av = String(a[col]);
        const bv = String(b[col]);
        return (av < bv ? -1 : av > bv ? 1 : 0) * (this.orderAsc ? 1 : -1);
      });
    }
    if (this.limitN !== undefined) rows = rows.slice(0, this.limitN);

    if (this.wantSingle) {
      if (rows.length !== 1) return { data: null, error: { message: 'not exactly one row' } };
      return { data: rows[0], error: null };
    }
    if (this.wantMaybeSingle) return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

function makeFakeClient(store: Record<string, FakeRow[]>): SupabaseClient {
  return { from: (table: string) => new FakeQueryBuilder(table, store) } as unknown as SupabaseClient;
}

const COMPANY_ID = '11111111-1111-1111-1111-111111111111';
const BANK_ACCOUNT_ID = '22222222-2222-2222-2222-222222222222';

function makeStatement(overrides: Partial<BankStatement> = {}): BankStatement {
  return {
    id: '',
    createdAt: '',
    updatedAt: '',
    bankAccountId: BANK_ACCOUNT_ID,
    sourceFilename: 'aug.mt940',
    sourceFormat: 'mt940',
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-08-31T00:00:00.000Z',
    openingBalance: 350000,
    closingBalance: 184068.54,
    currency: 'ZAR',
    lineCount: 0,
    importStatus: 'imported',
    reconciliationStatus: 'not_started',
    contentHash: 'abc123',
    balanceCheckOk: true,
    ...overrides,
  };
}

function makeLine(overrides: Partial<BankStatementLine> = {}): BankStatementLine {
  return {
    id: '',
    createdAt: '',
    updatedAt: '',
    bankStatementId: 'stmt',
    bankAccountId: BANK_ACCOUNT_ID,
    sequence: 1,
    txnDate: '2026-08-05T00:00:00.000Z',
    description: 'Line',
    amount: 100,
    direction: 'debit',
    rawSource: { k: 'v' },
    lineState: 'unmatched',
    ...overrides,
  };
}

describe('SupabaseBankStatementRepository', () => {
  let store: Record<string, FakeRow[]>;
  beforeEach(() => {
    store = { companies: [{ id: COMPANY_ID, created_at: '2026-01-01T00:00:00.000Z' }], bank_statements: [] };
  });

  it('create resolves company_id internally and round-trips every field', async () => {
    const repo = new SupabaseBankStatementRepository(makeFakeClient(store));
    const created = await repo.create(makeStatement({ closingBalance: 184068.54, balanceCheckOk: true }));
    expect(created.id).toBeTruthy();
    expect(store.bank_statements[0].company_id).toBe(COMPANY_ID);
    const fetched = await repo.getById(created.id);
    expect(fetched?.openingBalance).toBe(350000);
    expect(fetched?.closingBalance).toBe(184068.54);
    expect(fetched?.balanceCheckOk).toBe(true);
    expect(fetched?.sourceFormat).toBe('mt940');
    expect(fetched?.importStatus).toBe('imported');
  });

  it('findByContentHash matches on account + hash', async () => {
    const repo = new SupabaseBankStatementRepository(makeFakeClient(store));
    await repo.create(makeStatement({ contentHash: 'hash-xyz' }));
    expect(await repo.findByContentHash(BANK_ACCOUNT_ID, 'hash-xyz')).toBeDefined();
    expect(await repo.findByContentHash(BANK_ACCOUNT_ID, 'nope')).toBeUndefined();
  });

  it('update mutates the lifecycle fields', async () => {
    const repo = new SupabaseBankStatementRepository(makeFakeClient(store));
    const created = await repo.create(makeStatement());
    const updated = await repo.update(created.id, { lineCount: 87, reconciliationStatus: 'in_progress' });
    expect(updated.lineCount).toBe(87);
    expect(updated.reconciliationStatus).toBe('in_progress');
  });

  it('getById returns undefined for a malformed uuid', async () => {
    const repo = new SupabaseBankStatementRepository(makeFakeClient(store));
    await expect(repo.getById('not-a-real-uuid')).resolves.toBeUndefined();
  });
});

describe('SupabaseBankStatementLineRepository', () => {
  let store: Record<string, FakeRow[]>;
  beforeEach(() => {
    store = { companies: [{ id: COMPANY_ID, created_at: '2026-01-01T00:00:00.000Z' }], bank_statement_lines: [] };
  });

  it('createMany stamps company_id on every row and maps back', async () => {
    const repo = new SupabaseBankStatementLineRepository(makeFakeClient(store));
    const created = await repo.createMany([
      makeLine({ sequence: 1, lineState: 'matched', matchedBankTransactionId: '33333333-3333-3333-3333-333333333333' }),
      makeLine({ sequence: 2 }),
    ]);
    expect(created).toHaveLength(2);
    expect(store.bank_statement_lines.every((r) => r.company_id === COMPANY_ID)).toBe(true);
    expect(created[0].lineState).toBe('matched');
    expect(created[0].matchedBankTransactionId).toBe('33333333-3333-3333-3333-333333333333');
    expect(created[0].rawSource).toEqual({ k: 'v' });
  });

  it('createMany([]) short-circuits without a query', async () => {
    const repo = new SupabaseBankStatementLineRepository(makeFakeClient(store));
    expect(await repo.createMany([])).toEqual([]);
  });

  it('getByAccountInWindow filters by txn_date range', async () => {
    const repo = new SupabaseBankStatementLineRepository(makeFakeClient(store));
    await repo.createMany([
      makeLine({ txnDate: '2026-07-31T00:00:00.000Z' }),
      makeLine({ txnDate: '2026-08-15T00:00:00.000Z' }),
      makeLine({ txnDate: '2026-09-02T00:00:00.000Z' }),
    ]);
    const window = await repo.getByAccountInWindow(BANK_ACCOUNT_ID, '2026-08-01T00:00:00.000Z', '2026-08-31T23:59:59.999Z');
    expect(window).toHaveLength(1);
    expect(window[0].txnDate).toBe('2026-08-15T00:00:00.000Z');
  });

  it('update patches the matching fields', async () => {
    const repo = new SupabaseBankStatementLineRepository(makeFakeClient(store));
    const [line] = await repo.createMany([makeLine()]);
    const updated = await repo.update(line.id, { lineState: 'matched', matchedBankTransactionId: '44444444-4444-4444-4444-444444444444' });
    expect(updated.lineState).toBe('matched');
    expect(updated.matchedBankTransactionId).toBe('44444444-4444-4444-4444-444444444444');
  });
});
