import type { ReactNode } from 'react';
import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/shadcn/button';
import { useFormShell } from './form-shell-context';

export interface FormHeaderProps {
  title: ReactNode;
  /** One-line context under the title. */
  description?: ReactNode;
  /** Status badge / chip rendered next to the title. */
  badge?: ReactNode;
  /** Record number or reference, e.g. `INV-2026-014` — shown under the title. */
  recordRef?: ReactNode;
  /** Extra actions on the right, before the close button. */
  actions?: ReactNode;
  /** Hide the × button (rare — e.g. a blocking step in a wizard). */
  hideClose?: boolean;
  className?: string;
}

/**
 * The fixed header of a `FormShell` (P3B.2). Sits outside the scroll region,
 * so it stays put while the body scrolls. Every form gets the same title /
 * reference / badge / actions layout instead of inventing its own spacing.
 *
 * When rendered inside a `FormShell` it supplies the surface's accessible
 * name/description (base-ui `Title` / `Description`) and wires the × button
 * to the shell's unsaved-changes-aware close. Outside a shell it degrades to
 * a plain `<h2>` so it is still usable in isolation / tests.
 */
export function FormHeader({
  title,
  description,
  badge,
  recordRef,
  actions,
  hideClose = false,
  className,
}: FormHeaderProps) {
  const shell = useFormShell();
  const Title = shell?.Title ?? 'h2';
  const Description = shell?.Description ?? 'p';

  return (
    <div
      data-slot="form-header"
      className={cn(
        'flex shrink-0 items-start justify-between gap-3 border-b border-border p-4 sm:px-6',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <Title className="truncate text-base leading-none font-medium text-foreground">{title}</Title>
          {badge}
        </div>
        {recordRef ? (
          <span className="figure text-xs text-muted-foreground tabular-nums">{recordRef}</span>
        ) : null}
        {description ? (
          <Description className="text-sm leading-relaxed text-muted-foreground">{description}</Description>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {actions}
        {!hideClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={() => shell?.requestClose()}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
