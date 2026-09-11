import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Fixed Assets accounting-integrity Review 3 — migration-contract coverage
 * for 0079 (`fixed_asset_estimate_revisions`). Static-SQL assertions on the
 * AUTHORED file (not yet applied).
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

describe('0079 — fixed_asset_estimate_revisions', () => {
  const sql = code('0079');

  it('adds the (company_id, id) candidate key to fixed_assets first', () => {
    expect(sql).toContain('alter table public.fixed_assets add constraint fixed_assets_company_id_id_key unique (company_id, id)');
  });

  it('creates the table with every authoritative-estimate column, including the previous_* snapshot', () => {
    expect(sql).toContain('create table public.fixed_asset_estimate_revisions');
    for (const col of [
      'company_id',
      'asset_id',
      'effective_date',
      'useful_life_years',
      'residual_value',
      'depreciation_method',
      'reducing_balance_rate_percent',
      'previous_useful_life_years',
      'previous_residual_value',
      'previous_depreciation_method',
      'previous_reducing_balance_rate_percent',
      'reason',
      'created_by',
    ]) {
      expect(sql, col).toContain(col);
    }
  });

  it('one revision per (company, asset, effective_date) — a real timeline, not a free-for-all', () => {
    expect(sql).toContain('unique (company_id, asset_id, effective_date)');
  });

  it('asset_id is a COMPOSITE FK to fixed_assets(company_id, id) — no cross-company revision', () => {
    expect(sql).toContain('foreign key (company_id, asset_id) references public.fixed_assets(company_id, id)');
  });

  it('is append-only: SELECT + INSERT policies only, UPDATE/DELETE/TRUNCATE revoked (same as depreciation_entries)', () => {
    expect(sql).toContain('for select to authenticated');
    expect(sql).toContain('for insert to authenticated');
    expect(sql).not.toContain('for update to authenticated');
    expect(sql).not.toContain('for delete to authenticated');
    expect(sql).toContain('revoke update, delete, truncate on public.fixed_asset_estimate_revisions from anon, authenticated');
  });

  it('enables RLS and scopes both policies to the caller company', () => {
    expect(sql).toContain('alter table public.fixed_asset_estimate_revisions enable row level security');
    expect(sql).toContain('using (company_id = (select public.get_my_company_id()))');
    expect(sql).toContain('with check (company_id = (select public.get_my_company_id()))');
  });

  it('guards the estimate values at the DB layer', () => {
    expect(sql).toContain('check (useful_life_years > 0)');
    expect(sql).toContain('check (residual_value >= 0)');
    expect(sql).toContain("check (depreciation_method <> 'reducing_balance' or reducing_balance_rate_percent is not null)");
  });

  it('is purely additive — no RPC, no journal/inventory-engine reference', () => {
    expect(sql).not.toContain('create or replace function');
    expect(sql).not.toContain('journal_entries');
    expect(sql).not.toContain('journal_lines');
  });
});
