import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * SQL-contract cover for migration 0073 (Global Notifications) + its 0073b
 * follow-up. Live behaviour — the engine deriving real conditions for both
 * Vertex companies, dedupe (re-run opens 0 / resolves 0), auto-resolve of a
 * cleared condition, event_seq bump + read-state invalidation on a
 * returning condition, cross-company isolation of the feed, mark-all-read —
 * was proven with rollback-safe / self-cleaning sessions against the live
 * project (see docs/NOTIFICATIONS.md).
 */

const dir = join(process.cwd(), 'supabase', 'migrations');
const file = (label: string) => readdirSync(dir).find((n) => n.includes(`__${label}_`))!;
const load = (label: string) =>
  readFileSync(join(dir, file(label)), 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

const sql = load('0073');
const sqlB = load('0073b');

describe('0073 — global notifications', () => {
  it('sorts after 0072', () => {
    const v = (l: string) => BigInt(file(l).split('__')[0]);
    expect(v('0073')).toBeGreaterThan(v('0072'));
    expect(v('0073b')).toBeGreaterThan(v('0073'));
  });

  it('notifications table is dedupe-keyed and lifecycle-aware', () => {
    expect(sql).toContain('create table public.notifications');
    expect(sql).toContain('unique (company_id, dedupe_key)');
    expect(sql).toContain("status text not null default 'open' check (status in ('open','resolved'))");
    expect(sql).toContain('event_seq integer not null default 1');
    expect(sql).toContain("severity text not null check (severity in ('critical','warning','info'))");
  });

  it('notifications has exactly one RLS policy and it is SELECT-only (no client writes)', () => {
    expect(sql).toContain('alter table public.notifications enable row level security');
    expect(sql).toContain('create policy notifications_select on public.notifications for select to authenticated');
    // guard: the observability block asserts the single-policy invariant
    expect(sql).toContain("tablename = 'notifications') <> 1");
    // no insert/update/delete policy for the table
    expect(sql).not.toMatch(/create policy \w+ on public\.notifications\s+for (insert|update|delete)/);
  });

  it('visibility respects company + role + permission + entitlement targeting', () => {
    expect(sql).toContain('create or replace function public.notification_visible');
    expect(sql).toContain('p_company_id = (select public.get_my_company_id())');
    expect(sql).toContain("(select public.get_my_role())::text = any (p_target_roles)");
    expect(sql).toContain('public.company_has_entitlement(p_target_entitlement)');
    expect(sql).toContain('join public.role_permissions rp on rp.role_id = ur.role_id and rp.granted');
  });

  it('engine is deterministic, company-scoped, and auto-resolves cleared conditions', () => {
    expect(sql).toContain('create or replace function public.evaluate_company_notifications(p_company_id uuid default null)');
    expect(sql).toContain("only a superuser may evaluate another company");
    expect(sql).toContain("set status = 'resolved', resolved_at = now(), resolution = 'condition_cleared'");
    expect(sql).toContain('not exists (select 1 from _active a where a.dedupe_key = n.dedupe_key)');
  });

  it('re-opening a resolved condition bumps event_seq (a new lifecycle)', () => {
    expect(sql).toContain('event_seq = case when n.status = \'resolved\' then n.event_seq + 1 else n.event_seq end');
  });

  it('covers the required attention-worthy condition families and NOT routine activity', () => {
    for (const key of [
      'document_expiry:', 'bank_reconciliation:', 'subscription_status:', 'access_denied_spike:',
      'period_open_overdue:', 'receivables_overdue:', 'inventory_negative_stock:', 'inventory_reorder:', 'budget_variance:',
    ]) {
      expect(sql).toContain(key);
    }
    // the engine must never key off routine documents
    expect(sql).not.toMatch(/from public\.(bank_transactions|receipts|journal_entries) [a-z]+ where [a-z]+\.company_id = v_company\b(?![^;]*status = 'open')/);
  });

  it('read/mark/mute RPCs are authenticated-only and de-anon-ed', () => {
    for (const fn of [
      'notification_feed(boolean, int)',
      'notification_unread_count()',
      'mark_notification_read(uuid)',
      'mark_all_notifications_read()',
      'set_notification_category_muted(text, boolean)',
    ]) {
      expect(sql).toContain(`grant execute on function public.${fn} to authenticated`.replace(/\s+/g, ' '));
    }
    expect(sql).toContain('revoke execute on function public.notification_feed(boolean, int) from anon');
  });

  it('a critical-severity item is shown even in a muted category', () => {
    expect(sql).toContain("n.severity = 'critical' or not exists ( select 1 from public.notification_mutes m");
  });

  it('only non-critical categories can be muted', () => {
    expect(sql).toContain("select p_category in ('inventory_integrity','budget_variance','receivable_overdue','document_expiry')");
    expect(sql).toContain('is a critical category and cannot be muted');
  });

  it('0073b makes the engine re-entrant within a session', () => {
    expect(sqlB).toContain('drop table if exists _active');
    expect(sqlB).toContain('create or replace function public.evaluate_company_notifications');
  });
});
