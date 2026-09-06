import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ENTITLEMENT_KEYS, PLAN_CATALOGUE, type EntitlementKey } from './entitlements';

/**
 * BLOCK 3 (2026-09-06) — the client-side `PLAN_CATALOGUE` / `ENTITLEMENT_KEYS`
 * are a mirror of the migration 0068 seed (the DB is the source of truth).
 * This test parses the APPLIED migration and fails if they drift, so the
 * public pricing page and the app can never disagree.
 */

const MIG = (() => {
  const dir = join(process.cwd(), 'supabase', 'migrations');
  const file = readdirSync(dir).find((n) => n.includes('__0068_'))!;
  return readFileSync(join(dir, file), 'utf8');
})();

// feature keys seeded into subscription_features
const seededFeatureKeys = [...MIG.matchAll(/\('([a-z_]+)',\s+'[^']+',\s+'[^']*',\s+(true|false),\s+\d+\)/g)].map((m) => m[1]);
// (plan_code, feature_key) pairs seeded into plan_features
const seededPlanGrants = [...MIG.matchAll(/\('(starter|growth|premium)','([a-z_]+)'\)/g)].map((m) => [m[1], m[2]] as [string, string]);
// plan prices
const seededPlans = [...MIG.matchAll(/\('(starter|growth|premium)',\s*'([^']+)',\s*'[^']+',\s*(\d+),\s*(\d+),\s*\d+\)/g)].map((m) => ({
  code: m[1],
  name: m[2],
  priceCents: Number(m[3]),
  includedUsers: Number(m[4]),
}));

describe('0068 subscription catalogue ↔ client mirror', () => {
  it('seeds every feature key the client knows about, and vice versa', () => {
    expect([...seededFeatureKeys].sort()).toEqual([...ENTITLEMENT_KEYS].sort());
  });

  it('the three plans and their prices match the client catalogue', () => {
    for (const plan of PLAN_CATALOGUE) {
      const seeded = seededPlans.find((p) => p.code === plan.code);
      expect(seeded, `plan ${plan.code} in 0068`).toBeTruthy();
      expect(seeded!.priceCents).toBe(plan.priceCents);
      expect(seeded!.includedUsers).toBe(plan.includedUsers);
    }
    expect(seededPlans).toHaveLength(3);
  });

  it('each plan unlocks exactly the feature keys the client mirror claims', () => {
    for (const plan of PLAN_CATALOGUE) {
      const seededForPlan = seededPlanGrants.filter(([c]) => c === plan.code).map(([, f]) => f).sort();
      expect(seededForPlan, `${plan.code} plan_features`).toEqual([...plan.features].sort());
    }
  });

  it('no plan grant references a core feature (core is implicit)', () => {
    const coreKeys = ['dashboard', 'customers', 'suppliers', 'user_management', 'settings'];
    for (const [, f] of seededPlanGrants) expect(coreKeys).not.toContain(f);
  });

  it('installs the resolver + inventory enforcement scaffold', () => {
    const sql = MIG.replace(/\s+/g, ' ').toLowerCase();
    expect(sql).toContain('create or replace function public.company_entitlements() returns setof text');
    expect(sql).toContain('security definer set search_path to \'public\'');
    expect(sql).toContain('create or replace function public.require_entitlement(p_key text)');
    // a past_due / suspended subscription drops to core-only
    expect(sql).toContain("where sub.status in ('active', 'trialing')");
    // inventory write triggers
    for (const t of ['products_entitlement', 'warehouses_entitlement', 'stock_movements_entitlement']) {
      expect(sql).toContain(`create trigger ${t} before insert`);
    }
    expect(sql).toContain("perform public.require_entitlement('inventory')");
    // resolver is callable by the frontend, not anon
    expect(sql).toContain('grant execute on function public.company_entitlements() to authenticated');
    expect(sql).toContain('revoke all on function public.company_entitlements() from public, anon');
  });

  it('touches no accounting engine and creates no journal / GL rows', () => {
    const sql = MIG.toLowerCase();
    expect(sql).not.toMatch(/insert into (public\.)?(journal_entries|journal_lines|accounts)\b/);
    expect(sql).not.toContain('create or replace function public.post_inventory_transaction');
    expect(sql).not.toContain('create or replace function public.create_journal_entry_with_lines');
  });

  it('DOWNGRADE SAFETY — no destructive statement against any business/accounting table', () => {
    const sql = MIG.toLowerCase();
    // the migration only ever DELETEs from / cascades among its OWN new tables
    expect(sql).not.toMatch(/delete from (public\.)?(products|warehouses|stock_movements|invoices|bills|journal_entries|journal_lines|customers|suppliers|accounts)\b/);
    expect(sql).not.toMatch(/drop table[^;]*\b(products|invoices|stock_movements|accounts)\b/);
    expect(sql).not.toMatch(/truncate/);
    // any `on delete cascade` in this file is FROM companies/plans/features INTO the new subscription tables — never the reverse
    for (const m of sql.matchAll(/references public\.(\w+)[^)]*on delete cascade/g)) {
      expect(['companies', 'subscription_plans', 'subscription_features', 'subscriptions']).toContain(m[1]);
    }
  });
});

describe('entitlements client helpers', () => {
  it('every plan feature list is a subset of the known keys', () => {
    for (const plan of PLAN_CATALOGUE) {
      for (const f of plan.features) expect(ENTITLEMENT_KEYS).toContain(f as EntitlementKey);
    }
  });

  it('plans are cumulative: starter ⊂ growth ⊂ premium', () => {
    const [starter, growth, premium] = PLAN_CATALOGUE;
    for (const f of starter.features) expect(growth.features).toContain(f);
    for (const f of growth.features) expect(premium.features).toContain(f);
  });
});
