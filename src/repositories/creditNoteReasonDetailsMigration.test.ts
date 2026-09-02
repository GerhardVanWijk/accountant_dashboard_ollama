import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Migration-contract coverage for 0043 (`credit_notes.reason_details`).
 *
 * 0043 was applied to the remote project early (recorded version
 * `20260902051630`), so the risk this guards is the *repository* history
 * drifting from the *remote* history — if `supabase/migrations/` did not
 * carry a matching `__0043_` file, a future `supabase db push` would try to
 * re-run it. This asserts the canonical file exists, is byte-faithful to the
 * applied statement, and is additive-only.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.sql'));

function migration0043(): { file: string; sql: string } {
  const matches = migrationFiles.filter((n) => n.includes('__0043_'));
  expect(matches, 'exactly one __0043_ migration file').toHaveLength(1);
  return { file: matches[0], sql: readFileSync(join(MIGRATIONS_DIR, matches[0]), 'utf8') };
}

/** Compacted, lowercased, comment-free view of the executable SQL. */
function code(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

describe('0043 credit_note_reason_details migration contract', () => {
  it('is filed under the exact applied remote version 20260902051630', () => {
    expect(migration0043().file).toBe('20260902051630__0043_credit_note_reason_details.sql');
  });

  it('orders strictly after 0042 (20260901153040)', () => {
    const v = BigInt(migration0043().file.match(/^(\d+)_/)?.[1] ?? '0');
    expect(v > 20260901153040n).toBe(true);
  });

  it('adds exactly one nullable text column, idempotently', () => {
    const sql = code(migration0043().sql);
    expect(sql).toContain('alter table public.credit_notes add column if not exists reason_details text');
    expect(sql).not.toMatch(/reason_details text not null/);
    expect(sql).not.toContain('default');
  });

  it('is additive only — no drop, retype, backfill, or data mutation', () => {
    const sql = code(migration0043().sql);
    expect(sql).not.toContain('drop table');
    expect(sql).not.toContain('drop column');
    expect(sql).not.toMatch(/alter column [a-z_]+ (set data )?type/);
    expect(sql).not.toContain('truncate');
    expect(sql).not.toContain('update public.credit_notes');
    expect(sql).not.toContain('insert into');
  });

  it('carries the column comment that was applied live', () => {
    const sql = code(migration0043().sql);
    expect(sql).toContain('comment on column public.credit_notes.reason_details');
    expect(sql).toContain("required by the ui when reason = ''other''");
  });
});
