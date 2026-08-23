import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

/**
 * Guards the protected route tree (docs/DO_NOT_BREAK.md refers to this as
 * "the /app/* protected route structure"). Phase T replaces the old
 * boolean-stub check with real session/profile state from
 * src/stores/authStore.ts, and adds two more redirects on top of plain
 * "signed in or not":
 *
 * - A superuser (profile.role === 'superuser') is confined to
 *   /admin/superuser — they have no company, so every other route in this
 *   app would render empty/broken for them anyway (RLS blocks all of it by
 *   design, see docs/SUPABASE_MIGRATION_GUIDE.md's Phase T section).
 * - A signed-in user with no company yet (a fresh signup, before
 *   onboarding) is sent to /onboarding instead of the app shell.
 */
export function RouteGuard() {
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const { pathname } = useLocation();

  if (status === 'loading' || (status === 'authenticated' && !profile)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-text-secondary">Loading…</p>
      </div>
    );
  }

  if (status === 'unauthenticated' || !session) {
    return <Navigate to="/login" replace />;
  }

  if (profile?.role === 'superuser') {
    if (!pathname.startsWith('/admin/superuser')) {
      return <Navigate to="/admin/superuser" replace />;
    }
    return <Outlet />;
  }

  if (!profile?.companyId && pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
