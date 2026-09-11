import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AccountMappingKey } from '@/features/accounting/services/accountMappingService';

/**
 * COMMERCIAL FOUNDATION · BLOCK 1 (2026-09-06) — migration-contract cover
 * for 0066 (atomic first-company bootstrap) + 0067 (scoped-bypass
 * hardening). Static-SQL assertions on the APPLIED files, same approach as
 * `secureCompanyOnboardingMigration.test.ts`. Live behaviour of every
 * branch (happy path, double-submit, superuser, already-in-company,
 * GUC-abuse variants, mid-transaction rollback) was proven separately with
 * rollback-wrapped RLS sessions — see docs/KNOWN_ISSUES.md.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.sql')).sort();

function raw(logical: string): string {
  const matches = files.filter((n) => n.includes(`__${logical}_`));
  expect(matches, `logical migration ${logical}`).toHaveLength(1);
  return readFileSync(join(MIGRATIONS_DIR, matches[0]), 'utf8');
}

function code(logical: string): string {
  return raw(logical).split('\n').map((l) => l.replace(/--.*$/, '')).join('\n').replace(/\s+/g, ' ').toLowerCase().trim();
}

function version(logical: string): bigint {
  return BigInt(files.filter((n) => n.includes(`__${logical}_`))[0].split('__')[0]);
}

// The chart-of-account codes every service resolves through AccountMapper.
// (Pulled from the real enum so a new mapping key can't silently regress
// the bootstrap seed.)
const REQUIRED_CODES: Record<AccountMappingKey, string> = {
  AR: '1100', CUSTOMER_DEPOSIT: '2600', AP: '2000', SALES_REVENUE: '4000', VAT_OUTPUT: '2100',
  VAT_INPUT: '2110', COGS: '5000', INVENTORY: '1200', INVENTORY_ADJUSTMENT: '5050',
  PURCHASE_PRICE_VARIANCE: '5060', INVENTORY_IN_TRANSIT: '1210', OPENING_BALANCE_EQUITY: '3950',
  EXPENSE: '5100', CASH_AND_BANK: '1000', GRNI: '2050', GOODS_DELIVERED_NOT_INVOICED: '1220',
  FIXED_ASSET: '1500', ACCUMULATED_DEPRECIATION: '1590', DEPRECIATION_EXPENSE: '5200',
  GAIN_ON_DISPOSAL: '4200', LOSS_ON_DISPOSAL: '5300', ALLOWANCE_FOR_DOUBTFUL_DEBTS: '1150',
  IMPAIRMENT_LOSS: '5700', SALARIES_EXPENSE: '5400', UIF_EMPLOYER_EXPENSE: '5410', SDL_EXPENSE: '5420',
  PAYE_PAYABLE: '2200', UIF_EMPLOYEE_PAYABLE: '2210', UIF_EMPLOYER_PAYABLE: '2220', SDL_PAYABLE: '2230',
  OTHER_DEDUCTIONS_PAYABLE: '2240', RIGHT_OF_USE_ASSET: '1700', LEASE_LIABILITY: '2450',
  ACCUMULATED_DEPRECIATION_ROU: '1790', DEPRECIATION_EXPENSE_ROU: '5800', INTEREST_EXPENSE_LEASE: '5810',
  INCOME_TAX_PAYABLE: '2300', INCOME_TAX_EXPENSE: '5500', DEFERRED_TAX_ASSET: '1600',
  DEFERRED_TAX_LIABILITY: '2400', DEFERRED_TAX_EXPENSE: '5600', RETAINED_EARNINGS: '3900',
  DIVIDENDS_PAYABLE: '2500', DIVIDENDS_TAX_PAYABLE: '2510', OWNERS_EQUITY: '3000',
  // Leases + Payroll integrity audit (PART 3 — Banking fix): added by 0085
  // (backfill for existing companies) and 0094 (create-or-replaces 0066's
  // seed_new_company_accounting so a BRAND NEW company gets them too — see
  // the "seeds every account code" check below, which reads 0066 + 0094
  // together for exactly this reason).
  NET_PAY_PAYABLE: '2250', LEASE_PAYMENT_CLEARING: '2460',
};

describe('0066 — atomic first-company bootstrap', () => {
  const sql = code('0066');
  const rawSql = raw('0066');

  it('sorts after 0065', () => {
    expect(version('0066')).toBeGreaterThan(version('0065'));
  });

  it('DROPS the old 5-arg create_company_and_become_admin and CREATEs the wider one', () => {
    expect(sql).toContain('drop function if exists public.create_company_and_become_admin(text, public.legal_entity_type, smallint, smallint, text)');
    expect(sql).toContain('create function public.create_company_and_become_admin(');
    expect(sql).not.toContain('create or replace function public.create_company_and_become_admin');
    expect(sql).toContain('p_registration_number      text default null'.replace(/\s+/g, ' '));
    expect(sql).toContain('p_is_vat_registered        boolean default false'.replace(/\s+/g, ' '));
  });

  it('validates the caller: authenticated, no existing company, not superuser, default signup role', () => {
    expect(sql).toContain('if v_uid is null then');
    expect(sql).toContain('if v_existing is not null then');
    expect(sql).toContain("raise exception 'you already belong to a company.'");
    expect(sql).toContain("if v_role = 'superuser' then");
    expect(sql).toContain("if v_role <> 'viewer' then");
  });

  it('links the caller via the scoped bootstrap GUC, cleared immediately after, then VERIFIES the link took', () => {
    const setIdx = sql.indexOf("set_config('vertex.bootstrap_company_id', v_company.id::text, true)");
    const updIdx = sql.indexOf('update public.profiles');
    const clearIdx = sql.indexOf("set_config('vertex.bootstrap_company_id', '', true)");
    const verifyIdx = sql.indexOf('is distinct from v_company.id then');
    expect(setIdx).toBeGreaterThan(-1);
    expect(updIdx).toBeGreaterThan(setIdx);
    expect(clearIdx).toBeGreaterThan(updIdx);
    expect(verifyIdx).toBeGreaterThan(clearIdx);
    expect(sql).toContain('could not link your profile to the new company');
  });

  it('seeds the default accounting foundation via the reusable helper and audits', () => {
    expect(sql).toContain('perform public.seed_new_company_accounting(v_company.id, p_financial_year_end_month, p_financial_year_end_day)');
    expect(sql).toContain('insert into public.audit_log_entries');
    expect(sql).toContain("'created', 'admin', 'company'");
  });

  it('is one function body — a raise anywhere rolls the whole thing back (no BEGIN/COMMIT, no EXCEPTION swallow of the seed)', () => {
    expect(sql).not.toContain('commit;');
    expect(sql).not.toMatch(/exception\s+when\s+others\s+then\s+null/);
  });

  it('grants execute only to authenticated', () => {
    expect(sql).toContain('revoke all on function public.create_company_and_become_admin(text, public.legal_entity_type, smallint, smallint, text, text, text, boolean, text, text, text) from public, anon');
    expect(sql).toContain('grant execute on function public.create_company_and_become_admin(text, public.legal_entity_type, smallint, smallint, text, text, text, boolean, text, text, text) to authenticated');
  });

  describe('seed_new_company_accounting', () => {
    it('is SECURITY DEFINER, locked search_path, not client-callable, idempotency-guarded', () => {
      expect(sql).toContain('create or replace function public.seed_new_company_accounting(');
      expect(sql).toContain('security definer');
      expect(sql).toContain("set search_path to 'public'");
      expect(sql).toContain('already has a chart of accounts');
      expect(sql).toContain('revoke execute on function public.seed_new_company_accounting(uuid, smallint, smallint) from authenticated');
    });

    it('seeds every account code that AccountMapper resolves', () => {
      // 0066 defined seed_new_company_accounting(); 0094 create-or-replaces
      // it to add 2250/2460 (Leases + Payroll integrity audit, PART 3) — a
      // brand new company's actual seeded CoA is whichever migration ran
      // LAST, so "does the current function seed every code" must check
      // both, not 0066 alone (which correctly predates those two codes).
      const currentSeedSql = rawSql + raw('0094');
      const missing = Object.entries(REQUIRED_CODES).filter(([, c]) => !new RegExp(`\\('${c}',`).test(currentSeedSql));
      expect(missing.map(([k]) => k)).toEqual([]);
    });

    it('does NOT seed Office National demo / product-category accounts', () => {
      for (const c of ['4010', '4020', '4030', '4040', '5010', '5020', '5030', '5040']) {
        expect(rawSql).not.toContain(`('${c}',`);
      }
      expect(sql).not.toMatch(/insert into public\.(customers|suppliers|products|invoices|bills|journal_entries|stock_movements)\b/);
    });

    it('derives the financial year from the year-end config (no hardcoded demo dates) and makes 12ish monthly periods', () => {
      expect(sql).toContain('v_year        int := extract(year from current_date)::int'.replace(/\s+/g, ' '));
      expect(sql).toContain('if v_fy_end < current_date then');
      expect(sql).toContain("v_fy_start := (v_fy_end - interval '1 year' + interval '1 day')::date");
      expect(sql).toContain('insert into public.financial_years');
      expect(sql).toContain('insert into public.accounting_periods');
      expect(sql).not.toMatch(/'2026-0[369]-01'|'2027-02-28'/);
    });
  });

  it('creates NO RLS policy and no ALTER TABLE', () => {
    expect(sql).not.toMatch(/create policy|drop policy|alter policy|alter table/);
  });
});

describe('0067 — scoped bootstrap-bypass hardening', () => {
  const sql = code('0067');

  it('sorts after 0066', () => {
    expect(version('0067')).toBeGreaterThan(version('0066'));
  });

  it('the bootstrap branch requires the caller\'s own companyless viewer row → admin of exactly the GUC company', () => {
    expect(sql).toContain('old.id = (select auth.uid())');
    expect(sql).toContain('old.company_id is null');
    expect(sql).toContain("old.role = 'viewer'");
    expect(sql).toContain("new.company_id::text = current_setting('vertex.bootstrap_company_id', true)");
    expect(sql).toContain("new.role = 'admin'");
    expect(sql).toContain('new.is_active is not distinct from old.is_active');
  });

  it('ALSO requires the target company to be empty — no members, no accounts (defence in depth if the GUC were ever set)', () => {
    expect(sql).toContain('not exists (select 1 from public.profiles p where p.company_id = new.company_id)');
    expect(sql).toContain('not exists (select 1 from public.accounts a where a.company_id = new.company_id)');
  });

  it('keeps the 0065 self-lockout raises and the superuser / no-auth.uid() early returns', () => {
    expect(sql).toContain('you cannot change your own administrator access level');
    expect(sql).toContain('you cannot suspend your own account');
    expect(sql).toContain('if (select auth.uid()) is null then return new');
    expect(sql).toContain("if public.get_my_role() = 'superuser' then return new");
  });

  it('re-applies the anon/authenticated EXECUTE revokes on the trigger function', () => {
    expect(sql).toContain('revoke execute on function public.protect_profile_privileged_columns() from anon');
    expect(sql).toContain('revoke execute on function public.protect_profile_privileged_columns() from authenticated');
  });
});
