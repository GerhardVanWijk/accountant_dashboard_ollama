import { Outlet } from 'react-router-dom';
import { PermissionsLoader } from '@/features/auth/components/PermissionsLoader';
import { AppSidebar } from '@/components/app/app-sidebar';
import { AppTopbar } from '@/components/app/app-topbar';
import { SidebarInset, SidebarProvider } from '@/components/ui/shadcn/sidebar';
import { Toaster } from '@/components/ui/shadcn/sonner';

/**
 * Shell for every protected route (see docs/ROUTES.md). Phase M0
 * (docs/V0_DESIGN_SYSTEM_PORT.md): swapped the old horizontal Topbar-only
 * chrome for the ported v0 sidebar+topbar shell. The old Topbar.tsx and
 * its siblings (MobileNavMenu/TopNavTabs/ThemeToggle, plus the
 * config/navigation.ts model they read from) were confirmed unused and
 * removed in M12 — see docs/V0_DESIGN_SYSTEM_PORT.md. <PermissionsLoader />
 * and <Outlet /> are untouched: same auth-gating, same routed page
 * content, only the chrome around them changed. "app-shell" is v0's own
 * class name (see globals.css) and doubles as this app's CSS scope for
 * the v0-token overrides in src/styles/tokens.css.
 */
export function AppLayout() {
  return (
    <div className="app-shell">
      <PermissionsLoader />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0 bg-background">
          <AppTopbar />
          <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-6">
            <Outlet />
          </main>
        </SidebarInset>
        <Toaster position="bottom-right" />
      </SidebarProvider>
    </div>
  );
}
