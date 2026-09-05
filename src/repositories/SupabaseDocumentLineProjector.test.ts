import { afterEach, describe, it, expect, vi } from 'vitest';
import type { DocumentLineItem } from '@/types';

function line(overrides: Partial<DocumentLineItem> = {}): DocumentLineItem {
  return {
    id: 'line_1',
    description: 'Widget',
    quantity: 2,
    unitPrice: 100,
    taxAmount: 30,
    lineTotal: 200,
    ...overrides,
  };
}

describe('SupabaseDocumentLineProjector — disabled', () => {
  it('never touches the Supabase client while NORMALIZED_DOCUMENT_LINES_ENABLED is false', async () => {
    vi.resetModules();
    vi.doMock('@/config/featureFlags', () => ({ NORMALIZED_DOCUMENT_LINES_ENABLED: false }));
    const { SupabaseDocumentLineProjector } = await import('./SupabaseDocumentLineProjector');
    const client = {
      from: vi.fn(() => {
        throw new Error('client.from() must not be called while the feature flag is disabled');
      }),
    };
    const projector = new SupabaseDocumentLineProjector(client as never, {
      projectorName: 'test',
      lineTable: 'invoice_lines',
      foreignKeyColumn: 'invoice_id',
    });

    await expect(projector.sync('doc_1', [line()])).resolves.toBeUndefined();
    expect(client.from).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.doUnmock('@/config/featureFlags');
    vi.resetModules();
  });
});

describe('SupabaseDocumentLineProjector — enabled', () => {
  it('deletes prior lines for the document then inserts the current line set, mapped to the normalized columns', async () => {
    vi.resetModules();
    vi.doMock('@/config/featureFlags', () => ({ NORMALIZED_DOCUMENT_LINES_ENABLED: true }));

    const calls: { method: string; args: unknown[] }[] = [];
    const deleteChain = {
      eq: vi.fn((...args: unknown[]) => {
        calls.push({ method: 'delete.eq', args });
        return Promise.resolve({ error: null });
      }),
    };
    const insert = vi.fn((rows: unknown[]) => {
      calls.push({ method: 'insert', args: [rows] });
      return Promise.resolve({ error: null });
    });
    const client = {
      from: vi.fn((table: string) => {
        calls.push({ method: 'from', args: [table] });
        return {
          delete: () => deleteChain,
          insert,
          select: () => ({
            order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'company_1' }, error: null }) }) }),
          }),
        };
      }),
    };

    const { SupabaseDocumentLineProjector } = await import('./SupabaseDocumentLineProjector');
    const projector = new SupabaseDocumentLineProjector(client as never, {
      projectorName: 'test',
      lineTable: 'invoice_lines',
      foreignKeyColumn: 'invoice_id',
    });

    await projector.sync('doc_1', [line({ id: 'li_1', productId: 'prod_1' }), line({ id: 'li_2' })]);

    expect(deleteChain.eq).toHaveBeenCalledWith('invoice_id', 'doc_1');
    expect(insert).toHaveBeenCalledTimes(1);
    const rows = insert.mock.calls[0][0] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'li_1',
      company_id: 'company_1',
      invoice_id: 'doc_1',
      line_number: 1,
      product_id: 'prod_1',
      description: 'Widget',
      quantity: 2,
      unit_price: 100,
      tax_amount: 30,
      line_total: 200,
    });
    expect(rows[1]).toMatchObject({ id: 'li_2', line_number: 2, product_id: null });

    vi.doUnmock('@/config/featureFlags');
    vi.resetModules();
  });

  it('skips the insert (but still clears prior lines) when synced with an empty line set', async () => {
    vi.resetModules();
    vi.doMock('@/config/featureFlags', () => ({ NORMALIZED_DOCUMENT_LINES_ENABLED: true }));

    const insert = vi.fn();
    const client = {
      from: vi.fn(() => ({
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        insert,
        select: () => ({
          order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'company_1' }, error: null }) }) }),
        }),
      })),
    };

    const { SupabaseDocumentLineProjector } = await import('./SupabaseDocumentLineProjector');
    const projector = new SupabaseDocumentLineProjector(client as never, {
      projectorName: 'test',
      lineTable: 'invoice_lines',
      foreignKeyColumn: 'invoice_id',
    });

    await projector.sync('doc_1', []);
    expect(insert).not.toHaveBeenCalled();

    vi.doUnmock('@/config/featureFlags');
    vi.resetModules();
  });
});

describe('isProjectableLineQuantity', () => {
  it('accepts only a strictly positive finite quantity (matching migration 0042 / the check constraint)', async () => {
    const { isProjectableLineQuantity } = await import('./SupabaseDocumentLineProjector');
    expect(isProjectableLineQuantity(2)).toBe(true);
    expect(isProjectableLineQuantity(0.001)).toBe(true);
    expect(isProjectableLineQuantity('3')).toBe(true); // legacy jsonb numeric string, like ::numeric > 0
    expect(isProjectableLineQuantity(0)).toBe(false);
    expect(isProjectableLineQuantity(-1)).toBe(false);
    expect(isProjectableLineQuantity(Number.NaN)).toBe(false);
    expect(isProjectableLineQuantity(null)).toBe(false);
    expect(isProjectableLineQuantity(undefined)).toBe(false);
    expect(isProjectableLineQuantity('')).toBe(false);
  });
});

