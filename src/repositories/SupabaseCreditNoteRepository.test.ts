import { describe, it, expect, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseCreditNoteRepository } from './SupabaseCreditNoteRepository';
import type { CreditNote } from '@/types';

/**
 * Round-trip coverage for the `credit_notes.reason_details` column
 * (migration 0043). Same in-memory-fake approach as
 * `SupabaseBankReconciliationRepository.test.ts` — a plain object of arrays
 * kept outside the repository instance, exercising the repository's real
 * row-mapping (`rowToCreditNote` / `creditNoteToRow`) without a network
 * dependency. The risk this guards: `reasonDetails` silently not persisting,
 * or being coerced to `''` instead of `null` for the non-'other' reasons.
 */
interface FakeRow {
  [key: string]: unknown;
}

class FakeQueryBuilder {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload?: Record<string, unknown>;
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
    this.payload = payload;
    return this;
  }

  update(payload: Record<string, unknown>): this {
    this.op = 'update';
    this.payload = payload;
    return this;
  }

  delete(): this {
    this.op = 'delete';
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

  private fakeUuid(): string {
    const hex = () => Math.floor(Math.random() * 16).toString(16);
    const group = (n: number) => Array.from({ length: n }, hex).join('');
    return `${group(8)}-${group(4)}-${group(4)}-${group(4)}-${group(12)}`;
  }

  private execute(): { data: unknown; error: { code?: string; message: string } | null } {
    this.store[this.table] = this.store[this.table] ?? [];

    if (this.op === 'insert') {
      const now = new Date().toISOString();
      const row: FakeRow = { id: this.fakeUuid(), created_at: now, updated_at: now, ...this.payload };
      this.store[this.table].push(row);
      return { data: this.wantSingle ? row : [row], error: null };
    }

    for (const [, value] of this.filters) {
      if (this.isMalformedUuid(value)) {
        return { data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' } };
      }
    }

    const match = (r: FakeRow) => this.filters.every(([column, value]) => r[column] === value);

    if (this.op === 'update') {
      const rows = this.store[this.table].filter(match);
      for (const r of rows) Object.assign(r, this.payload, { updated_at: new Date().toISOString() });
      if (this.wantMaybeSingle || this.wantSingle) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    if (this.op === 'delete') {
      this.store[this.table] = this.store[this.table].filter((r) => !match(r));
      return { data: null, error: null };
    }

    let rows = this.store[this.table].filter(match);
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
  return {
    from(table: string) {
      return new FakeQueryBuilder(table, store);
    },
  } as unknown as SupabaseClient;
}

const COMPANY_ID = '11111111-1111-1111-1111-111111111111';

function makeCreditNote(overrides: Partial<CreditNote> = {}): CreditNote {
  return {
    id: '',
    createdAt: '',
    updatedAt: '',
    creditNoteNumber: 'CN-9001',
    customerId: '22222222-2222-2222-2222-222222222222',
    issueDate: '2026-09-10',
    reason: 'return',
    lineItems: [],
    subtotal: 100,
    taxTotal: 15,
    total: 115,
    amountAllocated: 0,
    currency: 'ZAR',
    status: 'draft',
    allocations: [],
    ...overrides,
  };
}

describe('SupabaseCreditNoteRepository — reason_details (migration 0043)', () => {
  let store: Record<string, FakeRow[]>;

  beforeEach(() => {
    store = {
      companies: [{ id: COMPANY_ID, created_at: '2026-01-01T00:00:00.000Z' }],
      credit_notes: [],
    };
  });

  it('persists reasonDetails through a create -> getById round trip when reason is "other"', async () => {
    const repo = new SupabaseCreditNoteRepository(makeFakeClient(store));
    const created = await repo.create(
      makeCreditNote({ reason: 'other', reasonDetails: 'Goodwill gesture after a delivery delay' }),
    );

    expect(store.credit_notes[0].reason_details).toBe('Goodwill gesture after a delivery delay');

    const fetched = await repo.getById(created.id);
    expect(fetched?.reason).toBe('other');
    expect(fetched?.reasonDetails).toBe('Goodwill gesture after a delivery delay');
  });

  it('stores reason_details as NULL (and maps back to undefined) when no detail is given', async () => {
    const repo = new SupabaseCreditNoteRepository(makeFakeClient(store));
    const created = await repo.create(makeCreditNote({ reason: 'return' }));

    expect(store.credit_notes[0].reason_details ?? null).toBeNull();

    const fetched = await repo.getById(created.id);
    expect(fetched?.reasonDetails).toBeUndefined();
  });

  it('leaves reason_details untouched when the update patch omits it (undefined = no change)', async () => {
    const repo = new SupabaseCreditNoteRepository(makeFakeClient(store));
    const created = await repo.create(makeCreditNote({ reason: 'other', reasonDetails: 'wrong price quoted' }));

    const updated = await repo.update(created.id, { status: 'issued' });

    expect(updated.status).toBe('issued');
    expect(updated.reasonDetails).toBe('wrong price quoted');
  });

  it('clears reason_details to NULL when the caller passes an empty/falsey detail', async () => {
    const repo = new SupabaseCreditNoteRepository(makeFakeClient(store));
    const created = await repo.create(makeCreditNote({ reason: 'other', reasonDetails: 'temp' }));

    await repo.update(created.id, { reasonDetails: '' as unknown as string });
    const row = store.credit_notes.find((r) => r.id === created.id)!;
    expect(row.reason_details).toBeNull();
  });

  it('notes stays independent of reasonDetails', async () => {
    const repo = new SupabaseCreditNoteRepository(makeFakeClient(store));
    const created = await repo.create(
      makeCreditNote({ reason: 'other', reasonDetails: 'ex gratia', notes: 'Approved by finance manager' }),
    );

    const fetched = await repo.getById(created.id);
    expect(fetched?.reasonDetails).toBe('ex gratia');
    expect(fetched?.notes).toBe('Approved by finance manager');
  });
});
