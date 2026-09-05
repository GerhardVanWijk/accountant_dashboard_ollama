import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Phase 5D — migration-contract coverage for 0056 (`stock_movement_type`
 * `return_note` value), 0057 (`return_notes` table + composite FKs + RLS)
 * and 0058 (`post_return_note` atomic RPC). Static-SQL assertions on the
 * APPLIED files — same approach as `deliveryNotesMigrations.test.ts` — so a
 * regression in the SQL fails the suite.
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

describe('0056 — stock_movement_type return_note', () => {
  const sql = code('0056');

  it('sorts after 0055 and before 0057', () => {
    expect(version('0056')).toBeGreaterThan(version('0055'));
    expect(version('0056')).toBeLessThan(version('0057'));
  });

  it('adds ONLY the `return_note` enum value, idempotently, and nothing else', () => {
    expect(sql).toContain("alter type public.stock_movement_type add value if not exists 'return_note'");
    expect(sql).not.toContain('create table');
    expect(sql).not.toContain('drop ');
    expect(sql).not.toContain('update ');
    expect(sql).not.toContain('alter table');
    expect(sql.match(/;/g) ?? []).toHaveLength(1);
  });
});

describe('0057 — return_notes table', () => {
  const sql = code('0057');

  it('sorts after 0056 and before 0058', () => {
    expect(version('0057')).toBeGreaterThan(version('0056'));
    expect(version('0057')).toBeLessThan(version('0058'));
  });

  it('creates the return_note_status enum with exactly draft/posted/cancelled', () => {
    expect(sql).toContain("create type public.return_note_status as enum ('draft', 'posted', 'cancelled')");
  });

  it('creates return_notes with every REQUIRED column', () => {
    expect(sql).toContain('create table public.return_notes');
    for (const col of [
      'id',
      'company_id',
      'return_note_number',
      'delivery_note_id',
      'sales_order_id',
      'customer_id',
      'warehouse_id',
      'return_date',
      'status',
      'line_items',
      'notes',
      'journal_entry_id',
      'created_at',
      'updated_at',
    ]) {
      expect(sql).toContain(col);
    }
    // deliberately NOT present — no price-based header totals, mirrors delivery_notes
    expect(sql).not.toContain('subtotal');
    expect(sql).not.toContain('tax_total numeric');
  });

  it('company_id cascades from companies, status defaults to draft, line_items defaults to an empty jsonb array', () => {
    expect(sql).toContain('company_id uuid not null references public.companies(id) on delete cascade');
    expect(sql).toContain("status public.return_note_status not null default 'draft'");
    expect(sql).toContain("line_items jsonb not null default '[]'::jsonb");
  });

  it('has a per-company unique document number and a (company_id, id) candidate key', () => {
    expect(sql).toContain('unique (company_id, return_note_number)');
    expect(sql).toContain('unique (company_id, id)');
  });

  it('every relationship is a COMPOSITE FK — no plain FK to any table', () => {
    expect(sql).toContain('foreign key (company_id, delivery_note_id) references public.delivery_notes(company_id, id)');
    expect(sql).toContain('foreign key (company_id, sales_order_id) references public.sales_orders(company_id, id)');
    expect(sql).toContain('foreign key (company_id, customer_id) references public.customers(company_id, id)');
    expect(sql).toContain('foreign key (company_id, warehouse_id) references public.warehouses(company_id, id)');
  });

  it('indexes company_id, delivery_note_id, sales_order_id, customer_id, warehouse_id and status', () => {
    expect(sql).toContain('create index return_notes_company_id_idx on public.return_notes (company_id)');
    expect(sql).toContain('create index return_notes_delivery_note_id_idx on public.return_notes (delivery_note_id)');
    expect(sql).toContain('create index return_notes_sales_order_id_idx on public.return_notes (sales_order_id)');
    expect(sql).toContain('create index return_notes_customer_id_idx on public.return_notes (customer_id)');
    expect(sql).toContain('create index return_notes_warehouse_id_idx on public.return_notes (warehouse_id)');
    expect(sql).toContain('create index return_notes_status_idx on public.return_notes (status)');
  });

  it('enables RLS with a company-scoped all_own_company policy, same shape as every other document table', () => {
    expect(sql).toContain('alter table public.return_notes enable row level security');
    expect(sql).toMatch(
      /create policy return_notes_all_own_company on public\.return_notes\s+for all to authenticated\s+using \(company_id = \(select public\.get_my_company_id\(\)\)\)\s+with check \(company_id = \(select public\.get_my_company_id\(\)\)\)/,
    );
  });
});

