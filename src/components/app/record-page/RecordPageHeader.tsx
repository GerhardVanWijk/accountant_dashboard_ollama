import type { ComponentType, ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { Button } from '@/components/ui/shadcn/button';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RecordAction {
  label: string;
  onClick: () => void;
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
}

export interface RecordActionBarProps {
  /** The single most important next step, e.g. "Convert to invoice". */
  primary?: RecordAction;
  /** Neutral actions, e.g. Edit / Confirm. */
  secondary?: RecordAction[];
  /** Destructive actions, e.g. Cancel / Delete draft. First one shows inline; the rest fold into the overflow menu. */
  danger?: RecordAction[];
  /** Everything else, always in the "More" menu. */
  overflow?: RecordAction[];
  busy?: boolean;
}

/**
 * A clear action hierarchy for a full-page record — primary / secondary /
 * danger / overflow, instead of four equally-weighted buttons crammed into
 * a sheet's corner.
 */
export function RecordActionBar({ primary, secondary = [], danger = [], overflow = [], busy }: RecordActionBarProps) {
  const [inlineDanger, ...menuDanger] = danger;
  const menuActions = [...menuDanger, ...overflow];

  if (!primary && secondary.length === 0 && danger.length === 0 && overflow.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {secondary.map((a) => (
        <Button key={a.label} variant="outline" size="sm" disabled={busy || a.disabled} onClick={a.onClick}>
          {a.icon ? <a.icon data-icon="inline-start" /> : null}
          {a.label}
        </Button>
      ))}
      {inlineDanger ? (
        <Button variant="destructive" size="sm" disabled={busy || inlineDanger.disabled} onClick={inlineDanger.onClick}>
          {inlineDanger.icon ? <inlineDanger.icon data-icon="inline-start" /> : null}
          {inlineDanger.label}
        </Button>
      ) : null}
      {primary ? (
        <Button size="sm" disabled={busy || primary.disabled} onClick={primary.onClick}>
          {primary.icon ? <primary.icon data-icon="inline-start" /> : null}
          {primary.label}
        </Button>
      ) : null}
      {menuActions.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={busy} />}>
            More
            <ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menuActions.map((a) => (
              <DropdownMenuItem key={a.label} disabled={a.disabled} onClick={a.onClick}>
                {a.icon ? <a.icon className="size-4" /> : null}
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export interface RecordPageHeaderProps {
  /** The record identifier — INV-1080, SO-2026-0004, STA-011. Rendered on one line, never character-wrapped. */
  recordNumber: ReactNode;
  /** Secondary identity — the customer/supplier/item name. May wrap, clamped to two lines. */
  title?: ReactNode;
  /** A short status/context line under the title. */
  meta?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function RecordPageHeader({ recordNumber, title, meta, status, actions, className }: RecordPageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-4 border-b border-border pb-5', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight whitespace-nowrap [overflow-wrap:normal]">
              {recordNumber}
            </h1>
            {status}
          </div>
          {title ? <p className="line-clamp-2 max-w-2xl text-sm text-muted-foreground">{title}</p> : null}
          {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}
