import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { useAuthStore } from '@/stores/authStore';
import { Seo } from '@/lib/seo/Seo';

/**
 * Shown to every member of a company a Vertex platform superuser has
 * suspended (migration 0070). The workspace and all its records are intact;
 * access is simply blocked until the client is reactivated. No accounting
 * data was deleted.
 */
export function WorkspaceSuspendedPage() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <Seo noindex />
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-status-warning-muted text-status-warning">
          <ShieldAlert className="size-6" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-semibold">This workspace is suspended</h1>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          Access to your Vertex workspace has been temporarily suspended by the platform administrator. Your accounting
          records, users and settings are all preserved — nothing has been deleted. Please contact Vertex support to
          restore access.
        </p>
        <Button variant="outline" size="sm" onClick={logout}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
