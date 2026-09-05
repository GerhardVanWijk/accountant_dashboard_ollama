import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Part 11 (Forecasting) — migration-contract coverage for 0060
 * (`financial_plan_lines`). Static-SQL assertions on the APPLIED file.
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

describe('0060 — financial_plan_lines (Forecasting)', () => {
  const sql = code('0060');

  it('creates the financial_plan_type enum with exactly budget/forecast', () => {
    expect(sql).toContain("create type public.financial_plan_type as enum ('budget', 'forecast')");
  });

  it('creates financial_plan_lines with every required column, no priced/GL columns', () => {
    expect(sql).toContain('create table public.financial_plan_lines');
    for (const col of ['id', 'company_id', 'plan_type', 'account_id', 'period_year', 'period_month', 'amount', 'notes', 'created_at', 'updated_at']) {
      expect(sql).toContain(col);
    }
    expect(sql).not.toContain('journal_entry_id');
    expect(sql).not.toContain('status');
  });

  it('constrains period_month to 1-12', () => {
    expect(sql).toContain('check (period_month between 1 and 12)');
  });

  it('has a per-(company, plan_type, account, year, month) unique constraint — one current figure, not a history', () => {
    expect(sql).toContain('unique (company_id, plan_type, account_id, period_year, period_month)');
  });

  it('account_id is a COMPOSITE FK from the first migration — no plain FK', () => {
    expect(sql).toContain('foreign key (company_id, account_id) references public.accounts (company_id, id)');
    expect(sql).not.toContain('account_id uuid not null references public.accounts(id)');
  });

  it('enables RLS with a company-scoped all_own_company policy, same shape as every other table', () => {
    expect(sql).toContain('alter table public.financial_plan_lines enable row level security');
    expect(sql).toMatch(
      /create policy financial_plan_lines_all_own_company on public\.financial_plan_lines\s+for all to authenticated\s+using \(company_id = \(select public\.get_my_company_id\(\)\)\)\s+with check \(company_id = \(select public\.get_my_company_id\(\)\)\)/,
    );
  });

  it('is purely additive — no RPC, no journal/inventory-engine reference of any kind', () => {
    expect(sql).not.toContain('create or replace function');
    expect(sql).not.toContain('post_inventory_transaction');
    expect(sql).not.toContain('journal_entries');
    expect(sql).not.toContain('journal_lines');
  });
});
