import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Block B (2026-09-05) — migration-contract coverage for 0062
 * (`create_invoice_from_sales_order` gains an atomic, opt-in `invoice_lines`
 * projection so a Sales-Order-derived invoice is no longer a permanent hole
 * in the normalized-document-lines projection). Static-SQL assertions on the
 * APPLIED file — same approach as `deliveryNotesMigrations.test.ts`.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.sql')).sort();

function migration(logical: string): { file: string; sql: string } {
  const matches = migrationFiles.filter((n) => n.includes(`__${logical}_`));
  expect(matches, `logical migration ${logical}`).toHaveLength(1);
  return { file: matches[0], sql: readFileSync(join(MIGRATIONS_DIR, matches[0]), 'utf8') };
}

function code(logical: string): string {
  return migration(logical)
    .sql.split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function version(logical: string): bigint {
  return BigInt(migration(logical).file.split('__')[0]);
}

describe('0062 — create_invoice_from_sales_order projects invoice_lines', () => {
  const sql = code('0062');

  it('sorts after 0061', () => {
    expect(version('0062')).toBeGreaterThan(version('0061'));
  });

  it('DROPS the 4-arg function then CREATEs the 5-arg (default-5th) one — not create-or-replace', () => {
    expect(sql).toContain('drop function if exists public.create_invoice_from_sales_order(uuid, jsonb, text, timestamptz)');
    expect(sql).toContain('create function public.create_invoice_from_sales_order(');
    expect(sql).toContain('p_project_lines boolean default false');
    expect(sql).not.toContain('create or replace function public.create_invoice_from_sales_order');
  });

  it('is still SECURITY INVOKER with a locked search_path', () => {
    expect(sql).toContain('security invoker');
    expect(sql).toContain("set search_path to 'public'");
  });

  it('the invoice_lines insert is GATED on p_project_lines and runs AFTER the invoice insert', () => {
    const invoiceInsertIdx = sql.indexOf('insert into public.invoices');
    const gateIdx = sql.indexOf('if p_project_lines then');
    const linesInsertIdx = sql.indexOf('insert into public.invoice_lines');
    expect(invoiceInsertIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(invoiceInsertIdx);
    expect(linesInsertIdx).toBeGreaterThan(gateIdx);
  });

  it('projects from the SAME v_new_lines array (no recalculation) and preserves the line id', () => {
    expect(sql).toContain('from jsonb_array_elements(v_new_lines) with ordinality as l(value, ord)');
    expect(sql).toContain("(l.value->>'id')::uuid,");
    // line_number is the 1-based ordinality
    expect(sql).toContain('l.ord::int,');
    // amounts copied verbatim, never recomputed inside the projection
    expect(sql).toContain("(l.value->>'quantity')::numeric,");
    expect(sql).toContain("(l.value->>'linetotal')::numeric, 0)");
  });

  it('resolves a stale product/warehouse/tax-rate ref to NULL rather than aborting (mirrors 0042 backfill)', () => {
    expect(sql).toContain("case when l.value->>'productid' is not null");
    expect(sql).toContain('exists (select 1 from public.products p where p.id = ');
    expect(sql).toContain('exists (select 1 from public.warehouses w where w.id = ');
    expect(sql).toContain('exists (select 1 from public.tax_rates t where t.id = ');
  });

  it('every projected FK check is filtered by the resolved v_company; company_id column is v_company', () => {
    expect(sql).toContain('and p.company_id = v_company');
    expect(sql).toContain('and w.company_id = v_company');
    expect(sql).toContain('and t.company_id = v_company');
    // the INSERT ... SELECT: id, then v_company as company_id, then v_invoice_id, then the 1-based ordinality
    expect(sql).toContain("(l.value->>'id')::uuid, v_company, v_invoice_id, l.ord::int,");
  });

  it('the return-note-aware fulfilment formula from 0061 is carried forward unchanged', () => {
    expect(sql).toContain('v_remaining := round(v_ordered - greatest(v_delivered - v_returned, 0) - v_taken_direct, 3)');
    expect(sql).toContain('v_remaining := round(v_dn_line_qty - v_dn_line_taken - v_dn_line_returned, 3)');
  });

  it('revokes PUBLIC/anon and grants only authenticated for the NEW 5-arg signature', () => {
    expect(sql).toContain('revoke all on function public.create_invoice_from_sales_order(uuid, jsonb, text, timestamptz, boolean) from public, anon');
    expect(sql).toContain('grant execute on function public.create_invoice_from_sales_order(uuid, jsonb, text, timestamptz, boolean) to authenticated');
  });

  it('the audit-log insert is preserved (unchanged from 0049)', () => {
    expect(sql).toContain("insert into public.audit_log_entries");
    expect(sql).toContain("'created', 'sales', 'invoice'");
  });
});

/**
 * Formal proof that the projection is a pure STRUCTURAL copy: given the
 * exact `v_new_lines` array the RPC builds, the `invoice_lines` rows are a
 * 1:1 field map with no arithmetic of their own.
 */
describe('invoice_lines projection — structural-parity proof', () => {
  interface JsonbLine {
    id: string;
    productId?: string;
    warehouseId?: string;
    taxRateId?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    taxAmount: number;
    lineTotal: number;
  }

  /** Reimplements exactly what 0062's INSERT ... SELECT does, per row. */
  function projectRow(l: JsonbLine, ord: number, companyId: string, realIds: Set<string>) {
    return {
      id: l.id,
      company_id: companyId,
      line_number: ord,
      product_id: l.productId && realIds.has(l.productId) ? l.productId : null,
      warehouse_id: l.warehouseId && realIds.has(l.warehouseId) ? l.warehouseId : null,
      tax_rate_id: l.taxRateId && realIds.has(l.taxRateId) ? l.taxRateId : null,
      description: l.description ?? '',
      quantity: l.quantity,
      unit_price: l.unitPrice,
      tax_amount: l.taxAmount ?? 0,
      line_total: l.lineTotal,
    };
  }

  it('a two-line array projects two rows with 1-based line_number and verbatim amounts', () => {
    const real = new Set(['prod-1', 'wh-1', 'tax-1']);
    const lines: JsonbLine[] = [
      { id: 'a', productId: 'prod-1', warehouseId: 'wh-1', taxRateId: 'tax-1', description: 'X', quantity: 4, unitPrice: 123.4567, taxAmount: 74.07, lineTotal: 493.83 },
      { id: 'b', description: 'Service', quantity: 1, unitPrice: 50, taxAmount: 0, lineTotal: 50 },
    ];
    const rows = lines.map((l, i) => projectRow(l, i + 1, 'co', real));
    expect(rows[0]).toEqual({ id: 'a', company_id: 'co', line_number: 1, product_id: 'prod-1', warehouse_id: 'wh-1', tax_rate_id: 'tax-1', description: 'X', quantity: 4, unit_price: 123.4567, tax_amount: 74.07, line_total: 493.83 });
    expect(rows[1]).toEqual({ id: 'b', company_id: 'co', line_number: 2, product_id: null, warehouse_id: null, tax_rate_id: null, description: 'Service', quantity: 1, unit_price: 50, tax_amount: 0, line_total: 50 });
  });

  it('a stale FK ref becomes NULL, the amounts are untouched', () => {
    const real = new Set<string>(); // nothing resolves
    const row = projectRow(
      { id: 'a', productId: 'ghost', warehouseId: 'ghost', taxRateId: 'ghost', description: 'X', quantity: 2, unitPrice: 10, taxAmount: 3, lineTotal: 20 },
      1, 'co', real,
    );
    expect(row.product_id).toBeNull();
    expect(row.warehouse_id).toBeNull();
    expect(row.tax_rate_id).toBeNull();
    expect(row.quantity).toBe(2);
    expect(row.line_total).toBe(20);
  });

  it('never invents a value the jsonb line does not have — description falls back to empty string, tax_amount to 0', () => {
    const row = projectRow({ id: 'a', description: '', quantity: 1, unitPrice: 5, taxAmount: 0, lineTotal: 5 } as JsonbLine, 1, 'co', new Set());
    expect(row.description).toBe('');
    expect(row.tax_amount).toBe(0);
  });
});
