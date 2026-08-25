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
import { currentUser } from '@/lib/app/mock/admin';

/**
 * Ported from accounting-v0-frontend/components/app/user-menu.tsx.
 * currentUser is still placeholder data (see lib/app/mock/admin.ts) — a
 * later phase wires this to the real authStore/profile instead. "Sign out"
 * points at /login (this app's real route), not v0's placeholder /signin.
 */
const links = [
  { label: 'Profile settings', href: '/settings', icon: UserRound },
  { label: 'Company settings', href: '/settings', icon: Settings },
  { label: 'Users & permissions', href: '/admin/users', icon: ShieldCheck },
  { label: 'Help centre', href: '/help', icon: BookOpen },
];

export function UserMenu() {
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
            {currentUser.initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden text-sm font-medium sm:inline">
          {currentUser.name.split(' ')[0]}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{currentUser.name}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {currentUser.email}
          </span>
          <span className="mt-1 w-fit rounded-full bg-brand-muted px-2 py-0.5 text-[10px] font-medium text-brand">
            {currentUser.role}
          </span>
        </DropdownMenuLabel>
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
          <DropdownMenuItem
            render={<Link to="/login" />}
            variant="destructive"
          >
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
