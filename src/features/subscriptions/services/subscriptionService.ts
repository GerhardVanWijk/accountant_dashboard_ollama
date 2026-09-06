import type { ID, Subscription } from '@/types';
import type { SupabaseSubscriptionRepository } from '../repositories/SupabaseSubscriptionRepository';
import { CORE_ENTITLEMENTS, type EntitlementKey } from '../entitlements';

export interface CompanyEntitlementSnapshot {
  entitlements: EntitlementKey[];
  subscription: Subscription | null;
  /** 'starter' | 'growth' | 'premium' when managed, else null (unmanaged). */
  planCode: string | null;
}

/**
 * Read model for Layer 2 (entitlements). The DB resolver
 * `company_entitlements()` is authoritative and enforced server-side; this
 * service just surfaces it (plus the subscription row for the management
 * page). It never activates or bills anything — that is the Paystack Edge
 * Function's job (Block 5).
 */
export class SubscriptionService {
  constructor(private readonly repository: SupabaseSubscriptionRepository) {}

  async getCompanySnapshot(companyId: ID): Promise<CompanyEntitlementSnapshot> {
    const [entitlements, subscription] = await Promise.all([
      this.repository.getCompanyEntitlements(),
      this.repository.getSubscription(companyId),
    ]);
    // Defence in depth: core features are always present even if the RPC
    // returned a narrow set for some reason.
    const merged = new Set<EntitlementKey>([...CORE_ENTITLEMENTS, ...entitlements]);

    let planCode: string | null = null;
    if (subscription) {
      const plans = await this.repository.getActivePlans().catch(() => []);
      planCode = plans.find((p) => p.id === subscription.planId)?.code ?? null;
    }
    return { entitlements: [...merged], subscription, planCode };
  }

  getActivePlans() {
    return this.repository.getActivePlans();
  }
}
