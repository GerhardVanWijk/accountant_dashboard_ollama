import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Phase 5B FINAL — migration-contract coverage for 0048 (`sales_order_status`
 * `closed` value) and 0049 (`create_invoice_from_sales_order` atomic RPC).
 * Static-SQL assertions on the authored files — same approach as
 * `normalizedLineMigrations.test.ts` — so a regression in the SQL fails the
 * suite before it is applied.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.sql')).sort();

function migration(logical: string): { file: string; sql: string } {
  const matches = migrationFiles.filter((n) => n.includes(`__${logical}_`));
  expect(matches, `logical migration ${logical}`).toHaveLength(1);
  return { file: matches[0], sql: readFileSync(join(MIGRATIONS_DIR, matches[0]), 'utf8') };
}

/** comment-free, whitespace-collapsed, lowercased executable SQL. */
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

describe('0048 — sales_order_status closed', () => {
  const sql = code('0048');

  it('sorts after 0047 and before 0049', () => {
    expect(version('0048')).toBeGreaterThan(version('0047'));
    expect(version('0048')).toBeLessThan(version('0049'));
  });

  it('adds ONLY the `closed` enum value, idempotently, and nothing else', () => {
    expect(sql).toContain("alter type public.sales_order_status add value if not exists 'closed'");
    // no other DDL — ADD VALUE cannot share a transaction
    expect(sql).not.toContain('create table');
    expect(sql).not.toContain('drop ');
    expect(sql).not.toContain('update ');
    expect(sql).not.toContain('alter table');
    expect(sql.match(/;/g) ?? []).toHaveLength(1);
  });
});

describe('0049 — create_invoice_from_sales_order RPC', () => {
  const sql = code('0049');

  it('sorts after 0048', () => {
    expect(version('0049')).toBeGreaterThan(version('0048'));
  });

  it('is a SECURITY INVOKER function with a locked search_path', () => {
    expect(sql).toContain('create or replace function public.create_invoice_from_sales_order');
    expect(sql).toContain('security invoker');
    expect(sql).toContain("set search_path to 'public'");
  });

  it('resolves the company internally — never trusts a client-supplied company_id', () => {
    expect(sql).toContain('select public.get_my_company_id()');
    expect(sql).not.toContain('p_company_id');
    expect(sql).not.toContain('p_company ');
  });

  it('LOCKS the sales order row for update and filters by company', () => {
    expect(sql).toMatch(/from public\.sales_orders where id = p_sales_order_id and company_id = v_company for update/);
  });

  it('rejects a cancelled / closed order and a legacy full conversion', () => {
    expect(sql).toContain("v_so.status = 'cancelled'");
    expect(sql).toContain("v_so.status = 'closed'");
    expect(sql).toContain('was already converted to an invoice the pre-5b.1 way');
  });

  it('validates each selection: belongs-to-order, no dupes, >0, ≤3dp, ≤ remaining', () => {
    expect(sql).toContain('is not on sales order');
    expect(sql).toContain('selected more than once');
    expect(sql).toContain('must be greater than zero');
    expect(sql).toContain('more than 3 decimal places');
    expect(sql).toContain('round(v_qty, 3)');
    expect(sql).toContain('only % remain to invoice');
  });

  it('re-derives "taken" from BOTH draft and posted linked invoices (status <> void)', () => {
    expect(sql).toMatch(/from public\.invoices i, jsonb_array_elements\(coalesce\(i\.line_items,'\[\]'::jsonb\)\) il where i\.sales_order_id = p_sales_order_id and i\.company_id = v_company and i\.status <> 'void'/);
  });

  it('builds every invoice-line field from the authoritative SO line jsonb, with a fresh id', () => {
    expect(sql).toContain("v_so_line->>'productid'");
    expect(sql).toContain("v_so_line->>'warehouseid'");
    expect(sql).toContain("v_so_line->>'taxrateid'");
    expect(sql).toContain("v_so_line->>'unitprice'");
    expect(sql).toContain('gen_random_uuid()::text');
    expect(sql).toContain("'salesorderlineid', v_sol_id");
    // the request's own product/price is NEVER read
    expect(sql).not.toContain("v_sel->>'productid'");
    expect(sql).not.toContain("v_sel->>'unitprice'");
  });

  it('creates the invoice as DRAFT and posts NO journal / stock / GL', () => {
    expect(sql).toContain("'draft',");
    expect(sql).not.toContain('journal_entries');
    expect(sql).not.toContain('journal_lines');
    expect(sql).not.toContain('stock_movements');
    expect(sql).not.toContain('create_journal_entry_with_lines');
    expect(sql).not.toContain('post_inventory_transaction');
  });

  it('never touches the sales order status (a draft never flips commercial status)', () => {
    expect(sql).not.toContain('update public.sales_orders');
  });

  it('revokes PUBLIC/anon execute and grants only authenticated', () => {
    expect(sql).toContain('revoke all on function public.create_invoice_from_sales_order');
    expect(sql).toContain('from public, anon');
    expect(sql).toContain('grant execute on function public.create_invoice_from_sales_order');
    expect(sql).toContain('to authenticated');
  });
});