describe('0058 — post_return_note RPC', () => {
  const sql = code('0058');

  it('sorts after 0057', () => {
    expect(version('0058')).toBeGreaterThan(version('0057'));
  });

  it('is a SECURITY INVOKER function with a locked search_path', () => {
    expect(sql).toContain('create or replace function public.post_return_note');
    expect(sql).toContain('security invoker');
    expect(sql).toContain("set search_path to 'public'");
  });

  it('resolves the company internally — never trusts a client-supplied company_id', () => {
    expect(sql).toContain('select public.get_my_company_id()');
    expect(sql).not.toContain('p_company_id');
  });

  it('LOCKS the return note row for update, scoped by company, and requires draft status', () => {
    expect(sql).toMatch(/from public\.return_notes where id = p_return_note_id and company_id = v_company for update/);
    expect(sql).toContain("if v_rn.status <> 'draft' then");
    expect(sql).toContain('only a draft can be posted');
  });

  it('LOCKS the delivery note row for update and requires it to be posted', () => {
    expect(sql).toMatch(/from public\.delivery_notes where id = v_rn\.delivery_note_id and company_id = v_company for update/);
    expect(sql).toContain("if v_dn.status <> 'posted' then");
    expect(sql).toContain('only a posted delivery note has physical stock to return');
  });

  it('cross-validates the return note against its delivery note — warehouse, sales order and customer must match', () => {
    expect(sql).toContain('v_rn.warehouse_id <> v_dn.warehouse_id');
    expect(sql).toContain('v_rn.sales_order_id <> v_dn.sales_order_id');
    expect(sql).toContain('v_rn.customer_id <> v_dn.customer_id');
  });

  it('validates every return-note line: no dupes, has a deliveryNoteLineId, >0, ≤3dp', () => {
    expect(sql).toContain('appears more than once');
    expect(sql).toContain('has no deliverynotelineid');
    expect(sql).toContain('quantity must be greater than zero');
    expect(sql).toContain('more than 3 decimal places');
    expect(sql).toContain('round(v_qty, 3)');
  });

  it('re-derives returnable = deliveredQty - invoicedQty - alreadyReturnedQty, excluding itself', () => {
    expect(sql).toContain("i.status <> 'void'");
    expect(sql).toContain("(il.value->>'deliverynotelineid') = v_dnl_id");
    expect(sql).toContain("rn.status = 'posted' and rn.id <> v_rn.id");
    expect(sql).toContain('v_returnable := round(v_delivered_qty - v_invoiced_qty - v_already_returned, 3)');
    expect(sql).toContain('only % remain returnable');
  });

  it('reads the FROZEN unit cost from the delivery note\'s own stock_movements row — never the product\'s current WAC', () => {
    expect(sql).toContain("sm.source_document_type = 'delivery_note'");
    expect(sql).toContain('sm.source_document_id = v_dn.id');
    expect(sql).toContain('sm.source_document_line_id::text = v_dnl_id');
    expect(sql).toContain('no frozen delivery cost evidence found');
    expect(sql).not.toContain('v_prod.cost_price'); // never falls back to current WAC
  });

  it('posts return_in with an explicit unit_cost_override (never a bare current-WAC issue/receipt)', () => {
    expect(sql).toContain("'costing_mode', 'return_in'");
    expect(sql).toContain("'unit_cost_override', v_frozen_cost");
    expect(sql).toContain("'movement_type', 'return_note'");
    expect(sql).toContain("'quantity_delta', v_qty"); // positive — stock re-enters
  });

  it('never re-reads productId/quantity from the caller — only the stored delivery note line_items', () => {
    expect(sql).toContain('from jsonb_array_elements(coalesce(v_dn.line_items');
    expect(sql).not.toContain("p_line_accounts->>'productid'");
    expect(sql).not.toContain("p_line_accounts->>'quantity'");
  });

  it('requires every account id (contra + per-line inventory) to belong to this company', () => {
    expect(sql).toContain('does not belong to this company');
  });

  it('calls the EXISTING post_inventory_transaction — no engine duplication — with no extra_journal (no revenue/VAT/AR leg)', () => {
    expect(sql).toContain('select public.post_inventory_transaction(');
    expect(sql).toContain("p_source_type => 'return_note'");
    expect(sql).toContain("p_extra_journal => '[]'::jsonb");
  });

  it('uses the <sourceType>:<sourceId>:<verb> posting-key convention', () => {
    expect(sql).toContain("v_posting_key := 'return_note:' || v_rn.id::text || ':post'");
  });

  it('flips the return note to posted and stamps journal_entry_id ONLY after the engine call', () => {
    const engineCallIdx = sql.indexOf('select public.post_inventory_transaction(');
    const statusUpdateIdx = sql.indexOf("set status = 'posted'");
    expect(engineCallIdx).toBeGreaterThan(-1);
    expect(statusUpdateIdx).toBeGreaterThan(engineCallIdx);
    expect(sql).toContain('journal_entry_id = nullif');
  });

  it('writes NO journal_entries/journal_lines rows itself — post_inventory_transaction owns those tables exclusively', () => {
    expect(sql).not.toContain('insert into public.journal_entries');
    expect(sql).not.toContain('insert into public.journal_lines');
  });

  it('revokes PUBLIC/anon execute and grants only authenticated', () => {
    expect(sql).toContain('revoke all on function public.post_return_note');
    expect(sql).toContain('from public, anon');
    expect(sql).toContain('grant execute on function public.post_return_note');
    expect(sql).toContain('to authenticated');
  });
});

