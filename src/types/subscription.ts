import type { ID, ISODateString } from './common';

/**
 * PLATFORM billing for Vertex itself (docs/SUBSCRIPTIONS.md /
 * docs/PLAN_ENTITLEMENTS.md). Never mixed into a customer's accounting
 * ledger. Layer 2 of the three-layer access model
 * (SUBSCRIPTION → ENTITLEMENT → PERMISSION).
 */

export type SubscriptionStatus =
  | 'pending'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'cancelled'
  | 'expired';

/** Mirrors `public.subscription_plans` (migration 0068). Prices are cents, ex-VAT, ZAR. */
export interface SubscriptionPlan {
  id: ID;
  code: string;
  name: string;
  blurb?: string;
  priceCents: number;
  currency: string;
  billingInterval: 'monthly' | 'annual';
  includedUsers: number;
  isActive: boolean;
  isPublic: boolean;
  displayOrder: number;
}

/** Mirrors `public.subscription_features`. */
export interface SubscriptionFeature {
  key: string;
  name: string;
  description?: string;
  isCore: boolean;
  displayOrder: number;
}

/** Mirrors `public.subscriptions` (0..1 per company). */
export interface Subscription {
  id: ID;
  companyId: ID;
  planId: ID;
  status: SubscriptionStatus;
  provider?: string;
  providerReference?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  activatedAt?: ISODateString;
  cancelledAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
