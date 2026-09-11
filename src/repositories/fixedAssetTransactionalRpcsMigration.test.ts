import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Fixed Assets accounting-integrity Review 4 (Final Transactional
 * Completion) — migration-contract coverage for 0081-0084. Static-SQL
 * assertions on the AUTHORED files (not yet applied), same convention as
 * fixedAssetEstimateRevisionsMigration.test.ts / vatSourceEntriesMigration.test.ts.
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

describe('0081 — post_asset_depreciation_period', () => {
  const sql = code('0081');

  it('adds a hard per-asset-per-month uniqueness backstop on depreciation_entries', () => {
    expect(sql).toContain('unique (company_id, asset_id, period_end)');
  });

  it('the idempotency log is keyed on (company_id, run_id)', () => {
    expect(sql).toContain('create table public.fixed_asset_period_posting_log');
    expect(sql).toContain('unique (company_id, run_id)');
  });

  it('the function is SECURITY INVOKER with a locked search_path (RLS applies as the caller)', () => {
    expect(sql).toContain('create or replace function public.post_asset_depreciation_period');
    expect(sql).toContain('security invoker');
    expect(sql).toContain("set search_path to 'public'");
  });

  it('re-validates against the LOCKED asset row (for update) before writing anything', () => {
    expect(sql).toContain('for update');
    expect(sql).toContain("v_asset.status <> 'active'");
  });

  it('re-checks the accounting period is open — create_journal_entry_with_lines does not', () => {
    expect(sql).toContain("p.status = 'open'");
  });

  it('posts through the canonical atomic journal path, not a raw insert', () => {
    expect(sql).toContain('public.create_journal_entry_with_lines(');
  });

  it('does not duplicate depreciation arithmetic — every amount is a bound parameter, not computed here', () => {
    expect(sql).not.toMatch(/useful_life_years\s*\/\s*12/);
    expect(sql).not.toContain('reducing_balance_rate_percent / 100');
  });

  it('EXECUTE is revoked from public/anon, granted to authenticated only', () => {
    expect(sql).toContain('revoke all on function public.post_asset_depreciation_period');
    expect(sql).toContain('grant execute on function public.post_asset_depreciation_period');
    expect(sql).toContain('to authenticated');
  });
});

describe('0082 — vat_source_entries uniqueness', () => {
  const sql = code('0082');

  it('is a partial unique index scoped to ORIGINAL rows only', () => {
    expect(sql).toContain('create unique index vat_source_entries_original_unique');
    expect(sql).toContain('on public.vat_source_entries (company_id, source_type, source_id)');
    expect(sql).toContain('where reverses_entry_id is null');
  });

  it('is purely additive — no RPC', () => {
    expect(sql).not.toContain('create or replace function');
  });
});

describe('0083 — post_fixed_asset_disposal', () => {
  const sql = code('0083');

  it('adds the one-disposal-per-asset uniqueness backstop', () => {
    expect(sql).toContain('add constraint asset_disposals_company_asset_key unique (company_id, asset_id)');
  });

  it('the idempotency log is keyed on (company_id, disposal_id)', () => {
    expect(sql).toContain('create table public.fixed_asset_disposal_log');
    expect(sql).toContain('unique (company_id, disposal_id)');
  });

  it('the function is SECURITY INVOKER with a locked search_path', () => {
    expect(sql).toContain('create or replace function public.post_fixed_asset_disposal');
    expect(sql).toContain('security invoker');
    expect(sql).toContain("set search_path to 'public'");
  });

  it('locks the asset row and refuses a draft or already-disposed asset', () => {
    expect(sql).toContain('for update');
    expect(sql).toContain("v_asset.status = 'draft'");
    expect(sql).toContain("v_asset.status = 'disposed'");
  });

  it('re-validates the accumulated depreciation passed in against the LOCKED row', () => {
    expect(sql).toContain('v_asset.accumulated_depreciation - p_accumulated_depreciation');
  });

  it('refuses disposal when a future-effective estimate revision exists (Review 4 Item L)', () => {
    expect(sql).toContain('fixed_asset_estimate_revisions r');
    expect(sql).toContain('r.effective_date > p_disposal_date');
  });

  it('re-checks the accounting period is open', () => {
    expect(sql).toContain("p.status = 'open'");
  });

  it('posts through the canonical atomic journal path', () => {
    expect(sql).toContain('public.create_journal_entry_with_lines(');
  });

  it('VAT evidence is conditional and written in the same transaction, never a second call', () => {
    expect(sql).toContain('if p_vat is not null then');
    expect(sql).toContain('insert into public.vat_source_entries');
  });

  it('does not duplicate VAT/gain-loss arithmetic — every amount is a bound parameter', () => {
    expect(sql).not.toMatch(/taxable_amount\s*\*/);
    expect(sql).not.toMatch(/proceeds\s*-\s*carrying/);
  });

  it('EXECUTE is revoked from public/anon, granted to authenticated only', () => {
    expect(sql).toContain('revoke all on function public.post_fixed_asset_disposal');
    expect(sql).toContain('grant execute on function public.post_fixed_asset_disposal');
    expect(sql).toContain('to authenticated');
  });
});

describe('0084 — revise_fixed_asset_estimate', () => {
  const sql = code('0084');

  it('reuses 0079\'s natural key for idempotency instead of a synthetic id', () => {
    expect(sql).toContain('on conflict (company_id, asset_id, effective_date) do nothing');
  });

  it('the function is SECURITY INVOKER with a locked search_path', () => {
    expect(sql).toContain('create or replace function public.revise_fixed_asset_estimate');
    expect(sql).toContain('security invoker');
    expect(sql).toContain("set search_path to 'public'");
  });

  it('locks the asset and refuses a non-active/fully_depreciated status', () => {
    expect(sql).toContain('for update');
    expect(sql).toContain("v_asset.status not in ('active', 'fully_depreciated')");
  });

  it('recomputes the cache from the latest revision unconditionally, on both the fresh-insert and idempotent-retry paths', () => {
    expect(sql).toContain('order by r.effective_date desc');
    expect(sql).toContain('limit 1');
    // The cache UPDATE must not be nested inside an `if not v_idempotent` /
    // `if v_rev_id is not null` branch — it must run every time.
    const updateIdx = sql.indexOf('update public.fixed_assets');
    const branchIdx = sql.indexOf('if v_rev_id is null then');
    expect(updateIdx).toBeGreaterThan(-1);
    expect(branchIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(branchIdx);
  });

  it('EXECUTE is revoked from public/anon, granted to authenticated only', () => {
    expect(sql).toContain('revoke all on function public.revise_fixed_asset_estimate');
    expect(sql).toContain('grant execute on function public.revise_fixed_asset_estimate');
    expect(sql).toContain('to authenticated');
  });
});
