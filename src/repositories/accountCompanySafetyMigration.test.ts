import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Whole-project completion audit, Part 8 — migration-contract coverage for
 * 0059 (account-reference company-safety hardening). Static-SQL assertions
 * on the APPLIED file, same approach as `deliveryNotesMigrations.test.ts`.
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

describe('0059 — account reference company-safety hardening', () => {
  const sql = code('0059');

  it('adds exactly 18 new composite FK constraints, one per plain account-reference column', () => {
    const constraintNames = [
      'accounts_parent_account_company_fk',
      'bank_accounts_gl_account_company_fk',
      'cam_cogs_account_company_fk',
      'cam_inventory_account_company_fk',
      'cam_revenue_account_company_fk',
      'fixed_assets_accum_dep_account_company_fk',
      'fixed_assets_asset_account_company_fk',
      'fixed_assets_dep_expense_account_company_fk',
      'journal_lines_account_company_fk',
      'payroll_runs_contra_account_company_fk',
      'product_categories_adjustment_account_company_fk',
      'product_categories_cogs_account_company_fk',
      'product_categories_inventory_account_company_fk',
      'product_categories_revenue_account_company_fk',
      'products_cogs_account_company_fk',
      'products_inventory_account_company_fk',
      'products_purchase_account_company_fk',
      'products_sales_account_company_fk',
    ];
    expect(constraintNames).toHaveLength(18);
    for (const name of constraintNames) {
      expect(sql).toContain(name.toLowerCase());
    }
  });

  it('every new FK is composite — (company_id, <col>) references accounts(company_id, id)', () => {
    const matches = sql.match(/foreign key \(company_id, \w+\) references public\.accounts \(company_id, id\)/g) ?? [];
    expect(matches).toHaveLength(18);
  });

  it('is purely additive — no table created, no column dropped, no existing constraint dropped, no data touched', () => {
    expect(sql).not.toContain('create table');
    expect(sql).not.toContain('drop constraint');
    expect(sql).not.toContain('drop column');
    expect(sql).not.toContain('update ');
    expect(sql).not.toContain('delete ');
    expect(sql).not.toContain('insert into');
  });

  it('touches exactly the 8 expected tables', () => {
    for (const table of ['accounts', 'bank_accounts', 'category_account_mappings', 'fixed_assets', 'journal_lines', 'payroll_runs', 'product_categories', 'products']) {
      expect(sql).toContain(`alter table public.${table}`);
    }
  });
});
