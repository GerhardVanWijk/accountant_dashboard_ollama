import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/**
 * Shell for every protected route (see docs/ROUTES.md). Wraps the routed
 * page in the sidebar/topbar chrome; the routed page itself renders via
 * <Outlet />.
 */
export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background text-text-primary">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-lg">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
