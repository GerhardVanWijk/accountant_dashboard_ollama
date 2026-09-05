import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Phase 9B — migration-contract coverage for 0037-0042 (the normalized
 * document-line tables + exact-only backfill). Same static-SQL approach as
 * `src/features/inventory/inventoryMigrations.test.ts` — asserts the shape
 * of the authored, NOT-YET-APPLIED migration files so a regression in them
 * fails the suite before anyone applies them.
 *
 * `code()` strips `-- …` comment lines before matching, because these
 * migrations' header comments deliberately discuss `line_items`,
 * `unit_cost`, `stock_movements` etc. to explain what they do NOT touch —
 * the contract is about the executable SQL, not the prose.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();

function logicalMigration(logicalNumber: string): { file: string; sql: string } {
  const matches = migrationFiles.filter((name) => name.includes(`__${logicalNumber}_`));
  expect(matches, `logical migration ${logicalNumber}`).toHaveLength(1);
  const file = matches[0];
  return { file, sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8') };
}

/** Compacted, lowercased, comment-free view of a migration's executable SQL. */
function code(logicalNumber: string): string {
  return logicalMigration(logicalNumber)
    .sql.split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function version(n: string): bigint {
  return BigInt(logicalMigration(n).file.match(/^(\d+)_/)?.[1] ?? '0');
}

const LINE_TABLES = ['invoice_lines', 'bill_lines', 'purchase_order_lines', 'credit_note_lines'] as const;
const LINE_MIGRATIONS = { invoice_lines: '0038', bill_lines: '0039', purchase_order_lines: '0040', credit_note_lines: '0041' } as const;
const HEADER_FK = {
  invoice_lines: ['invoices', 'invoice_id'],
  bill_lines: ['bills', 'bill_id'],
  purchase_order_lines: ['purchase_orders', 'purchase_order_id'],
  credit_note_lines: ['credit_notes', 'credit_note_id'],
} as const;

describe('Phase 9B normalized-line migration contract (0037-0042)', () => {
  it('orders logical migrations 0037-0042 strictly after 0036, ascending', () => {
    const versions = ['0036', '0037', '0038', '0039', '0040', '0041', '0042'].map(version);
    expect(versions).toEqual([...versions].sort((a, b) => (a < b ? -1 : 1)));
    for (const n of ['0037', '0038', '0039', '0040', '0041', '0042']) {
      expect(logicalMigration(n).file).toMatch(/^\d{14}__(?:003[7-9]|004[0-2])_/);
    }
  });

  it('0037 (prerequisite candidate keys) precedes every normalized line table + backfill', () => {
    for (const n of ['0038', '0039', '0040', '0041', '0042']) {
      expect(version('0037') < version(n), `0037 precedes ${n}`).toBe(true);
    }
    const sql = code('0037');
    expect(sql).toContain('alter table public.invoices add constraint invoices_company_id_id_key unique (company_id, id)');
    expect(sql).toContain('alter table public.credit_notes add constraint credit_notes_company_id_id_key unique (company_id, id)');
    expect(sql).not.toContain('drop table');
    expect(sql).not.toContain('drop column');
    expect(sql).not.toMatch(/alter column [a-z_]+ (set data )?type/);
  });

  it('0038 (invoice_lines) precedes 0041 (credit_note_lines) — 0041 FKs to invoice_lines', () => {
    expect(version('0038') < version('0041')).toBe(true);
    expect(code('0041')).toContain(
      'foreign key (company_id, original_invoice_line_id) references public.invoice_lines(company_id, id)',
    );
  });

  for (const table of LINE_TABLES) {
    describe(`${table} (migration ${LINE_MIGRATIONS[table]})`, () => {
      const sql = () => code(LINE_MIGRATIONS[table]);

      it('creates the table', () => {
        expect(sql()).toContain(`create table public.${table} (`);
      });

      it('preserves the jsonb line id as its own primary key (no synthetic key)', () => {
        const ddl = sql();
        expect(ddl).toContain('id uuid primary key');
        expect(ddl).not.toContain('id uuid primary key default');
        expect(ddl).not.toContain('bigserial');
        expect(ddl).not.toContain('generated always as identity');
      });

      it('keeps product_id nullable (no NOT NULL, no FK-forced product)', () => {
        const ddl = sql();
        expect(ddl).toContain('product_id uuid,');
        expect(ddl).not.toMatch(/product_id uuid not null/);
      });

      it('carries the composite, company-safe FKs (tenant-scoped) + its own candidate key', () => {
        const ddl = sql();
        const [header, fk] = HEADER_FK[table];
        expect(ddl).toContain(`foreign key (company_id, ${fk}) references public.${header}(company_id, id) on delete cascade`);
        expect(ddl).toContain('foreign key (company_id, product_id) references public.products(company_id, id)');
        expect(ddl).toContain('foreign key (company_id, warehouse_id) references public.warehouses(company_id, id)');
        expect(ddl).toContain('foreign key (company_id, tax_rate_id) references public.tax_rates(company_id, id)');
        expect(ddl).toContain('unique (company_id, id)');
      });

      it('enables RLS with the coarse own-company policy', () => {
        const ddl = sql();
        expect(ddl).toContain(`alter table public.${table} enable row level security`);
        expect(ddl).toContain(`create policy ${table}_all_own_company on public.${table} for all to authenticated`);
        expect(ddl).toContain(
          'using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()))',
        );
      });

      it('is additive only — never drops/retypes an existing object, never touches line_items jsonb', () => {
        const ddl = sql();
        expect(ddl).not.toContain('drop table');
        expect(ddl).not.toContain('drop column');
        expect(ddl).not.toMatch(/alter column [a-z_]+ (set data )?type/);
        expect(ddl).not.toContain('line_items');
        expect(ddl).not.toContain('truncate');
      });
    });
  }

  it('bill_lines adds fixed_asset_details, mutually exclusive with product_id', () => {
    const ddl = code('0039');
    expect(ddl).toContain('fixed_asset_details jsonb');
    expect(ddl).toContain('check (fixed_asset_details is null or product_id is null)');
  });

  it('credit_note_lines adds original_invoice_line_id (nullable, composite FK to invoice_lines)', () => {
    const ddl = code('0041');
    expect(ddl).toContain('original_invoice_line_id uuid,');
    expect(ddl).not.toMatch(/original_invoice_line_id uuid not null/);
  });

  it('no migration 0037-0042 drops a table/column, retypes a column, or truncates', () => {
    for (const n of ['0037', '0038', '0039', '0040', '0041', '0042']) {
      const ddl = code(n);
      expect(ddl, `${n} drops a table`).not.toContain('drop table');
      expect(ddl, `${n} drops a column`).not.toContain('drop column');
      expect(ddl, `${n} retypes a column`).not.toMatch(/alter column [a-z_]+ (set data )?type/);
      expect(ddl, `${n} truncates`).not.toContain('truncate');
    }
  });

  describe('0042 exact-only backfill', () => {
    const sql = () => code('0042');

    it('projects every jsonb line into all four normalized tables', () => {
      const ddl = sql();
      for (const table of LINE_TABLES) {
        expect(ddl).toContain(`insert into public.${table}`);
      }
    });

    it('preserves each jsonb line id verbatim and is idempotent (never regenerates an id)', () => {
      const ddl = sql();
      expect(ddl).toContain("(l->>'id')::uuid");
      expect(ddl).not.toContain('gen_random_uuid');
      expect(ddl).not.toContain('uuid_generate_v4');
      expect((ddl.match(/on conflict \(id\) do nothing/g) ?? []).length).toBeGreaterThanOrEqual(4);
    });

    it('preserves line ordering from the jsonb array position (with ordinality)', () => {
      expect(sql()).toContain('with ordinality as t(l, ord)');
    });

    it('resolves each ref column exactly or writes NULL — never guesses', () => {
      const ddl = sql();
      expect(ddl).toContain("exists (select 1 from public.products p where p.id = (l->>'productid')::uuid and p.company_id");
      expect(ddl).toContain("exists (select 1 from public.warehouses w where w.id = (l->>'warehouseid')::uuid and w.company_id");
      expect(ddl).toContain("exists (select 1 from public.tax_rates t where t.id = (l->>'taxrateid')::uuid and t.company_id");
      expect(ddl).toContain("exists (select 1 from public.invoice_lines il where il.id = (l->>'originalinvoicelineid')::uuid");
    });

    it('populates AND reports unresolved products, warehouses, tax rates, and original invoice lines', () => {
      const ddl = sql();
      const vars = ['v_orphaned_products', 'v_orphaned_warehouses', 'v_orphaned_tax_rates', 'v_orphaned_original_invoice_lines'];
      for (const v of vars) {
        expect(ddl, `${v} declared`).toContain(`${v} integer`);
        expect(ddl, `${v} populated (assigned via INTO)`).toMatch(new RegExp(`into[^;]*\\b${v}\\b`));
        expect(ddl, `${v} surfaced in a raise notice`).toMatch(new RegExp(`raise notice[^;]*\\b${v}\\b`));
      }
      expect(ddl, 'a pre-backfill notice').toContain('normalized_line_backfill (pre)');
      expect(ddl, 'a post-backfill notice').toContain('normalized_line_backfill (post)');
    });

    it('fabricates no historical WAC / cost / stock-movement data', () => {
      const ddl = sql();
      expect(ddl).not.toContain('unit_cost');
      expect(ddl).not.toContain('total_cost');
      expect(ddl).not.toContain('stock_movements');
      expect(ddl).not.toContain('cost_price');
      expect(ddl).not.toContain('inventory_transaction');
      expect(ddl).not.toMatch(/\bwac\b/);
    });

    it('never mutates or drops the authoritative jsonb source', () => {
      const ddl = sql();
      expect(ddl).not.toContain('drop column');
      expect(ddl).not.toContain('truncate');
      for (const header of ['invoices', 'bills', 'purchase_orders', 'credit_notes']) {
        expect(ddl, `no UPDATE of ${header}`).not.toContain(`update public.${header}`);
        expect(ddl, `no DELETE from ${header}`).not.toContain(`delete from public.${header}`);
      }
    });

    it('skips a zero/negative-quantity legacy line rather than coercing it', () => {
      expect(sql()).toContain("coalesce(l->>'quantity','0')::numeric > 0");
    });
  });

  it('the NORMALIZED_DOCUMENT_LINES feature flag is ACTIVATED (2026-09-05, migrations 0037-0042 + 0062 + 0063 live, parity clean)', () => {
    const flag = readFileSync(join(process.cwd(), 'src', 'config', 'featureFlags.ts'), 'utf8');
    expect(flag).toMatch(/export const NORMALIZED_DOCUMENT_LINES_ENABLED\s*=\s*true\s*;/);
  });
});
