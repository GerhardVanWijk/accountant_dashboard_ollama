import { Outlet, useLocation } from 'react-router-dom';

import { entitlementForPath } from '../entitlementRouteMap';
import { CORE_ENTITLEMENTS } from '../entitlements';
import { useEntitlement } from '../hooks/useEntitlement';
import { UpgradeRequired } from './UpgradeRequired';

/**
 * Layer 2 route gate. Wraps `<Outlet/>` in `AppLayout` so a company can't
 * reach a module its plan doesn't include by typing the URL. Complements
 * (does not replace) the server-side `require_entitlement(...)` guards.
 * Route families with no entitlement rule, or a core one, always render.
 */
export function EntitlementGate() {
  const { pathname } = useLocation();
  const feature = entitlementForPath(pathname);
  // Hooks must run unconditionally — resolve a stable key and gate on it.
  const gatedFeature = feature && !CORE_ENTITLEMENTS.includes(feature) ? feature : null;
  const allowed = useEntitlement(gatedFeature ?? 'dashboard');

  if (gatedFeature && !allowed) return <UpgradeRequired feature={gatedFeature} />;
  return <Outlet />;
}
