import { describe, it, expect, vi } from 'vitest';
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

describe('SupabaseDocumentLineProjector — disabled (default)', () => {
  it('never touches the Supabase client while NORMALIZED_DOCUMENT_LINES_ENABLED is false', async () => {
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
