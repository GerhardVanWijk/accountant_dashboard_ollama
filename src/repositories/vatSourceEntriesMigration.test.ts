import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Fixed Assets accounting-integrity Review 3 — migration-contract coverage
 * for 0080 (`vat_source_entries`). Static-SQL assertions on the AUTHORED
 * file (not yet applied).
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

describe('0080 — vat_source_entries', () => {
  const sql = code('0080');

  it('creates the vat_source_direction enum', () => {
    expect(sql).toContain("create type public.vat_source_direction as enum ('output', 'input')");
  });

  it('is generic (source_type / source_id), not a fixed-asset-disposal-only table', () => {
    expect(sql).toContain('create table public.vat_source_entries');
    expect(sql).toContain('source_type text not null');
    expect(sql).toContain('source_id uuid not null');
    expect(sql).not.toContain('asset_disposal_id');
    expect(sql).not.toContain('fixed_asset_disposal_vat');
  });

  it('carries the authoritative VAT evidence columns', () => {
    for (const col of [
      'company_id',
      'transaction_date',
      'tax_rate_id',
      'treatment',
      'direction',
      'taxable_amount',
      'vat_amount',
      'gross_amount',
      'classification',
      'journal_entry_id',
      'reverses_entry_id',
    ]) {
      expect(sql, col).toContain(col);
    }
  });

  it('tax_rate_id is a COMPOSITE FK to tax_rates(company_id, id) — the rate is authoritative, not free-typed', () => {
    expect(sql).toContain('foreign key (company_id, tax_rate_id) references public.tax_rates(company_id, id)');
  });

  it('treatment reuses the shared vat_treatment enum (branches the VAT report)', () => {
    expect(sql).toContain('treatment public.vat_treatment not null');
  });

  it('a reversal points at the row it reverses (contra, never a delete)', () => {
    expect(sql).toContain('reverses_entry_id uuid references public.vat_source_entries(id)');
  });

  it('is append-only with company-scoped RLS', () => {
    expect(sql).toContain('alter table public.vat_source_entries enable row level security');
    expect(sql).toContain('for select to authenticated');
    expect(sql).toContain('for insert to authenticated');
    expect(sql).toContain('revoke update, delete, truncate on public.vat_source_entries from anon, authenticated');
    expect(sql).toContain('using (company_id = (select public.get_my_company_id()))');
    expect(sql).toContain('with check (company_id = (select public.get_my_company_id()))');
  });

  it('is purely additive — no RPC', () => {
    expect(sql).not.toContain('create or replace function');
  });
});
