import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();

function logicalMigration(logicalNumber: string): { file: string; sql: string } {
  const matches = migrationFiles.filter((name) => name.includes(`__${logicalNumber}_`));
  expect(matches, `logical migration ${logicalNumber}`).toHaveLength(1);
  const file = matches[0];
  return { file, sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8') };
}

function compact(sql: string): string {
  return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('inventory migration contract', () => {
  it('orders timestamped logical migrations 0021-0030 strictly after 0020', () => {
    const migration0020 = logicalMigration('0020');
    const version0020 = BigInt(migration0020.file.match(/^(\d+)_/)?.[1] ?? '0');
    const inventoryVersions = Array.from({ length: 10 }, (_, index) => {
      const logical = String(21 + index).padStart(4, '0');
      const migration = logicalMigration(logical);
      expect(migration.file).toMatch(/^\d{14}__00(?:2[1-9]|30)_/);
      return BigInt(migration.file.match(/^(\d+)_/)?.[1] ?? '0');
    });

    expect(inventoryVersions.every((version) => version > version0020)).toBe(true);
    expect(inventoryVersions).toEqual([...inventoryVersions].sort((a, b) => (a < b ? -1 : 1)));
  });

  it('isolates stock movement enum additions before later inventory DDL', () => {
    const migration0021 = compact(logicalMigration('0021').sql);
    expect(migration0021).toContain('alter type public.stock_movement_type add value');
    expect(migration0021).not.toContain('create table');
    expect(migration0021).not.toContain('alter table');

    for (const logical of ['0022', '0023', '0024', '0025', '0026', '0027', '0028', '0029', '0030']) {
      expect(compact(logicalMigration(logical).sql)).not.toContain(
        'alter type public.stock_movement_type add value',
      );
    }
  });

  it('uses five normalized canonical line tables and no document line_items JSONB', () => {
    const ddl = compact(
      ['0027', '0028', '0029'].map((logical) => logicalMigration(logical).sql).join('\n'),
    );
    const lineTables = [
      'stock_adjustment_lines',
      'stock_transfer_lines',
      'stock_take_lines',
      'opening_stock_batch_lines',
      'supplier_return_lines',
    ];

    for (const table of lineTables) {
      expect(ddl).toContain(`create table public.${table} (`);
      expect(ddl).toContain(`alter table public.${table} enable row level security`);
    }
    expect(ddl).not.toMatch(/\bline_items\s+jsonb\b/);
  });

  it('keeps source-line traceability UUID-based', () => {
    const migration0022 = compact(logicalMigration('0022').sql);
    const migration0029 = compact(logicalMigration('0029').sql);
    expect(migration0022).toContain('add column source_document_line_id uuid');
    expect(migration0029).toContain('source_document_line_id uuid');
    expect(migration0029).toContain('source_stock_movement_id uuid');
  });

  it('backs every inventory composite foreign key target with a preceding candidate key', () => {
    const through0029 = compact(
      ['0022', '0027', '0028', '0029'].map((logical) => logicalMigration(logical).sql).join('\n'),
    );
    const targets = [
      'stock_movements',
      'products',
      'warehouses',
      'journal_entries',
      'stock_adjustments',
      'stock_transfers',
      'stock_takes',
      'accounts',
      'suppliers',
      'bills',
      'purchase_orders',
      'tax_rates',
      'opening_stock_batches',
      'supplier_returns',
    ];

    for (const table of targets) {
      const alteredKey = `alter table public.${table} add constraint ${table}_company_id_id_key unique (company_id, id)`;
      const inlineTablePattern = new RegExp(
        `create table public\\.${table} \\(.*?unique \\(company_id, id\\)`,
      );
      expect(
        through0029.includes(alteredKey) || inlineTablePattern.test(through0029),
        `${table} must expose UNIQUE (company_id, id)`,
      ).toBe(true);
    }

    expect(through0029).toContain(
      'foreign key (company_id, source_stock_movement_id) references public.stock_movements(company_id, id)',
    );
    // The reversal self-reference on the append-only ledger is also tenant-scoped.
    expect(compact(logicalMigration('0022').sql)).toContain(
      'foreign key (company_id, reversal_of_movement_id) references public.stock_movements(company_id, id)',
    );
  });

  const DOCUMENT_TABLES = [
    'stock_adjustments',
    'stock_adjustment_lines',
    'stock_transfers',
    'stock_transfer_lines',
    'stock_takes',
    'stock_take_lines',
    'opening_stock_batches',
    'opening_stock_batch_lines',
    'supplier_returns',
    'supplier_return_lines',
  ];

  it('secures every new table with a coarse company-tenant policy inside its own migration (no RLS-enabled/no-policy boundary)', () => {
    for (const logical of ['0027', '0028', '0029']) {
      const sql = compact(logicalMigration(logical).sql);
      const created = [...sql.matchAll(/create table public\.([a-z_]+) \(/g)].map((m) => m[1]);
      for (const table of created) {
        expect(sql, `${table} RLS enabled in ${logical}`).toContain(
          `alter table public.${table} enable row level security`,
        );
        expect(sql, `${table} has a policy in ${logical}`).toContain(
          `create policy ${table}_all_own_company on public.${table} for all to authenticated`,
        );
        expect(sql).toContain(
          `using (company_id = (select public.get_my_company_id())) with check (company_id = (select public.get_my_company_id()))`
            .replace(/\s+/g, ' '),
        );
      }
    }
  });

  it('does NOT introduce inventory-only role-aware DB authorization', () => {
    const inventorySql = compact(
      ['0022', '0027', '0028', '0029', '0030'].map((l) => logicalMigration(l).sql).join('\n'),
    );
    expect(inventorySql).not.toContain('user_has_permission');
    expect(inventorySql).not.toContain('security definer');
    // No per-operation policies gated on status / permissions on the document tables.
    for (const table of DOCUMENT_TABLES) {
      for (const op of ['select', 'insert', 'update', 'delete']) {
        expect(inventorySql).not.toContain(`create policy ${table}_${op} `);
      }
    }
  });

  it('0030 only seeds permissions + role grants — no policies, no functions', () => {
    const sql = compact(logicalMigration('0030').sql);
    expect(sql).toContain('insert into public.permissions (feature, action)');
    expect(sql).toContain('insert into public.role_permissions');
    expect(sql).toContain('on conflict (feature, action) do nothing');
    expect(sql).toContain('on conflict (role_id, permission_id) do nothing');
    expect(sql).not.toContain('create function');
    expect(sql).not.toContain('create policy');
  });

  // ── Phase 3C migration package (0033-0036) ────────────────────────────────
  describe('Phase 3C package', () => {
    it('orders 0033-0036 strictly after 0032', () => {
      const v = (n: string) => BigInt(logicalMigration(n).file.match(/^(\d+)_/)?.[1] ?? '0');
      const versions = ['0032', '0033', '0034', '0035', '0036'].map(v);
      expect(versions).toEqual([...versions].sort((a, b) => (a < b ? -1 : 1)));
      for (const n of ['0033', '0034', '0035', '0036']) {
        expect(logicalMigration(n).file).toMatch(/^\d{14}__003[3-6]_/);
      }
    });

    it('0033 — journal number allocator: counter table + atomic allocate fn + one-time high-water seed', () => {
      const sql = compact(logicalMigration('0033').sql);
      expect(sql).toContain('create table public.journal_number_counters');
      expect(sql).toContain('alter table public.journal_number_counters enable row level security');
      expect(sql).toContain(
        'create policy journal_number_counters_all_own_company on public.journal_number_counters for all to authenticated',
      );
      expect(sql).toContain('create or replace function public.allocate_journal_number(p_company_id uuid)');
      // atomic allocation via UPDATE ... RETURNING (row lock), not count(*)
      expect(sql).toContain('update public.journal_number_counters set next_value = next_value + 1');
      expect(sql).toContain('returning next_value - 1 into v_ordinal');
      // the allocate fn body never counts rows
      const allocBody = sql.slice(
        sql.indexOf('create or replace function public.allocate_journal_number'),
        sql.indexOf('revoke all on function public.allocate_journal_number'),
      );
      expect(allocBody).not.toMatch(/count\(\*\)/);
      // seed from the highest EXISTING JE-<n> suffix, ignoring malformed numbers
      expect(sql).toContain("'^je-0*([0-9]+)$'");
      expect(sql).toContain("je.entry_number ~ '^je-[0-9]+$'");
      // security
      expect(sql).toContain('security invoker');
      expect(sql).not.toContain('security definer');
      expect(sql).toContain("set search_path to 'public'");
      expect(sql).toContain('revoke all on function public.allocate_journal_number(uuid) from public, anon');
      expect(sql).toContain('grant execute on function public.allocate_journal_number(uuid) to authenticated');
      // create_journal_entry_with_lines now allocates when p_entry_number is null/''
      expect(sql).toContain('create or replace function public.create_journal_entry_with_lines');
      expect(sql).toContain('v_entry_number := public.allocate_journal_number(p_company_id)');
    });

    it('0034 — 5060 Purchase Price Variance, idempotent, additive, distinct from 5050', () => {
      const sql = compact(logicalMigration('0034').sql);
      expect(sql).toContain("'5060', 'purchase price variance', 'expense', 'debit'");
      expect(sql).toContain('insert into public.accounts');
      expect(sql).toContain('where not exists');
      expect(sql).toContain("a.code = v.code");
      // no business-row mutation beyond the seed
      expect(sql).not.toContain('update public.');
      expect(sql).not.toContain('delete from public.');
    });

    it('0035 — round-after-sum + allocator in BOTH RPCs, security preserved', () => {
      const sql = compact(logicalMigration('0035').sql);
      expect(sql).toContain('create or replace function public.post_inventory_transaction');
      expect(sql).toContain('create or replace function public.reverse_inventory_transaction');
      // raw value into the JE lines; the per-account CTE does the single round(sum())
      expect(sql).toContain('v_movement_value_raw := abs(v_qty) * v_movement_cost');
      expect(sql).toContain("'debit', v_movement_value_raw");
      expect(sql).toContain('round(coalesce(sum((l->>\'debit\')::numeric),0),2)');
      // allocator, not the inline count(*)+1 JE numbering
      expect(sql).toContain('v_je_number := public.allocate_journal_number(v_company)');
      expect(sql).not.toMatch(/into v_je_number\s+from public\.journal_entries where company_id = v_company/);
      // idempotent branch of BOTH RPCs returns movement_ids + warnings
      const idempotentReturns = sql.match(
        /return jsonb_build_object\('idempotent', true[^;]*'movement_ids', to_jsonb\(v_existing\.movement_ids\)[^;]*'warnings'/g,
      );
      expect(idempotentReturns).toHaveLength(2);
      // security unchanged
      expect(sql).not.toContain('security definer');
      expect(sql).toContain("set search_path to 'public'");
      expect(sql).toContain('grant execute on function public.post_inventory_transaction');
      expect(sql).toContain('grant execute on function public.reverse_inventory_transaction');
      expect(sql).toContain('from public, anon');
    });

    it('0036 — atomic freeze_stock_take: locks scoped products, replaces lines, draft-only', () => {
      const sql = compact(logicalMigration('0036').sql);
      expect(sql).toContain('create or replace function public.freeze_stock_take(p_stock_take_id uuid)');
      expect(sql).toContain('for update'); // locks the scoped product rows
      expect(sql).toContain('order by p.id');
      expect(sql).toContain('delete from public.stock_take_lines');
      expect(sql).toContain('insert into public.stock_take_lines');
      // authoritative snapshot: balance + product WAC, not caller values
      expect(sql).toContain('coalesce(sb.quantity_on_hand, 0)');
      expect(sql).toContain('p.cost_price');
      expect(sql).toContain("v_take.status <> 'draft'");
      expect(sql).toContain('v_take.frozen_at is not null');
      // security
      expect(sql).not.toContain('security definer');
      expect(sql).toContain("set search_path to 'public'");
      expect(sql).toContain('revoke all on function public.freeze_stock_take(uuid) from public, anon');
      expect(sql).toContain('grant execute on function public.freeze_stock_take(uuid) to authenticated');
    });

    it('the whole 3C package introduces no SECURITY DEFINER and no role-aware DB authorization', () => {
      const all = compact(['0033', '0034', '0035', '0036'].map((n) => logicalMigration(n).sql).join('\n'));
      expect(all).not.toContain('security definer');
      expect(all).not.toContain('user_has_permission');
    });
  });

  it('keeps structural CHECK constraints but no duplicated accounting-formula CHECKs', () => {
    const ddl = compact(
      ['0027', '0028', '0029'].map((l) => logicalMigration(l).sql).join('\n'),
    );
    // structural — kept
    expect(ddl).toContain('check (line_number > 0)');
    expect(ddl).toContain('check (quantity_delta <> 0)');
    expect(ddl).toContain('check (quantity > 0)');
    expect(ddl).toContain('check (from_warehouse_id <> to_warehouse_id)');
    expect(ddl).toContain("check (scope in ('all', 'category', 'items'))");
    // computed-formula — removed (one authoritative calculation contract in the service layer)
    expect(ddl).not.toMatch(/check\s*\([^)]*=\s*round\(/);
    expect(ddl).not.toContain('check (total = subtotal + tax_total)');
    expect(ddl).not.toContain('variance_qty = counted_qty - expected_qty');
  });
});
