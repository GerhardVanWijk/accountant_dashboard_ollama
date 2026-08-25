import type { ReactNode } from 'react';
import { useCanAccess } from '../hooks/useCanAccess';
import { AccessDenied } from './AccessDenied';

export interface PermissionRouteProps {
  feature: string;
  action?: string;
  children: ReactNode;
}

/**
 * Route-level permission gate. Wraps one page element in `router.tsx` for
 * routes that have a genuine matching entry in the real permission
 * catalog (see `src/features/auth/permissionRouteMap.ts`) — most routes in
 * this app have no such wrapper at all, deliberately, since no matching
 * permission exists for them (M11).
 *
 * This sits ON TOP OF, not instead of, `<RouteGuard/>` — authentication
 * (signed in / has a company) is still `RouteGuard`'s job; this component
 * only adds a second, narrower check once that has already passed. It is
 * a UI convenience, not a security boundary: the same feature's real data
 * is still reachable by calling its service/repository directly, and RLS
 * (keyed off `Profile.role`, not this fine-grained catalog) is what
 * actually stops that at the database. See docs/PERMISSIONS.md.
 */
export function PermissionRoute({ feature, action, children }: PermissionRouteProps) {
  const canAccess = useCanAccess(feature, action);
  if (!canAccess) return <AccessDenied />;
  return <>{children}</>;
}
