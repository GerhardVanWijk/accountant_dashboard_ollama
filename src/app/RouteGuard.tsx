import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

/**
 * Guards the protected route tree (docs/DO_NOT_BREAK.md refers to this
 * as "the /app/* protected route structure"). Phase 0 ships a stub auth
 * check backed by useAuthStore; the auth feature module replaces this
 * with real session/token verification later.
 */
export function RouteGuard() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
