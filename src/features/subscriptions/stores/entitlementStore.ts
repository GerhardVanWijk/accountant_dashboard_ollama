import { create } from 'zustand';

import type { Subscription } from '@/types';
import type { EntitlementKey } from '../entitlements';

interface EntitlementState {
  companyId: string | null;
  /** The feature keys the current company is entitled to (resolver: company_entitlements()). */
  entitlements: Set<EntitlementKey>;
  /** null = unmanaged (no subscription row) = fully entitled / grandfathered. */
  subscription: Subscription | null;
  /** 'starter' | 'growth' | 'premium' when managed, else null. */
  planCode: string | null;
  loaded: boolean;
  set: (companyId: string, entitlements: EntitlementKey[], subscription: Subscription | null, planCode: string | null) => void;
  clear: () => void;
}

/**
 * Layer 2 of the three-layer access model — mirrors `permissionStore`.
 * Populated once by `<EntitlementsLoader>` (mounted in AppLayout) from the
 * server-authoritative `company_entitlements()` RPC. Read by
 * `useEntitlement()`, `<EntitlementRoute>` and the sidebar. Fail-open only
 * for an *unmanaged* company (no subscription) — a managed company with a
 * lapsed subscription resolves server-side to core features only.
 */
export const useEntitlementStore = create<EntitlementState>((set) => ({
  companyId: null,
  entitlements: new Set(),
  subscription: null,
  planCode: null,
  loaded: false,
  set: (companyId, entitlements, subscription, planCode) =>
    set({ companyId, entitlements: new Set(entitlements), subscription, planCode, loaded: true }),
  clear: () => set({ companyId: null, entitlements: new Set(), subscription: null, planCode: null, loaded: false }),
}));
