import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DocumentLineParityChecker } from './DocumentLineParityChecker';

/**
 * A minimal read-only Supabase fake: `.from(table).select(cols).range(a, b)`
 * resolves to `{ data, error }`. Any other builder method (`insert`,
 * `update`, `delete`, `rpc`, …) throws — the checker must never call one.
 */
function fakeClient(tables: Record<string, Record<string, unknown>[]>) {
  const selectCalls: { table: string; columns: string }[] = [];
  const forbidden = (name: string) => () => {
    throw new Error(`DocumentLineParityChecker must be read-only — called ${name}()`);
  };
  const client = {
    from: vi.fn((table: string) => ({
      select: vi.fn((columns: string) => {
        selectCalls.push({ table, columns });
        return {
          range: (from: number, to: number) =>
            Promise.resolve({ data: (tables[table] ?? []).slice(from, to + 1), error: null }),
        };
      }),
      insert: forbidden('insert'),
      update: forbidden('update'),
      upsert: forbidden('upsert'),
      delete: forbidden('delete'),
    })),
    rpc: forbidden('rpc'),
  };
  return { client: client as unknown as SupabaseClient, selectCalls, raw: client };
}

function jline(overrides: Record<string, unknown> = {}) {
  return {
    id: 'li_1',
    productId: 'prod_1',
    description: 'Widget',
    quantity: 2,
    unitPrice: 100,
    taxRateId: 'tax_1',
    taxAmount: 30,
    lineTotal: 200,
    ...overrides,
  };
}

function nrow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'li_1',
    company_id: 'co_1',
    invoice_id: 'inv_1',
    line_number: 1,
    product_id: 'prod_1',
    warehouse_id: null,
    description: 'Widget',
    quantity: 2,
    unit_price: 100,
    tax_rate_id: 'tax_1',
    tax_amount: 30,
    line_total: 200,
    ...overrides,
  };
}

