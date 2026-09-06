-- 0069_company_invitations
-- COMMERCIAL FOUNDATION · BLOCK 4 — secure new-user invitations (2026-09-06,
-- branch commercial-foundation-2026-09-06). PRE-MERGE. `main` untouched.
--
-- ═══════════════════════════════════════════════════════════════════════
-- TWO WAYS TO ADD A COLLEAGUE TO A COMPANY
--   FLOW A — they ALREADY have a Vertex account (companyless):
--            admin → exact-email lookup → add_existing_user_to_company
--            (migration 0065, unchanged).
--   FLOW B — the email has NOT registered yet (THIS FILE):
--            admin → create_company_invitation → secure time-limited
--            single-use token → recipient signs up & verifies email →
--            accept_company_invitation → membership + pre-approved role.
--
-- SECURITY
--   * The token is generated server-side (`gen_random_bytes(32)`), returned
--     to the admin ONCE, and only its SHA-256 hash is stored.
--   * Single-use (status flips to 'accepted'), time-limited (default 7
--     days), company-bound, and email-bound — acceptance requires the
--     caller's OWN verified `auth.users.email` to match the invitation.
--   * No user directory is exposed. `create_company_invitation` never
--     reveals whether an email already has an account.
--   * The scoped profile bypass (a new GUC, mirroring 0066's bootstrap
--     one) permits EXACTLY: the caller's own companyless 'viewer' row →
--     the invited access level, into the invited company, and ONLY when a
--     matching pending invitation exists. It can never grant superuser,
--     move an existing member, or touch another user — even if the GUC
--     were somehow set by a client (it cannot be).
--
-- NO EMAIL INFRASTRUCTURE EXISTS. These RPCs create and accept invitations;
-- delivery is a separate `EmailDelivery` boundary for the future Supabase
-- Edge Function. The UI truthfully shows "Invitation created" (with a
-- copyable link), never "Email sent".


create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table public.company_invitations (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  email         text not null,
  token_hash    text not null unique,
  profile_role  public.profile_role not null default 'operator',   -- the access level to grant on accept
  role_id       uuid references public.roles(id) on delete set null, -- optional fine-grained role
  status        public.invitation_status not null default 'pending',
  invited_by    uuid not null,
  accepted_by   uuid,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '7 days'),
  accepted_at   timestamptz,
  revoked_at    timestamptz,
  constraint company_invitations_role_not_superuser check (profile_role <> 'superuser')
);

create index company_invitations_company_id_idx on public.company_invitations (company_id);
create index company_invitations_email_idx on public.company_invitations (lower(email));
-- at most one live invitation per (company, email)
create unique index company_invitations_one_pending
  on public.company_invitations (company_id, lower(email))
  where status = 'pending';

