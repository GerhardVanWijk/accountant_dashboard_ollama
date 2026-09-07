import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * SQL-contract cover for migration 0074 (accounting-settings + account-
 * mapping change audit). Live behaviour — a VAT-frequency change on the
 * live company writing an `accounting_setting_changed` row with before/
 * after JSON, then rolled back — was verified against the project (see
 * docs/AUDIT_TRAIL.md / docs/ADMINISTRATION.md).
 */

const dir = join(process.cwd(), 'supabase', 'migrations');
const file = readdirSync(dir).find((n) => n.includes('__0074_'))!;
const sql = readFileSync(join(dir, file), 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

describe('0074 — accounting settings audit', () => {
  it('sorts after 0073', () => {
    const v = (l: string) => BigInt(readdirSync(dir).find((n) => n.includes(`__${l}_`))!.split('__')[0]);
    expect(v('0074')).toBeGreaterThan(v('0073'));
  });

  it('audits every high-risk accounting-config column on companies, with before/after', () => {
    expect(sql).toContain('create trigger companies_accounting_settings_audit_bu before update on public.companies');
    for (const col of [
      'accounting_basis', 'functional_currency', 'presentation_currency',
      'financial_year_end_month', 'financial_year_end_day', 'is_vat_registered',
      'vat_registration_number', 'vat_filing_frequency', 'vat_accounting_basis',
    ]) {
      expect(sql).toContain(col);
    }
    expect(sql).toContain("'accounting_setting_changed', 'settings', 'company'");
    expect(sql).toContain('if v_old is distinct from v_new then');
  });

  it('audits category_account_mappings changes on the settings module', () => {
    expect(sql).toContain('create trigger category_account_mapping_audit_aiud after insert or update or delete on public.category_account_mappings');
    expect(sql).toContain("'account_mapping_changed', 'settings', 'categoryaccountmapping'");
  });

  it('adds no schema / RLS / data changes to accounting tables', () => {
    expect(sql).not.toMatch(/alter table public\.(journal_entries|journal_lines|accounts|invoices|companies) add column/);
    expect(sql).not.toMatch(/create policy/);
    expect(sql).not.toMatch(/\bupdate public\.(journal_entries|journal_lines|accounts|invoices)\b/);
  });
});
