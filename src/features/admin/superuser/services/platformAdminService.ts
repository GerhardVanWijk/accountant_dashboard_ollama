import type { ID } from '@/types';
import { ENTITLEMENT_KEYS, PLAN_BY_CODE } from '@/features/subscriptions/entitlements';
import type { SupabasePlatformAdminRepository } from '../repositories/SupabasePlatformAdminRepository';
import type {
  PlatformClient,
  PlatformClientDetail,
  PlatformMetrics,
  SubscriptionManagement,
} from '../types';

function managementOf(sub: { provider?: string } | null): SubscriptionManagement {
  if (!sub) return 'unmanaged';
  if (sub.provider === 'manual' || !sub.provider) return 'manual';
  return 'provider';
}

/**
 * Orchestrates the Vertex Platform Administration Console's read models and
 * routes every mutation through the audited RPCs. Deliberately thin — the
 * DB (RLS + the 0070 SECURITY DEFINER functions) is the authority; this
 * just shapes data for the screens.
 */
export class PlatformAdminService {
  constructor(private readonly repo: SupabasePlatformAdminRepository) {}

  getMetrics(): Promise<PlatformMetrics> {
    return this.repo.getMetrics();
  }

  async getClients(): Promise<PlatformClient[]> {
    const [companies, subs, plans, memberMap] = await Promise.all([
      this.repo.getCompanies(),
      this.repo.getSubscriptions(),
      this.repo.getPlans(),
      this.repo.getMemberCompanyMap(),
    ]);
    const subByCompany = new Map(subs.map((s) => [s.companyId, s]));
    const planById = new Map(plans.map((p) => [p.id, p]));

    return companies.map((company) => {
      const subscription = subByCompany.get(company.id) ?? null;
      const plan = subscription ? planById.get(subscription.planId) ?? null : null;
      return {
        company,
        subscription,
        planCode: plan?.code ?? null,
        planName: plan?.name ?? null,
        management: managementOf(subscription),
        userCount: memberMap.get(company.id) ?? 0,
      };
    });
  }

  async getClientDetail(companyId: ID): Promise<PlatformClientDetail | null> {
    const company = await this.repo.getCompany(companyId);
    if (!company) return null;

    const [subscription, plans, members, invitations, setup] = await Promise.all([
      this.repo.getSubscription(companyId),
      this.repo.getPlans(),
      this.repo.getCompanyMembers(companyId),
      this.repo.getInvitations(companyId),
      this.repo.getClientSetup(companyId),
    ]);
    const plan = subscription ? plans.find((p) => p.id === subscription.planId) ?? null : null;

    // Entitlements: the DB resolver is caller-company scoped and a superuser
    // has no company, so derive the client's module access from its plan
    // (or "all" when unmanaged) exactly the way company_entitlements() does.
    const entitlements = deriveEntitlements(subscription?.status, plan?.code ?? null, plans);

    return {
      company,
      subscription,
      plan,
      planCode: plan?.code ?? null,
      management: managementOf(subscription),
      entitlements,
      members,
      invitations,
      setup,
    };
  }

  getPlans() {
    return this.repo.getPlans();
  }

  getAuditEvents(limit?: number, companyId?: ID) {
    return this.repo.getAuditEvents(limit, companyId);
  }

  getAllInvitations() {
    return this.repo.getInvitations();
  }

  getSystemRoles() {
    return this.repo.getSystemRoles();
  }

  getCompanyMembers(companyId: ID) {
    return this.repo.getCompanyMembers(companyId);
  }

  getUserRoleAssignments(companyId: ID) {
    return this.repo.getUserRoleAssignments(companyId);
  }

  // ─── member add / invite (spec §11) ─────────────────────────────────

  findExistingUser(email: string) {
    return this.repo.findUnassignedByEmail(email.trim());
  }

  addExistingUser(userId: ID, companyId: ID) {
    return this.repo.addExistingUserToCompany(userId, companyId);
  }

  createInvitation(companyId: ID, email: string, profileRole: string, roleId?: ID) {
    return this.repo.createInvitation(companyId, email.trim(), profileRole, roleId);
  }

  revokeInvitation(invitationId: ID) {
    return this.repo.revokeInvitation(invitationId);
  }

  assignRole(userId: ID, roleId: ID) {
    return this.repo.assignRole(userId, roleId);
  }

  unassignRole(userId: ID, roleId: ID) {
    return this.repo.unassignRole(userId, roleId);
  }

  // ─── mutations ──────────────────────────────────────────────────────

  suspendClient(companyId: ID, reason: string) {
    return this.repo.setCompanySuspended(companyId, true, reason.trim() || null);
  }

  reactivateClient(companyId: ID) {
    return this.repo.setCompanySuspended(companyId, false, null);
  }

  setSubscriptionPlan(companyId: ID, planCode: string, status?: string) {
    return this.repo.setSubscriptionPlan(companyId, planCode, status);
  }

  setSubscriptionStatus(companyId: ID, status: string) {
    return this.repo.setSubscriptionStatus(companyId, status);
  }

  setMemberAccess(userId: ID, opts: { profileRole?: string; isActive?: boolean }) {
    return this.repo.setMemberAccess(userId, opts);
  }

  removeMember(userId: ID) {
    return this.repo.removeMemberFromCompany(userId);
  }
}

const CORE = ['dashboard', 'customers', 'suppliers', 'user_management', 'settings'];

/** Mirrors `company_entitlements()` — core always, unmanaged = all, else plan features while active/trialing. */
function deriveEntitlements(
  status: string | undefined,
  planCode: string | null,
  plans: { code: string }[],
): string[] {
  void plans;
  if (!planCode) return [...ENTITLEMENT_KEYS];
  if (status && !['active', 'trialing'].includes(status)) return [...CORE];
  const plan = PLAN_BY_CODE.get(planCode as 'starter' | 'growth' | 'premium');
  return [...CORE, ...(plan?.features ?? [])];
}
