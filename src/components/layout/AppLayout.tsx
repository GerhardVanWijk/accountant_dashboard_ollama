import { Outlet } from 'react-router-dom';
import { Topbar } from './Topbar';
import { PermissionsLoader } from '@/features/auth/components/PermissionsLoader';

/**
 * Shell for every protected route (see docs/ROUTES.md). Wraps the routed
 * page in the horizontal top-bar chrome (docs/DESIGN_SYSTEM.md §
 * Navigation Layout — the left Sidebar is retired); the routed page
 * itself renders via <Outlet />. <PermissionsLoader /> mounts once here
 * (Phase T) rather than per-page, so usePermission() reads an already-
 * loaded store everywhere in the app.
 */
export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-text-primary">
      <PermissionsLoader />
      <Topbar />
      <main className="flex-1 overflow-y-auto p-lg">
        <Outlet />
      </main>
    </div>
  );
}