describe('DocumentLineParityChecker', () => {
  it('reports MATCH for a document whose jsonb lines and normalized rows agree', async () => {
    const { client } = fakeClient({
      invoices: [{ id: 'inv_1', company_id: 'co_1', line_items: [jline({ id: 'li_1' }), jline({ id: 'li_2', productId: null })] }],
      invoice_lines: [nrow({ id: 'li_1' }), nrow({ id: 'li_2', line_number: 2, product_id: null })],
      bills: [],
      bill_lines: [],
      purchase_orders: [],
      purchase_order_lines: [],
      credit_notes: [],
      credit_note_lines: [],
    });

    const report = await new DocumentLineParityChecker(client).checkType('invoice');

    expect(report.findings).toEqual([]);
    expect(report.matchedLineCount).toBe(2);
    expect(report.jsonbLineCount).toBe(2);
    expect(report.normalizedLineCount).toBe(2);
    expect(report.documentCount).toBe(1);
    expect(report.ok).toBe(true);
  });

  it('tolerates numeric representation differences (200 vs "200.00", trailing precision)', async () => {
    const { client } = fakeClient({
      invoices: [{ id: 'inv_1', company_id: 'co_1', line_items: [jline({ id: 'li_1', unitPrice: 100, lineTotal: 200 })] }],
      invoice_lines: [nrow({ id: 'li_1', unit_price: '100.0000', line_total: '200.00', quantity: '2.000', tax_amount: '30.00' })],
    });

    const report = await new DocumentLineParityChecker(client).checkType('invoice');
    expect(report.findings).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('flags MISSING_NORMALIZED_LINE for a jsonb line id absent from the projection', async () => {
    const { client } = fakeClient({
      invoices: [{ id: 'inv_1', company_id: 'co_1', line_items: [jline({ id: 'li_1' }), jline({ id: 'li_2' })] }],
      invoice_lines: [nrow({ id: 'li_1' })],
    });

    const report = await new DocumentLineParityChecker(client).checkType('invoice');
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({ lineId: 'li_2', status: 'MISSING_NORMALIZED_LINE', documentId: 'inv_1' });
    expect(report.findings[0].jsonbLine).not.toBeNull();
    expect(report.documentsWithLineCountMismatch).toEqual(['inv_1']);
    expect(report.ok).toBe(false);
  });

  it('flags EXTRA_NORMALIZED_LINE for a projection row id absent from the jsonb array', async () => {
    const { client } = fakeClient({
      invoices: [{ id: 'inv_1', company_id: 'co_1', line_items: [jline({ id: 'li_1' })] }],
      invoice_lines: [nrow({ id: 'li_1' }), nrow({ id: 'li_ghost', line_number: 2 })],
    });

    const report = await new DocumentLineParityChecker(client).checkType('invoice');
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({ lineId: 'li_ghost', status: 'EXTRA_NORMALIZED_LINE' });
    expect(report.findings[0].normalizedLine).not.toBeNull();
    expect(report.ok).toBe(false);
  });

  it('flags EXTRA_NORMALIZED_LINE when the parent document header does not exist at all', async () => {
    const { client } = fakeClient({
      invoices: [],
      invoice_lines: [nrow({ id: 'li_1', invoice_id: 'inv_gone' })],
    });

    const report = await new DocumentLineParityChecker(client).checkType('invoice');
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({ lineId: 'li_1', documentId: 'inv_gone', status: 'EXTRA_NORMALIZED_LINE' });
    expect(report.ok).toBe(false);
  });

  it('flags FIELD_MISMATCH with per-field evidence when a compared value differs', async () => {
    const { client } = fakeClient({
      invoices: [{ id: 'inv_1', company_id: 'co_1', line_items: [jline({ id: 'li_1', unitPrice: 100, description: 'Widget' })] }],
      invoice_lines: [nrow({ id: 'li_1', unit_price: 105, description: 'Widgets' })],
    });

    const report = await new DocumentLineParityChecker(client).checkType('invoice');
    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0];
    expect(finding.status).toBe('FIELD_MISMATCH');
    const fields = finding.fieldMismatches.map((m) => m.field).sort();
    expect(fields).toEqual(['description', 'unit_price']);
    const unitPrice = finding.fieldMismatches.find((m) => m.field === 'unit_price');
    expect(unitPrice).toMatchObject({ jsonbValue: 100, normalizedValue: 105 });
    expect(finding.jsonbLine).not.toBeNull();
    expect(finding.normalizedLine).not.toBeNull();
  });

  it('marks a set-in-jsonb / NULL-in-projection ref mismatch as possiblyExpectedBackfillNull', async () => {
    const { client } = fakeClient({
      invoices: [{ id: 'inv_1', company_id: 'co_1', line_items: [jline({ id: 'li_1', productId: 'prod_unresolved' })] }],
      invoice_lines: [nrow({ id: 'li_1', product_id: null })],
    });

    const report = await new DocumentLineParityChecker(client).checkType('invoice');
    const mismatch = report.findings[0].fieldMismatches.find((m) => m.field === 'product_id');
    expect(mismatch).toMatchObject({
      jsonbValue: 'prod_unresolved',
      normalizedValue: null,
      possiblyExpectedBackfillNull: true,
    });
  });

  it('excludes a quantity <= 0 jsonb line instead of flagging it MISSING', async () => {
    const { client } = fakeClient({
      invoices: [{ id: 'inv_1', company_id: 'co_1', line_items: [jline({ id: 'li_1' }), jline({ id: 'li_zero', quantity: 0 })] }],
      invoice_lines: [nrow({ id: 'li_1' })],
    });

    const report = await new DocumentLineParityChecker(client).checkType('invoice');
    expect(report.findings).toEqual([]);
    expect(report.excludedZeroQtyJsonbLineIds).toEqual(['li_zero']);
    expect(report.jsonbLineCount).toBe(1);
    expect(report.ok).toBe(true);
  });

  it('compares bill fixed_asset_details structurally', async () => {
    const { client } = fakeClient({
      bills: [
        {
          id: 'bill_1',
          company_id: 'co_1',
          line_items: [
            { id: 'bl_1', description: 'Laptop', quantity: 1, unitPrice: 20000, taxAmount: 3000, lineTotal: 20000, fixedAssetDetails: { category: 'IT', usefulLife: 3 } },
          ],
        },
      ],
      bill_lines: [
        {
          id: 'bl_1',
          company_id: 'co_1',
          bill_id: 'bill_1',
          line_number: 1,
          product_id: null,
          warehouse_id: null,
          description: 'Laptop',
          quantity: 1,
          unit_price: 20000,
          tax_rate_id: null,
          tax_amount: 3000,
          line_total: 20000,
          fixed_asset_details: { usefulLife: 3, category: 'IT' },
        },
      ],
    });

    const report = await new DocumentLineParityChecker(client).checkType('bill');
    expect(report.findings).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('compares credit_note original_invoice_line_id', async () => {
    const { client } = fakeClient({
      credit_notes: [
        {
          id: 'cn_1',
          company_id: 'co_1',
          line_items: [
            { id: 'cnl_1', description: 'Return', quantity: 1, unitPrice: 50, taxAmount: 7.5, lineTotal: 50, originalInvoiceLineId: 'li_x' },
          ],
        },
      ],
      credit_note_lines: [
        {
          id: 'cnl_1',
          company_id: 'co_1',
          credit_note_id: 'cn_1',
          line_number: 1,
          product_id: null,
          warehouse_id: null,
          description: 'Return',
          quantity: 1,
          unit_price: 50,
          tax_rate_id: null,
          tax_amount: 7.5,
          line_total: 50,
          original_invoice_line_id: 'li_DIFFERENT',
        },
      ],
    });

    const report = await new DocumentLineParityChecker(client).checkType('credit_note');
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].fieldMismatches).toContainEqual({
      field: 'original_invoice_line_id',
      jsonbValue: 'li_x',
      normalizedValue: 'li_DIFFERENT',
    });
  });

  it('check() covers all four document types and never issues a write', async () => {
    const { client, selectCalls } = fakeClient({
      invoices: [], invoice_lines: [],
      bills: [], bill_lines: [],
      purchase_orders: [], purchase_order_lines: [],
      credit_notes: [], credit_note_lines: [],
    });

    const result = await new DocumentLineParityChecker(client).check();
    expect(result.reports.map((r) => r.documentType)).toEqual(['invoice', 'bill', 'purchase_order', 'credit_note']);
    expect(result.ok).toBe(true);
    expect(new Set(selectCalls.map((c) => c.table))).toEqual(
      new Set(['invoices', 'invoice_lines', 'bills', 'bill_lines', 'purchase_orders', 'purchase_order_lines', 'credit_notes', 'credit_note_lines']),
    );
    // every from() builder exposed a throwing insert/update/upsert/delete; none was hit
    // (the checker would have thrown synchronously), and only select was recorded.
    expect(selectCalls.length).toBeGreaterThan(0);
  });

  it('flags a line_number ordering mismatch', async () => {
    const { client } = fakeClient({
      invoices: [{ id: 'inv_1', company_id: 'co_1', line_items: [jline({ id: 'li_1' }), jline({ id: 'li_2' })] }],
      invoice_lines: [nrow({ id: 'li_1', line_number: 1 }), nrow({ id: 'li_2', line_number: 5 })],
    });

    const report = await new DocumentLineParityChecker(client).checkType('invoice');
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({ lineId: 'li_2', status: 'FIELD_MISMATCH' });
    expect(report.findings[0].fieldMismatches[0]).toMatchObject({ field: 'line_number', jsonbValue: 2, normalizedValue: 5 });
  });
});