describe('SupabaseDocumentLineProjector — non-positive quantity handling', () => {
  function enabledClient() {
    const inserted: Record<string, unknown>[][] = [];
    const deleted: unknown[][] = [];
    const client = {
      from: vi.fn((table: string) => ({
        delete: () => ({
          eq: (...args: unknown[]) => {
            deleted.push([table, ...args]);
            return Promise.resolve({ error: null });
          },
        }),
        insert: vi.fn((rows: Record<string, unknown>[]) => {
          inserted.push(rows);
          return Promise.resolve({ error: null });
        }),
        select: () => ({
          order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'company_1' }, error: null }) }) }),
        }),
      })),
    };
    return { client, inserted, deleted };
  }

  async function makeProjector(client: unknown) {
    vi.resetModules();
    vi.doMock('@/config/featureFlags', () => ({ NORMALIZED_DOCUMENT_LINES_ENABLED: true }));
    const { SupabaseDocumentLineProjector } = await import('./SupabaseDocumentLineProjector');
    return new SupabaseDocumentLineProjector(client as never, {
      projectorName: 'test',
      lineTable: 'invoice_lines',
      foreignKeyColumn: 'invoice_id',
    });
  }

  afterEach(() => {
    vi.doUnmock('@/config/featureFlags');
    vi.resetModules();
  });

  it('projects a positive-quantity line', async () => {
    const { client, inserted } = enabledClient();
    const projector = await makeProjector(client);
    await projector.sync('doc_1', [line({ id: 'li_1', quantity: 5 })]);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toEqual([expect.objectContaining({ id: 'li_1', line_number: 1, quantity: 5 })]);
  });

  it('skips a zero-quantity line entirely (clears prior rows, no insert)', async () => {
    const { client, inserted, deleted } = enabledClient();
    const projector = await makeProjector(client);
    await projector.sync('doc_1', [line({ id: 'li_zero', quantity: 0 })]);
    expect(deleted).toEqual([['invoice_lines', 'invoice_id', 'doc_1']]);
    expect(inserted).toEqual([]);
  });

  it('skips a negative-quantity line entirely', async () => {
    const { client, inserted } = enabledClient();
    const projector = await makeProjector(client);
    await projector.sync('doc_1', [line({ id: 'li_neg', quantity: -3 })]);
    expect(inserted).toEqual([]);
  });

  it('projects only the valid lines of a mixed set, preserving each line\'s original 1-based position', async () => {
    const { client, inserted } = enabledClient();
    const projector = await makeProjector(client);
    await projector.sync('doc_1', [
      line({ id: 'li_1', quantity: 4 }),   // position 1 — kept
      line({ id: 'li_2', quantity: 0 }),   // position 2 — skipped
      line({ id: 'li_3', quantity: 2 }),   // position 3 — kept, line_number stays 3
    ]);
    expect(inserted).toHaveLength(1);
    const rows = inserted[0];
    expect(rows.map((r) => [r.id, r.line_number])).toEqual([
      ['li_1', 1],
      ['li_3', 3],
    ]);
  });

  it('does not weaken the projection\'s non-authoritative contract: an insert failure still surfaces to the caller (which swallows it)', async () => {
    vi.resetModules();
    vi.doMock('@/config/featureFlags', () => ({ NORMALIZED_DOCUMENT_LINES_ENABLED: true }));
    const client = {
      from: vi.fn(() => ({
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        insert: () => Promise.resolve({ error: { message: 'quantity check violation' } }),
        select: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'company_1' }, error: null }) }) }) }),
      })),
    };
    const { SupabaseDocumentLineProjector } = await import('./SupabaseDocumentLineProjector');
    const projector = new SupabaseDocumentLineProjector(client as never, { projectorName: 't', lineTable: 'invoice_lines', foreignKeyColumn: 'invoice_id' });
    await expect(projector.sync('doc_1', [line({ id: 'li_1', quantity: 2 })])).rejects.toThrow(/quantity check violation/);
    vi.doUnmock('@/config/featureFlags');
    vi.resetModules();
  });

  it('never touches the source jsonb table — only the configured line table', async () => {
    const { client } = enabledClient();
    const projector = await makeProjector(client);
    await projector.sync('doc_1', [line({ id: 'li_1', quantity: 1 }), line({ id: 'li_2', quantity: 0 })]);
    const tablesTouched = new Set((client.from as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]));
    // 'companies' is the company-id resolution read; the projection write only ever hits the line table.
    expect(tablesTouched).toEqual(new Set(['companies', 'invoice_lines']));
    expect(tablesTouched.has('invoices')).toBe(false);
  });
});
