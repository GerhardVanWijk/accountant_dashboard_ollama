import { Link } from 'react-router-dom';
import { BookOpen, LogOut, Settings, ShieldCheck, UserRound } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/shadcn/avatar';
import { Button } from '@/components/ui/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { useAuthStore } from '@/stores/authStore';
import { toShellUser } from '@/features/auth/utils/shellUser';

/**
 * Ported from accounting-v0-frontend/components/app/user-menu.tsx. M6
 * (docs/SUPABASE_MIGRATION_GUIDE.md) replaced the M0 `currentUser`
 * placeholder with the real signed-in profile from `useAuthStore`, and
 * wired "Sign out" to the real `logout()` action (calls
 * `supabase.auth.signOut()` — src/stores/authStore.ts) instead of a plain
 * link to /login, which never actually cleared the Supabase session.
 */
const links = [
  { label: 'Profile settings', href: '/settings', icon: UserRound },
  { label: 'Company settings', href: '/settings', icon: Settings },
  { label: 'Users & permissions', href: '/admin/users', icon: ShieldCheck },
  { label: 'Help centre', href: '/help', icon: BookOpen },
];

export function UserMenu() {
  const profile = useAuthStore((s) => s.profile);
  const logout = useAuthStore((s) => s.logout);
  const user = toShellUser(profile);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-9 gap-2 px-1.5 sm:pr-3"
            aria-label="Open account menu"
          />
        }
      >
        <Avatar className="size-6">
          <AvatarFallback className="bg-brand-muted text-[11px] font-semibold text-brand">
            {user.initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden text-sm font-medium sm:inline">
          {user.name.split(' ')[0]}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {/*
          Real bug found while wiring this to real profile data (M6,
          docs/SUPABASE_MIGRATION_GUIDE.md): base-ui's Menu.GroupLabel
          throws "MenuGroupContext is missing" when rendered outside a
          Menu.Group — the original ported v0 JSX had DropdownMenuLabel as
          a direct child of DropdownMenuContent, uncaught until a real
          click-through test opened this menu for the first time. Fixed by
          wrapping it in its own DropdownMenuGroup (a plain, unstyled
          Menu.Group wrapper — no visual change).
        */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{user.name}</span>
            {user.email && <span className="text-xs font-normal text-muted-foreground">{user.email}</span>}
            {user.role && (
              <span className="mt-1 w-fit rounded-full bg-brand-muted px-2 py-0.5 text-[10px] font-medium text-brand">
                {user.role}
              </span>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {links.map((link) => (
            <DropdownMenuItem
              key={link.label}
              render={<Link to={link.href} />}
            >
              <link.icon />
              {link.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => logout()} variant="destructive">
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
