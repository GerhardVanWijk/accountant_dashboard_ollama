import { useEffect } from 'react';

import { useAuthStore } from '@/stores/authStore';
import { subscriptionService } from '../services';
import { useEntitlementStore } from '../stores/entitlementStore';

/**
 * Loads the current company's entitlement set once per (companyId) from the
 * server-authoritative `company_entitlements()` resolver, into
 * `entitlementStore`. Mount once in `AppLayout` beside `PermissionsLoader`.
 * Renders nothing. On failure it leaves the store unloaded — `useEntitlement`
 * treats "not loaded" as allow, so a resolver outage never locks a paying
 * customer out of their own books (server-side `require_entitlement` still
 * guards the sensitive writes).
 */
export function EntitlementsLoader() {
  const companyId = useAuthStore((s) => s.profile?.companyId);
  const set = useEntitlementStore((s) => s.set);
  const clear = useEntitlementStore((s) => s.clear);

  useEffect(() => {
    if (!companyId) {
      clear();
      return;
    }
    let cancelled = false;
    subscriptionService
      .getCompanySnapshot(companyId)
      .then(({ entitlements, subscription, planCode }) => {
        if (!cancelled) set(companyId, entitlements, subscription, planCode);
      })
      .catch((error) => console.error('EntitlementsLoader: failed to load entitlements:', error));
    return () => {
      cancelled = true;
    };
  }, [companyId, set, clear]);

  return null;
}
