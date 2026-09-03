import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guard for the Increment-1 discovery (see this barrel's own
 * doc comment): the production `taxRateService` singleton was wired to
 * `MockTaxRateRepository` (hand-typed ids like `tax_std_v2`) while every
 * real product / document carries a Supabase UUID `tax_rate_id`. The two
 * id spaces never intersect, so `getTaxRateLabel()` and every "pick a
 * rate" dropdown rendered "Unknown tax rate" against real data in the
 * deployed app.
 *
 * This test is deliberately source-level: importing the barrel would
 * touch the live Supabase client. It asserts the wiring, not behaviour —
 * `getTaxRateLabel`'s loading/unknown behaviour is covered separately in
 * src/features/inventory/constants.test.ts.
 */
const BARREL = resolve(process.cwd(), 'src/features/tax/services/index.ts');

describe('production taxRateService wiring', () => {
  const src = readFileSync(BARREL, 'utf8');

  it('constructs the singleton with SupabaseTaxRateRepository', () => {
    expect(src).toMatch(/export const taxRateService = new TaxRateService\(\s*new SupabaseTaxRateRepository\(/);
  });

  it('never wires the production singleton to a Mock repository', () => {
    expect(src).not.toMatch(/export const taxRateService = new TaxRateService\(\s*new Mock/);
  });

  it('still re-exports MockTaxRateRepository for isolated service tests', () => {
    expect(src).toMatch(/export \{ MockTaxRateRepository \}/);
  });
});

describe('no other production service barrel is wired to a Mock repository', () => {
  // The one deliberate exception — FIFO stock lots, a not-yet-active
  // valuation path with no Supabase repository (reported, not fixed, in
  // Increment 2's Mock-repository audit).
  const ALLOWED = ['src/features/inventory/repositories/instances.ts'];

  it('lists every production `new Mock*Repository()` occurrence for review', () => {
    // This is an inventory, not an assertion that must be zero — it fails
    // only if a NEW unreviewed Mock wiring appears outside the allow-list.
    const roots = [
      'src/features/sales/services/index.ts',
      'src/features/purchases/services/index.ts',
      'src/features/accounting/services/index.ts',
      'src/features/banking/services/index.ts',
      'src/features/assets/repositories/instances.ts',
      'src/features/employees/repositories/instances.ts',
      'src/features/leases/repositories/instances.ts',
      'src/features/inventory/repositories/instances.ts',
    ];
    for (const file of roots) {
      const contents = readFileSync(resolve(process.cwd(), file), 'utf8');
      const mockWirings = contents.match(/=\s*new Mock[A-Za-z]*Repository\s*\(/g) ?? [];
      if (mockWirings.length > 0) {
        expect(ALLOWED, `${file} constructs a Mock repository — was this reviewed?`).toContain(file);
      }
    }
  });
});
