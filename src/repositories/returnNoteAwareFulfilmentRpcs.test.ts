import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Completion-run stabilization (2026-09-05), Part 1 — migration-contract
 * coverage for 0061 (`create or replace` upgrades to `post_delivery_note`
 * and `create_invoice_from_sales_order` that net posted Return Note
 * quantity into the physical-fulfilment formula). Static-SQL assertions on
 * the APPLIED file — same approach as `deliveryNotesMigrations.test.ts` /
 * `returnNotesMigrations.test.ts` — so a regression in the SQL fails the
 * suite.
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

describe('0061 — return-note-aware post_delivery_note / create_invoice_from_sales_order', () => {
  const sql = code('0061');

  it('sorts after 0060', () => {
    expect(version('0061')).toBeGreaterThan(version('0060'));
  });

  it('replaces the SAME two functions, same names/signatures — no new function created', () => {
    expect(sql).toContain('create or replace function public.post_delivery_note(');
    expect(sql).toContain('create or replace function public.create_invoice_from_sales_order(');
    expect(sql).not.toContain('create or replace function public.post_return_note');
    expect(sql.match(/create or replace function/g) ?? []).toHaveLength(2);
  });

  describe('post_delivery_note', () => {
    it('reads posted return_notes, company-scoped, joined on salesOrderLineId', () => {
      expect(sql).toContain('from public.return_notes rn, jsonb_array_elements(coalesce(rn.line_items');
      expect(sql).toContain("rn.company_id = v_company and rn.status = 'posted'");
      expect(sql).toContain("(l.value->>'salesorderlineid') = v_sol_id");
      expect(sql).toContain('into v_returned_elsewhere');
    });

    it('nets returned out of delivered BEFORE subtracting direct-invoiced, floored at 0', () => {
      expect(sql).toContain('v_remaining := round(v_ordered - greatest(v_delivered_elsewhere - v_returned_elsewhere, 0) - v_direct_invoiced, 3)');
    });

    it('does not lock or write return_notes — read-only aggregate only', () => {
      const dnBody = sql.slice(sql.indexOf('create or replace function public.post_delivery_note'), sql.indexOf('create or replace function public.create_invoice_from_sales_order'));
      expect(dnBody).not.toMatch(/return_notes[^;]*for update/);
      expect(dnBody).not.toContain('insert into public.return_notes');
      expect(dnBody).not.toContain('update public.return_notes');
    });
  });

  describe('create_invoice_from_sales_order', () => {
    it('DIRECT branch: nets returned out of delivered before subtracting taken-direct', () => {
      expect(sql).toContain('into v_returned');
      expect(sql).toContain('v_remaining := round(v_ordered - greatest(v_delivered - v_returned, 0) - v_taken_direct, 3)');
    });

    it('DELIVERY-LINKED branch: subtracts returned quantity scoped to that EXACT deliveryNoteLineId', () => {
      expect(sql).toContain('into v_dn_line_returned');
      expect(sql).toContain("(l.value->>'deliverynotelineid') = v_dnl_id");
      expect(sql).toContain('v_remaining := round(v_dn_line_qty - v_dn_line_taken - v_dn_line_returned, 3)');
    });

    it('every return_notes read (both branches, plus post_delivery_note\'s own) is company-scoped and posted-only', () => {
      const matches = sql.match(/rn\.company_id = v_company and rn\.status = 'posted'/g) ?? [];
      expect(matches.length).toBe(3); // post_delivery_note + direct branch + delivery-linked branch
    });
  });

  it('revokes PUBLIC/anon execute and grants only authenticated for both functions', () => {
    expect(sql).toContain('revoke all on function public.post_delivery_note(uuid, uuid, jsonb, text, date) from public, anon');
    expect(sql).toContain('grant execute on function public.post_delivery_note(uuid, uuid, jsonb, text, date) to authenticated');
    expect(sql).toContain('revoke all on function public.create_invoice_from_sales_order(uuid, jsonb, text, timestamptz) from public, anon');
    expect(sql).toContain('grant execute on function public.create_invoice_from_sales_order(uuid, jsonb, text, timestamptz) to authenticated');
  });
});

