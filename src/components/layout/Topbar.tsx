import { LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { ThemeToggle } from './ThemeToggle';

export function Topbar() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-panel px-lg">
      <span className="text-sm text-text-secondary md:hidden">Accounting Suite</span>
      <div className="ml-auto flex items-center gap-md">
        <ThemeToggle />
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-xs rounded-md border border-border px-sm py-xs text-sm text-text-secondary hover:border-primary hover:text-primary"
        >
          <LogOut size={14} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </header>
  );
}
