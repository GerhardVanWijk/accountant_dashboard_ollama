import { Bell } from 'lucide-react';

import { Button } from '@/components/ui/shadcn/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/shadcn/dropdown-menu';
import { Separator } from '@/components/ui/shadcn/separator';

/**
 * This app has no notifications backend/table anywhere in the Supabase
 * schema (re-confirmed M10 — same finding as M0/M6). Rather than keep
 * showing the placeholder mock alerts the M0 port carried over (which
 * looked like real, actionable notifications tied to real routes), this is
 * an honest empty state: no unread badge, no fabricated items. Replace
 * this component's body once a real notifications table/service exists.
 */
export function NotificationMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Notifications" />}>
        <Bell />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
        </div>
        <Separator />
        <div className="flex flex-col items-center gap-1.5 px-3 py-8 text-center">
          <Bell className="size-5 text-muted-foreground/60" aria-hidden="true" />
          <p className="text-sm font-medium">No notifications yet</p>
          <p className="text-xs text-muted-foreground">Notifications aren&apos;t set up in this workspace yet.</p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
