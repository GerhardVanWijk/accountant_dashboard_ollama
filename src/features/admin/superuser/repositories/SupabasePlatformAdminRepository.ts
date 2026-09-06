import type { SupabaseClient } from '@supabase/supabase-js';

import type { Company, CompanyInvitation, ID, Subscription, SubscriptionPlan } from '@/types';
import type {
  ClientSetupHealth,
  PlatformAuditEvent,
  PlatformMember,
  PlatformMetrics,
} from '../types';

/**
 * Every read/write the Vertex Platform Administration Console needs. A
 * superuser's JWT + the RLS superuser policies (companies / profiles /
 * subscriptions / subscription_events / company_invitations /
 * audit_log_entries) make the cross-company reads legal; the writes all go
 * through the audited SECURITY DEFINER RPCs from migration 0070. This
 * repository NEVER touches a customer's ledger, documents or balances —
 * configuration health comes from `platform_admin_client_setup()`, which
 * only returns counts.
 */
export class SupabasePlatformAdminRepository {
  constructor(private readonly client: SupabaseClient) {}

  // ─── reads ──────────────────────────────────────────────────────────

  async getMetrics(): Promise<PlatformMetrics> {
    const { data, error } = await this.client.rpc('platform_admin_metrics');
    if (error) throw new Error(error.message);
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      totalClients: Number(d.totalClients ?? 0),
      activeClients: Number(d.activeClients ?? 0),
      suspendedClients: Number(d.suspendedClients ?? 0),
      totalUsers: Number(d.totalUsers ?? 0),
      suspendedUsers: Number(d.suspendedUsers ?? 0),
      superusers: Number(d.superusers ?? 0),
      pendingInvitations: Number(d.pendingInvitations ?? 0),
      expiredInvitations: Number(d.expiredInvitations ?? 0),
      managedSubscriptions: Number(d.managedSubscriptions ?? 0),
      activeSubscriptions: Number(d.activeSubscriptions ?? 0),
      unmanagedClients: Number(d.unmanagedClients ?? 0),
      byPlan: (d.byPlan ?? {}) as Record<string, number>,
    };
  }

  async getCompanies(): Promise<Company[]> {
    const { data, error } = await this.client.from('companies').select('*').order('created_at', { ascending: true });
    if (error) throw new Error(`PlatformAdminRepository.getCompanies: ${error.message}`);
    return (data as CompanyRow[]).map(rowToCompany);
  }

  async getCompany(id: ID): Promise<Company | null> {
    const { data, error } = await this.client.from('companies').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`PlatformAdminRepository.getCompany: ${error.message}`);
    return data ? rowToCompany(data as CompanyRow) : null;
  }

  async getSubscriptions(): Promise<Subscription[]> {
    const { data, error } = await this.client.from('subscriptions').select('*');
    if (error) throw new Error(`PlatformAdminRepository.getSubscriptions: ${error.message}`);
    return (data as SubscriptionRow[]).map(rowToSubscription);
  }

  async getSubscription(companyId: ID): Promise<Subscription | null> {
    const { data, error } = await this.client.from('subscriptions').select('*').eq('company_id', companyId).maybeSingle();
    if (error) throw new Error(`PlatformAdminRepository.getSubscription: ${error.message}`);
    return data ? rowToSubscription(data as SubscriptionRow) : null;
  }

  async getPlans(): Promise<SubscriptionPlan[]> {
    const { data, error } = await this.client.from('subscription_plans').select('*').order('display_order');
    if (error) throw new Error(`PlatformAdminRepository.getPlans: ${error.message}`);
    return (data as PlanRow[]).map(rowToPlan);
  }

  /** Every profile that belongs to a company — for per-company user counts on the Clients list. */
  async getMemberCompanyMap(): Promise<Map<ID, number>> {
    const { data, error } = await this.client.from('profiles').select('company_id').not('company_id', 'is', null);
    if (error) throw new Error(`PlatformAdminRepository.getMemberCompanyMap: ${error.message}`);
    const map = new Map<ID, number>();
    for (const r of (data as { company_id: string }[])) map.set(r.company_id, (map.get(r.company_id) ?? 0) + 1);
    return map;
  }

  async getCompanyMembers(companyId: ID): Promise<PlatformMember[]> {
    const { data, error } = await this.client.rpc('platform_admin_company_users', { p_company_id: companyId });
    if (error) throw new Error(error.message);
    return (data as MemberRow[]).map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      profileRole: r.profile_role,
      isActive: r.is_active,
      joinedAt: r.joined_at,
      lastSignInAt: r.last_sign_in_at,
      emailConfirmed: r.email_confirmed,
    }));
  }

  async getClientSetup(companyId: ID): Promise<ClientSetupHealth> {
    const { data, error } = await this.client.rpc('platform_admin_client_setup', { p_company_id: companyId });
    if (error) throw new Error(error.message);
    const d = (data ?? {}) as Record<string, unknown>;
    const accountCount = Number(d.accountCount ?? 0);
    const financialYearConfigured = Boolean(d.financialYearConfigured);
    const periodCount = Number(d.periodCount ?? 0);
    const hasActiveAdmin = Boolean(d.hasActiveAdmin);
    return {
      accountCount,
      financialYearConfigured,
      periodCount,
      hasActiveAdmin,
      memberCount: Number(d.memberCount ?? 0),
      bootstrapComplete: accountCount > 0 && financialYearConfigured && periodCount > 0 && hasActiveAdmin,
    };
  }

  async getEntitlements(): Promise<string[]> {
    const { data, error } = await this.client.rpc('company_entitlements');
    if (error) throw new Error(error.message);
    return ((data as string[] | null) ?? []);
  }

  async getInvitations(companyId?: ID): Promise<CompanyInvitation[]> {
    let q = this.client.from('company_invitations').select('*').order('created_at', { ascending: false });
    if (companyId) q = q.eq('company_id', companyId);
    const { data, error } = await q;
    if (error) throw new Error(`PlatformAdminRepository.getInvitations: ${error.message}`);
    return (data as InvitationRow[]).map(rowToInvitation);
  }

  /**
   * Administrative / security audit events across all companies (the
   * superuser SELECT policy from migration 0070). Enriched client-side with
   * company name and actor email — both from tables the superuser can read.
   */
  async getAuditEvents(limit = 200, companyId?: ID): Promise<PlatformAuditEvent[]> {
    let q = this.client
      .from('audit_log_entries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (companyId) q = q.eq('company_id', companyId);
    const { data, error } = await q;
    if (error) throw new Error(`PlatformAdminRepository.getAuditEvents: ${error.message}`);
    const rows = data as AuditRow[];

    const companyIds = [...new Set(rows.map((r) => r.company_id))];
    const actorIds = [...new Set(rows.map((r) => r.user_id).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];

    const [{ data: companies }, { data: profiles }] = await Promise.all([
      this.client.from('companies').select('id, name').in('id', companyIds.length ? companyIds : ['00000000-0000-0000-0000-000000000000']),
      this.client.from('profiles').select('id, email').in('id', actorIds.length ? actorIds : ['00000000-0000-0000-0000-000000000000']),
    ]);
    const companyName = new Map((companies ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
    const actorEmail = new Map((profiles ?? []).map((p: { id: string; email: string | null }) => [p.id, p.email]));

    return rows.map((r) => ({
      id: r.id,
      occurredAt: r.created_at,
      actorId: r.user_id,
      actorEmail: actorEmail.get(r.user_id) ?? null,
      companyId: r.company_id,
      companyName: companyName.get(r.company_id) ?? null,
      action: r.action,
      module: r.module,
      recordType: r.record_type,
      recordId: r.record_id,
      reason: r.reason,
    }));
  }

  // ─── writes (audited SECURITY DEFINER RPCs, migration 0070) ──────────

  async setCompanySuspended(companyId: ID, suspend: boolean, reason: string | null): Promise<void> {
    const { error } = await this.client.rpc('set_company_suspended', {
      p_company_id: companyId,
      p_suspend: suspend,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
  }

  async setSubscriptionPlan(companyId: ID, planCode: string, status = 'active'): Promise<void> {
    const { error } = await this.client.rpc('superuser_set_subscription_plan', {
      p_company_id: companyId,
      p_plan_code: planCode,
      p_status: status,
    });
    if (error) throw new Error(error.message);
  }

  async setSubscriptionStatus(companyId: ID, status: string): Promise<void> {
    const { error } = await this.client.rpc('superuser_set_subscription_status', {
      p_company_id: companyId,
      p_status: status,
    });
    if (error) throw new Error(error.message);
  }

  async setMemberAccess(userId: ID, opts: { profileRole?: string; isActive?: boolean }): Promise<void> {
    const { error } = await this.client.rpc('superuser_set_member_access', {
      p_user_id: userId,
      p_profile_role: opts.profileRole ?? null,
      p_is_active: opts.isActive ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async removeMemberFromCompany(userId: ID): Promise<void> {
    const { error } = await this.client.rpc('superuser_remove_member_from_company', { p_user_id: userId });
    if (error) throw new Error(error.message);
  }

  async assignRole(userId: ID, roleId: ID): Promise<void> {
    const { error } = await this.client.rpc('superuser_assign_role', { p_user_id: userId, p_role_id: roleId });
    if (error) throw new Error(error.message);
  }

  async unassignRole(userId: ID, roleId: ID): Promise<void> {
    const { error } = await this.client.rpc('superuser_unassign_role', { p_user_id: userId, p_role_id: roleId });
    if (error) throw new Error(error.message);
  }

  async addExistingUserToCompany(userId: ID, companyId: ID): Promise<void> {
    const { error } = await this.client.rpc('add_existing_user_to_company', {
      p_user_id: userId,
      p_company_id: companyId,
    });
    if (error) throw new Error(error.message);
  }

  async findUnassignedByEmail(email: string): Promise<{ id: string; email: string | null; firstName: string | null; lastName: string | null } | null> {
    const { data, error } = await this.client.rpc('find_unassigned_profile_by_email', { p_email: email });
    if (error) throw new Error(error.message);
    const row = (data as { id: string; email: string | null; first_name: string | null; last_name: string | null }[])[0];
    return row ? { id: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name } : null;
  }

  async createInvitation(
    companyId: ID,
    email: string,
    profileRole: string,
    roleId?: ID,
  ): Promise<{ email: string; acceptPath: string; expiresAt: string }> {
    const { data, error } = await this.client.rpc('superuser_create_company_invitation', {
      p_company_id: companyId,
      p_email: email,
      p_profile_role: profileRole,
      p_role_id: roleId ?? null,
    });
    if (error) throw new Error(error.message);
    const d = data as { email: string; accept_path: string; expires_at: string };
    return { email: d.email, acceptPath: d.accept_path, expiresAt: d.expires_at };
  }

  async revokeInvitation(invitationId: ID): Promise<void> {
    const { error } = await this.client.rpc('superuser_revoke_company_invitation', { p_invitation_id: invitationId });
    if (error) throw new Error(error.message);
  }

  async getSystemRoles(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await this.client.from('roles').select('id, name').is('company_id', null).order('name');
    if (error) throw new Error(`PlatformAdminRepository.getSystemRoles: ${error.message}`);
    return (data as { id: string; name: string }[]);
  }

  async getUserRoleAssignments(companyId: ID): Promise<{ userId: string; roleId: string }[]> {
    const { data, error } = await this.client.from('user_roles').select('user_id, role_id').eq('company_id', companyId);
    if (error) throw new Error(`PlatformAdminRepository.getUserRoleAssignments: ${error.message}`);
    return (data as { user_id: string; role_id: string }[]).map((r) => ({ userId: r.user_id, roleId: r.role_id }));
  }
}

// ─── row mappers (kept local — the console is the only consumer) ────────

interface CompanyRow {
  id: string;
  name: string;
  trading_name: string | null;
  registration_number: string | null;
  legal_entity_type: string;
  is_vat_registered: boolean;
  vat_registration_number: string | null;
  financial_year_end_month: number;
  financial_year_end_day: number;
  functional_currency: string;
  is_active: boolean;
  suspended_at: string | null;
  suspended_by: string | null;
  suspension_reason: string | null;
  subscription_tier: string;
  created_at: string;
  updated_at: string;
}

function rowToCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    tradingName: row.trading_name ?? undefined,
    registrationNumber: row.registration_number ?? undefined,
    legalEntityType: row.legal_entity_type as Company['legalEntityType'],
    isVatRegistered: row.is_vat_registered,
    vatRegistrationNumber: row.vat_registration_number ?? undefined,
    financialYearEndMonth: row.financial_year_end_month,
    financialYearEndDay: row.financial_year_end_day,
    functionalCurrency: row.functional_currency,
    isActive: row.is_active,
    suspendedAt: row.suspended_at ?? undefined,
    suspendedBy: row.suspended_by ?? undefined,
    suspensionReason: row.suspension_reason ?? undefined,
    subscriptionTier: row.subscription_tier,
  } as Company;
}

interface SubscriptionRow {
  id: string;
  company_id: string;
  plan_id: string;
  status: Subscription['status'];
  provider: string | null;
  provider_reference: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  activated_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToSubscription(r: SubscriptionRow): Subscription {
  return {
    id: r.id,
    companyId: r.company_id,
    planId: r.plan_id,
    status: r.status,
    provider: r.provider ?? undefined,
    providerReference: r.provider_reference ?? undefined,
    currentPeriodStart: r.current_period_start ?? undefined,
    currentPeriodEnd: r.current_period_end ?? undefined,
    activatedAt: r.activated_at ?? undefined,
    cancelledAt: r.cancelled_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

interface PlanRow {
  id: string;
  code: string;
  name: string;
  blurb: string | null;
  price_cents: number;
  currency: string;
  billing_interval: 'monthly' | 'annual';
  included_users: number;
  is_active: boolean;
  is_public: boolean;
  display_order: number;
}

function rowToPlan(r: PlanRow): SubscriptionPlan {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    blurb: r.blurb ?? undefined,
    priceCents: r.price_cents,
    currency: r.currency,
    billingInterval: r.billing_interval,
    includedUsers: r.included_users,
    isActive: r.is_active,
    isPublic: r.is_public,
    displayOrder: r.display_order,
  };
}

interface InvitationRow {
  id: string;
  company_id: string;
  email: string;
  profile_role: string;
  role_id: string | null;
  status: CompanyInvitation['status'];
  invited_by: string;
  accepted_by: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

function rowToInvitation(r: InvitationRow): CompanyInvitation {
  return {
    id: r.id,
    companyId: r.company_id,
    email: r.email,
    profileRole: r.profile_role as CompanyInvitation['profileRole'],
    roleId: r.role_id ?? undefined,
    status: r.status,
    invitedBy: r.invited_by,
    acceptedBy: r.accepted_by ?? undefined,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    acceptedAt: r.accepted_at ?? undefined,
    revokedAt: r.revoked_at ?? undefined,
  };
}

interface MemberRow {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  profile_role: string;
  is_active: boolean;
  joined_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
}

interface AuditRow {
  id: string;
  company_id: string;
  user_id: string;
  action: string;
  module: string;
  record_type: string;
  record_id: string;
  reason: string | null;
  created_at: string;
}