/**
 * Formal, RUNNABLE proof of the return-quantity formula
 * (docs/RETURN_NOTES_DESIGN.md) — a local, test-only pure function that
 * reimplements the exact arithmetic 0058's SQL performs.
 */
describe('Return Note quantity formula — formal proof', () => {
  function round3(v: number): number {
    return Math.round((v + Number.EPSILON) * 1000) / 1000;
  }
  function returnableQty(delivered: number, invoiced: number, alreadyReturned: number): number {
    return Math.max(0, round3(delivered - invoiced - alreadyReturned));
  }
  function allow(requested: number, returnable: number): boolean {
    return requested - returnable <= 0.0000005;
  }

  it('the worked example: delivered 10, invoiced 6, previously returned 1 → returnable 3', () => {
    expect(returnableQty(10, 6, 1)).toBe(3);
  });

  it('cannot return more than delivered', () => {
    const returnable = returnableQty(10, 0, 0);
    expect(allow(11, returnable)).toBe(false);
    expect(allow(10, returnable)).toBe(true);
  });

  it('cannot return already-invoiced quantity', () => {
    const returnable = returnableQty(10, 10, 0);
    expect(returnable).toBe(0);
    expect(allow(1, returnable)).toBe(false);
  });

  it('cannot double-return the same quantity', () => {
    const returnable = returnableQty(10, 0, 10);
    expect(returnable).toBe(0);
  });

  it('never goes negative even if invoiced+returned somehow exceeds delivered', () => {
    expect(returnableQty(10, 8, 5)).toBe(0);
  });
});
