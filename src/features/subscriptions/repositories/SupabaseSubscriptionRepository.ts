import type { SupabaseClient } from '@supabase/supabase-js';

import type { ID, Subscription, SubscriptionPlan } from '@/types';
import type { EntitlementKey } from '../entitlements';

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

/** Reads the platform-subscription tables + the authoritative entitlement resolver. */
export class SupabaseSubscriptionRepository {
  constructor(private readonly client: SupabaseClient) {}

  /** Server-authoritative: `public.company_entitlements()` (migration 0068). */
  async getCompanyEntitlements(): Promise<EntitlementKey[]> {
    const { data, error } = await this.client.rpc('company_entitlements');
    if (error) throw new Error(`SupabaseSubscriptionRepository.getCompanyEntitlements: ${error.message}`);
    return ((data as string[] | null) ?? []) as EntitlementKey[];
  }

  /** The current company's subscription, or null when unmanaged (grandfathered). */
  async getSubscription(companyId: ID): Promise<Subscription | null> {
    const { data, error } = await this.client.from('subscriptions').select('*').eq('company_id', companyId).maybeSingle();
    if (error) throw new Error(`SupabaseSubscriptionRepository.getSubscription: ${error.message}`);
    return data ? rowToSubscription(data as SubscriptionRow) : null;
  }

  async getActivePlans(): Promise<SubscriptionPlan[]> {
    const { data, error } = await this.client.from('subscription_plans').select('*').eq('is_active', true).order('display_order');
    if (error) throw new Error(`SupabaseSubscriptionRepository.getActivePlans: ${error.message}`);
    return (data as PlanRow[]).map(rowToPlan);
  }
}
