import type { Company, CompanyInvitation, ID, ISODateString, Subscription, SubscriptionPlan } from '@/types';

/**
 * Read models for the Vertex Platform Administration Console
 * (docs/SUPERUSER_PLATFORM_ADMIN.md). Everything here is platform
 * administration metadata — never a customer's accounting data.
 */

/** `platform_admin_metrics()` (migration 0070). */
export interface PlatformMetrics {
  totalClients: number;
  activeClients: number;
  suspendedClients: number;
  totalUsers: number;
  suspendedUsers: number;
  superusers: number;
  pendingInvitations: number;
  expiredInvitations: number;
  managedSubscriptions: number;
  activeSubscriptions: number;
  unmanagedClients: number;
  /** plan code -> count of active/trialing subscriptions on it */
  byPlan: Record<string, number>;
}

/** How a client's Vertex subscription is administered. */
export type SubscriptionManagement = 'unmanaged' | 'manual' | 'provider';

/** A row in the Clients table — a company plus its derived subscription facts. */
export interface PlatformClient {
  company: Company;
  subscription: Subscription | null;
  planCode: string | null;
  planName: string | null;
  management: SubscriptionManagement;
  userCount: number;
}

/** `platform_admin_company_users()` (migration 0070) — one member of a client company. */
export interface PlatformMember {
  id: ID;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileRole: string;
  isActive: boolean;
  joinedAt: ISODateString;
  lastSignInAt: ISODateString | null;
  emailConfirmed: boolean;
}

/** Full picture for the Client Detail page. */
export interface PlatformClientDetail {
  company: Company;
  subscription: Subscription | null;
  plan: SubscriptionPlan | null;
  planCode: string | null;
  management: SubscriptionManagement;
  entitlements: string[];
  members: PlatformMember[];
  invitations: CompanyInvitation[];
  /** Config health — never balances. */
  setup: ClientSetupHealth;
}

/** Configuration health for a client — presence/counts only, never money. */
export interface ClientSetupHealth {
  accountCount: number;
  financialYearConfigured: boolean;
  periodCount: number;
  hasActiveAdmin: boolean;
  memberCount: number;
  bootstrapComplete: boolean;
}

/** One administrative / security event for the audit screens. */
export interface PlatformAuditEvent {
  id: ID;
  occurredAt: ISODateString;
  actorId: string;
  actorEmail: string | null;
  companyId: ID;
  companyName: string | null;
  action: string;
  module: string;
  recordType: string;
  recordId: string;
  reason: string | null;
}