alter table public.company_invitations enable row level security;
-- Admins of the owning company (and superuser) can LIST their invitations.
-- Never exposes the token_hash usefully (it's a hash) and never another
-- company's rows. No client write — everything goes through the RPCs.
create policy company_invitations_read_admin on public.company_invitations
  for select to authenticated
  using (
    (company_id = (select public.get_my_company_id()) and public.get_my_role() = 'admin')
    or public.get_my_role() = 'superuser'
  );


-- ═════════════════════════════════════════════════════════════════════
-- 1. protect_profile_privileged_columns — + scoped INVITATION-accept branch
-- ═════════════════════════════════════════════════════════════════════
create or replace function public.protect_profile_privileged_columns() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_invite_company text := nullif(current_setting('vertex.invitation_company_id', true), '');
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if public.get_my_role() = 'superuser' then
    return new;
  end if;

  -- SCOPED FIRST-COMPANY BOOTSTRAP (0066/0067) — unchanged.
  if nullif(current_setting('vertex.bootstrap_company_id', true), '') is not null
     and old.id = (select auth.uid())
     and old.company_id is null
     and old.role = 'viewer'
     and new.company_id is not null
     and new.company_id::text = current_setting('vertex.bootstrap_company_id', true)
     and new.role = 'admin'
     and new.is_active is not distinct from old.is_active
     and not exists (select 1 from public.profiles p where p.company_id = new.company_id)
     and not exists (select 1 from public.accounts a where a.company_id = new.company_id)
  then
    return new;
  end if;

  -- SCOPED INVITATION ACCEPT (0069): accept_company_invitation sets
  -- vertex.invitation_company_id around this UPDATE and clears it. Permits
  -- EXACTLY: the caller's own companyless 'viewer' row → a non-superuser
  -- access level, into the invited company, and ONLY when a pending,
  -- unexpired invitation exists for that company + the caller's verified
  -- email. is_active untouched.
  if v_invite_company is not null
     and old.id = (select auth.uid())
     and old.company_id is null
     and old.role = 'viewer'
     and new.company_id is not null
     and new.company_id::text = v_invite_company
     and new.role <> 'superuser'
     and new.is_active is not distinct from old.is_active
     and exists (
       select 1
       from public.company_invitations ci
       join auth.users u on u.id = (select auth.uid())
       where ci.company_id = new.company_id
         and ci.status = 'pending'
         and ci.expires_at > now()
         and lower(ci.email) = lower(u.email)
     )
  then
    return new;
  end if;

  if public.get_my_role() = 'admin'
     and (old.company_id is not distinct from (select public.get_my_company_id()) or old.company_id is null) then
    if new.role = 'superuser' then
      new.role := old.role;
    end if;
    if old.id = (select auth.uid()) then
      if old.role = 'admin' and new.role is distinct from old.role then
        raise exception 'You cannot change your own administrator access level. Ask another administrator or a superuser to do it.'
          using errcode = '42501';
      end if;
      if old.is_active and not new.is_active then
        raise exception 'You cannot suspend your own account.'
          using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  new.role := old.role;
  new.company_id := old.company_id;
  new.is_active := old.is_active;
  return new;
end;
$$;

revoke all on function public.protect_profile_privileged_columns() from public;
revoke execute on function public.protect_profile_privileged_columns() from anon;
revoke execute on function public.protect_profile_privileged_columns() from authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 2. create_company_invitation
-- ═════════════════════════════════════════════════════════════════════
create or replace function public.create_company_invitation(
  p_email        text,
  p_profile_role public.profile_role default 'operator',
  p_role_id      uuid default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_company uuid := (select public.get_my_company_id());
  v_email   text := lower(btrim(p_email));
  v_token   text := encode(extensions.gen_random_bytes(32), 'hex');
  v_id      uuid;
  v_expires timestamptz := now() + interval '7 days';
begin
  if v_uid is null or public.get_my_role() <> 'admin' or v_company is null then
    raise exception 'Only a company administrator can invite users.' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if p_profile_role = 'superuser' then
    raise exception 'You cannot invite someone as a superuser.' using errcode = '42501';
  end if;
  -- a fine-grained role, if given, must be a system role or one of this company's
  if p_role_id is not null and not exists (
    select 1 from public.roles r where r.id = p_role_id and (r.company_id is null or r.company_id = v_company)
  ) then
    raise exception 'That role is not available to your company.' using errcode = '42501';
  end if;
  -- already a member of THIS company?  (definer read — never leaks other companies)
  if exists (select 1 from public.profiles p where lower(p.email) = v_email and p.company_id = v_company) then
    raise exception 'That person is already in your company.' using errcode = '42501';
  end if;
  -- one live invitation per (company, email): supersede any prior pending one
  update public.company_invitations
     set status = 'revoked', revoked_at = now()
   where company_id = v_company and lower(email) = v_email and status = 'pending';

  insert into public.company_invitations (company_id, email, token_hash, profile_role, role_id, invited_by, expires_at)
  values (v_company, v_email, encode(extensions.digest(v_token, 'sha256'), 'hex'), p_profile_role, p_role_id, v_uid, v_expires)
  returning id into v_id;

  insert into public.audit_log_entries (company_id, user_id, action, module, record_type, record_id, new_value, reason)
  values (v_company, v_uid::text, 'permission_changed', 'admin', 'CompanyInvitation', v_id::text,
          jsonb_build_object('email', v_email, 'profileRole', p_profile_role, 'roleId', p_role_id), 'Invitation created');

  -- The RAW token is returned ONCE. Delivery (email) is a separate boundary.
  return jsonb_build_object(
    'invitation_id', v_id,
    'email', v_email,
    'token', v_token,
    'accept_path', '/accept-invite?token=' || v_token,
    'expires_at', v_expires,
    'email_sent', false
  );
end;
$$;

revoke all     on function public.create_company_invitation(text, public.profile_role, uuid) from public;
revoke execute on function public.create_company_invitation(text, public.profile_role, uuid) from anon;
grant  execute on function public.create_company_invitation(text, public.profile_role, uuid) to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 3. accept_company_invitation
-- ═════════════════════════════════════════════════════════════════════
create or replace function public.accept_company_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_email  text;
  v_hash   text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_inv    public.company_invitations;
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'You must be signed in to accept an invitation.' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users where id = v_uid;

  select * into v_profile from public.profiles where id = v_uid for update;
  if v_profile.company_id is not null then
    raise exception 'Your account already belongs to a company.' using errcode = '42501';
  end if;
  if v_profile.role = 'superuser' then
    raise exception 'A superuser account cannot join a company.' using errcode = '42501';
  end if;

  select * into v_inv from public.company_invitations where token_hash = v_hash for update;
  if not found then
    raise exception 'This invitation link is not valid.' using errcode = 'P0002';
  end if;
  if v_inv.status = 'revoked' then
    raise exception 'This invitation has been revoked. Ask the administrator to send a new one.' using errcode = '42501';
  end if;
  if v_inv.status = 'accepted' then
    raise exception 'This invitation has already been used.' using errcode = '42501';
  end if;
  if v_inv.status = 'expired' or v_inv.expires_at <= now() then
    update public.company_invitations set status = 'expired' where id = v_inv.id and status = 'pending';
    raise exception 'This invitation has expired. Ask the administrator to send a new one.' using errcode = '42501';
  end if;
  if lower(v_inv.email) is distinct from v_email then
    raise exception 'This invitation was sent to a different email address.' using errcode = '42501';
  end if;

  -- link the profile (scoped trigger bypass — see protect_profile_privileged_columns)
  perform set_config('vertex.invitation_company_id', v_inv.company_id::text, true);
  update public.profiles
     set company_id = v_inv.company_id, role = v_inv.profile_role, updated_at = now()
   where id = v_uid;
  perform set_config('vertex.invitation_company_id', '', true);

  if (select company_id from public.profiles where id = v_uid) is distinct from v_inv.company_id then
    raise exception 'Could not join the company — nothing was saved.' using errcode = 'P0001';
  end if;

  -- optional fine-grained role (the user_roles_company_integrity trigger, 0065,
  -- is satisfied now that the profile is in the company)
  if v_inv.role_id is not null then
    insert into public.user_roles (user_id, role_id, company_id, assigned_by)
    values (v_uid, v_inv.role_id, v_inv.company_id, v_inv.invited_by)
    on conflict (user_id, role_id, company_id) do nothing;
  end if;

  update public.company_invitations
     set status = 'accepted', accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  insert into public.audit_log_entries (company_id, user_id, action, module, record_type, record_id, new_value, reason)
  values (v_inv.company_id, v_uid::text, 'permission_changed', 'admin', 'CompanyInvitation', v_inv.id::text,
          jsonb_build_object('acceptedBy', v_uid, 'profileRole', v_inv.profile_role), 'Invitation accepted');

  return jsonb_build_object('status', 'JOINED', 'company_id', v_inv.company_id, 'profile_role', v_inv.profile_role);
end;
$$;

revoke all     on function public.accept_company_invitation(text) from public;
revoke execute on function public.accept_company_invitation(text) from anon;
grant  execute on function public.accept_company_invitation(text) to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 4. revoke_company_invitation
-- ═════════════════════════════════════════════════════════════════════
create or replace function public.revoke_company_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_company uuid := (select public.get_my_company_id());
  v_uid     uuid := (select auth.uid());
  n int;
begin
  if v_uid is null or public.get_my_role() <> 'admin' then
    raise exception 'Only a company administrator can revoke invitations.' using errcode = '42501';
  end if;
  update public.company_invitations
     set status = 'revoked', revoked_at = now()
   where id = p_invitation_id and company_id = v_company and status = 'pending';
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'That invitation is no longer pending.' using errcode = 'P0002';
  end if;
  insert into public.audit_log_entries (company_id, user_id, action, module, record_type, record_id, reason)
  values (v_company, v_uid::text, 'permission_changed', 'admin', 'CompanyInvitation', p_invitation_id::text, 'Invitation revoked');
end;
$$;

revoke all     on function public.revoke_company_invitation(uuid) from public;
revoke execute on function public.revoke_company_invitation(uuid) from anon;
grant  execute on function public.revoke_company_invitation(uuid) to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 5. Observability
-- ═════════════════════════════════════════════════════════════════════
do $$
begin
  if to_regprocedure('public.create_company_invitation(text, public.profile_role, uuid)') is null
     or to_regprocedure('public.accept_company_invitation(text)') is null
     or to_regprocedure('public.revoke_company_invitation(uuid)') is null then
    raise exception '0069: an invitation RPC is missing';
  end if;
  if has_function_privilege('anon', 'public.accept_company_invitation(text)', 'execute') then
    raise exception '0069: accept_company_invitation must not be anon-executable';
  end if;
  if has_function_privilege('anon', 'public.protect_profile_privileged_columns()', 'execute')
     or has_function_privilege('authenticated', 'public.protect_profile_privileged_columns()', 'execute') then
    raise exception '0069: protect_profile_privileged_columns must not be rpc-executable';
  end if;
  raise notice '0069: OK — invitation model + create/accept/revoke + scoped accept bypass in place.';
end $$;
