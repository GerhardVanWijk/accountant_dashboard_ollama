import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useLogSensitiveAccess } from '@/features/auth/hooks/useLogSensitiveAccess';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Users,
  MailPlus,
  ShieldAlert,
  Server,
  LogOut,
  Menu,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/shadcn/button';
import { useAuthStore } from '@/stores/authStore';
import { Seo } from '@/lib/seo/Seo';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/admin/superuser', end: true, label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/superuser/clients', label: 'Clients', icon: Building2 },
  { to: '/admin/superuser/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/admin/superuser/users', label: 'Users', icon: Users },
  { to: '/admin/superuser/invitations', label: 'Invitations', icon: MailPlus },
  { to: '/admin/superuser/security', label: 'Security & Audit', icon: ShieldAlert },
  { to: '/admin/superuser/platform', label: 'Platform', icon: Server },
];

/**
 * The Vertex Platform Administration Console shell — deliberately NOT the
 * tenant AppLayout. A superuser has no company, so none of the accounting
 * navigation applies; this is its own two-pane admin surface
 * (docs/SUPERUSER_PLATFORM_ADMIN.md). RouteGuard confines a `superuser`
 * profile to `/admin/superuser/*`.
 */
export function SuperuserConsoleLayout() {
  useLogSensitiveAccess('Superuser platform console');
  const logout = useAuthStore((s) => s.logout);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Seo noindex />

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-border bg-card transition-transform lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex flex-col gap-1 border-b border-border px-5 py-4">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Vertex</span>
          <span className="text-base font-semibold">Platform Admin</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="flex flex-col gap-0.5">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )
                  }
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-border p-3">
          <Button variant="ghost" size="sm" onClick={logout} className="w-full justify-start gap-3 text-muted-foreground">
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </aside>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </Button>
          <span className="text-sm font-semibold">Vertex Platform Admin</span>
        </header>
        <main key={pathname} className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
