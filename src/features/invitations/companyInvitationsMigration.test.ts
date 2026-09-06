import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * BLOCK 4 (2026-09-06) — SQL-contract cover for 0069 (secure company
 * invitations). Live behaviour of every branch (create/accept/revoke,
 * wrong-email, bad token, single-use, expired, non-admin, superuser
 * rejection, scoped trigger bypass) was proven with rollback-wrapped RLS
 * sessions — see docs/KNOWN_ISSUES.md.
 */

const dir = join(process.cwd(), 'supabase', 'migrations');
const raw = readFileSync(join(dir, readdirSync(dir).find((n) => n.includes('__0069_'))!), 'utf8');
const sql = raw.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

describe('0069 — company invitations', () => {
  it('sorts after 0068', () => {
    const v = (l: string) => BigInt(readdirSync(dir).find((n) => n.includes(`__${l}_`))!.split('__')[0]);
    expect(v('0069')).toBeGreaterThan(v('0068'));
  });

  it('stores only a hash of the token — the raw token is returned once and never persisted', () => {
    expect(sql).toContain('token_hash    text not null unique'.replace(/\s+/g, ' '));
    expect(sql).toContain("encode(extensions.digest(v_token, 'sha256'), 'hex')");
    // the create RPC returns the raw token exactly once
    expect(sql).toContain("'token', v_token");
    // the table has no plain-token column
    expect(sql).not.toMatch(/\btoken\s+text\s+not\s+null(?!\s*unique.*hash)/);
  });

  it('invitations are single-use, time-limited, company-bound and email-bound', () => {
    expect(sql).toContain("expires_at    timestamptz not null default (now() + interval '7 days')".replace(/\s+/g, ' '));
    expect(sql).toContain('create unique index company_invitations_one_pending');
    expect(sql).toContain("where status = 'pending'");
    // accept checks status, expiry AND email match
    expect(sql).toContain("if v_inv.status = 'accepted' then");
    expect(sql).toContain('if v_inv.status = \'expired\' or v_inv.expires_at <= now() then');
    expect(sql).toContain('if lower(v_inv.email) is distinct from v_email then');
    expect(sql).toContain('select lower(email) into v_email from auth.users where id = v_uid');
  });

  it('create is admin-only and refuses a superuser access level; role must belong to the company', () => {
    expect(sql).toContain("if v_uid is null or public.get_my_role() <> 'admin' or v_company is null then");
    expect(sql).toContain("if p_profile_role = 'superuser' then");
    expect(sql).toContain('r.company_id is null or r.company_id = v_company');
    expect(sql).toContain('company_invitations_role_not_superuser check (profile_role <> \'superuser\')');
  });

  it('does NOT expose a user directory — create only checks membership of THE CALLER\'S company', () => {
    expect(sql).toContain('where lower(p.email) = v_email and p.company_id = v_company');
    // no cross-company profile lookup, and the RPC returns a jsonb summary, never profile rows
    expect(sql).toContain("return jsonb_build_object( 'invitation_id'".replace(/\s+/g, ' '));
  });

  it('accept links the profile via a SCOPED trigger bypass — companyless viewer → non-superuser role, only with a matching pending invitation', () => {
    expect(sql).toContain("perform set_config('vertex.invitation_company_id', v_inv.company_id::text, true)");
    expect(sql).toContain("perform set_config('vertex.invitation_company_id', '', true)");
    // trigger branch clauses
    expect(sql).toContain('v_invite_company is not null');
    expect(sql).toContain('old.company_id is null and old.role = \'viewer\'');
    expect(sql).toContain('new.role <> \'superuser\'');
    expect(sql).toContain('new.is_active is not distinct from old.is_active');
    expect(sql).toContain("ci.status = 'pending'");
    expect(sql).toContain('ci.expires_at > now()');
    expect(sql).toContain('lower(ci.email) = lower(u.email)');
    // verify the link actually took
    expect(sql).toContain('is distinct from v_inv.company_id then');
  });

  it('keeps the 0065 self-lockout and 0066/0067 bootstrap branch intact in the same trigger function', () => {
    expect(sql).toContain('you cannot change your own administrator access level');
    expect(sql).toContain('you cannot suspend your own account');
    expect(sql).toContain("nullif(current_setting('vertex.bootstrap_company_id', true), '') is not null");
    expect(sql).toContain('not exists (select 1 from public.profiles p where p.company_id = new.company_id)');
  });

  it('every RPC is authenticated-only, and the trigger function is not rpc-callable', () => {
    for (const fn of ['create_company_invitation', 'accept_company_invitation', 'revoke_company_invitation']) {
      expect(sql).toContain(`revoke execute on function public.${fn}`);
      expect(sql).toContain(`grant  execute on function public.${fn}`.replace(/\s+/g, ' '));
    }
    expect(sql).toContain('revoke execute on function public.protect_profile_privileged_columns() from authenticated');
  });

  it('creates NO destructive statement against any business/accounting table', () => {
    expect(sql).not.toMatch(/delete from public\.(products|invoices|journal_entries|journal_lines|accounts|customers)/);
    expect(sql).not.toMatch(/drop table|truncate/);
    expect(sql).not.toMatch(/insert into public\.(journal_entries|journal_lines|accounts)\b/);
  });
});