/**
 * Formal, RUNNABLE proof of the return-note-aware remaining-to-deliver /
 * remaining-to-invoice-directly formulas — a local, test-only pure function
 * that reimplements the exact arithmetic both RPCs perform, mirroring
 * `deliveryNotesMigrations.test.ts`'s own quantity-matrix proof style.
 */
describe('Return-note-aware physical-fulfilment formula — formal proof', () => {
  function round3(v: number): number {
    return Math.round((v + Number.EPSILON) * 1000) / 1000;
  }
  /** post_delivery_note's / the direct branch of create_invoice_from_sales_order's shared shape. */
  function remainingToDeliverOrInvoiceDirect(ordered: number, delivered: number, returned: number, taken: number): number {
    return Math.max(0, round3(ordered - Math.max(delivered - returned, 0) - taken));
  }
  /** create_invoice_from_sales_order's delivery-linked branch. */
  function remainingOnDeliveryLine(dnLineQty: number, dnLineTaken: number, dnLineReturned: number): number {
    return Math.max(0, round3(dnLineQty - dnLineTaken - dnLineReturned));
  }
  function allow(requested: number, remaining: number): boolean {
    return requested - remaining <= 0.0000005;
  }

  it('the brief\'s own worked example: ordered 10, delivered 6, returned 2 uninvoiced → net delivered 4, remaining 6, committed 6', () => {
    expect(remainingToDeliverOrInvoiceDirect(10, 6, 2, 0)).toBe(6);
  });

  it('then a second delivery of 6 succeeds against remaining 6, landing at 0 remaining', () => {
    const remainingAfterFirstReturn = remainingToDeliverOrInvoiceDirect(10, 6, 2, 0);
    expect(allow(6, remainingAfterFirstReturn)).toBe(true);
    // after the second DN posts: delivered = 12 (6+6), returned still 2
    expect(remainingToDeliverOrInvoiceDirect(10, 12, 2, 0)).toBe(0);
  });

  it('interaction with direct invoicing: ordered 10, delivered 6, returned 2, direct invoiced 3 → remaining 3, no double counting', () => {
    expect(remainingToDeliverOrInvoiceDirect(10, 6, 2, 3)).toBe(3);
  });

  it('a return never invents quantity beyond ordered (over-return is impossible by construction — 0058 already guards it, this is a defensive floor)', () => {
    // pathological: returned > delivered would never happen live (0058's own
    // returnable-quantity guard prevents it), but the formula must not go
    // negative or exceed ordered if it somehow did.
    expect(remainingToDeliverOrInvoiceDirect(10, 4, 9, 0)).toBe(10);
  });

  it('zero Return Notes ever posted reduces byte-identically to the pre-5D (0055) formula', () => {
    const pre5d = (ordered: number, delivered: number, taken: number) => Math.max(0, round3(ordered - delivered - taken));
    expect(remainingToDeliverOrInvoiceDirect(10, 6, 0, 3)).toBe(pre5d(10, 6, 3));
    expect(remainingToDeliverOrInvoiceDirect(10, 0, 0, 4)).toBe(pre5d(10, 0, 4));
  });

  it('delivery-linked branch: a returned unit of THIS delivery line can never be invoiced through it again', () => {
    expect(remainingOnDeliveryLine(6, 0, 2)).toBe(4);
    expect(allow(6, remainingOnDeliveryLine(6, 0, 2))).toBe(false);
    expect(allow(4, remainingOnDeliveryLine(6, 0, 2))).toBe(true);
  });

  it('delivery-linked branch: a fully-returned delivery line has nothing left to invoice through it', () => {
    expect(remainingOnDeliveryLine(6, 0, 6)).toBe(0);
  });

  it('delivery-linked branch reduces byte-identically to 0055 when nothing has been returned', () => {
    expect(remainingOnDeliveryLine(6, 2, 0)).toBe(4);
  });
});
