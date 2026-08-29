import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface FormBodyProps {
  children: ReactNode;
  className?: string;
  /** Override the default `flex flex-col gap-6` inner layout. */
  contentClassName?: string;
}

/**
 * The single scrolling region of a `FormShell` (P3B.3).
 *
 * `flex-1 min-h-0 overflow-y-auto` is the whole point: the body — and only
 * the body — scrolls, so the surface never resizes when content changes and
 * the header/footer stay pinned. Consistent padding and a `gap-6` section
 * rhythm come for free. Use `FormTabs` INSTEAD of `FormBody` for a tabbed
 * form (each tab panel is its own body).
 */
export function FormBody({ children, className, contentClassName }: FormBodyProps) {
  return (
    <div
      data-slot="form-body"
      className={cn('app-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:px-6 sm:py-5', className)}
    >
      <div className={cn('flex flex-col gap-6', contentClassName)}>{children}</div>
    </div>
  );
}

export interface FormSectionProps {
  /** Section heading — rendered as a `<legend>`. Omit for an untitled group. */
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A titled group of fields inside a `FormBody` — the form-scale counterpart
 * of `RecordDetailSection`. A real `<fieldset>`/`<legend>` so grouping is
 * exposed to assistive tech.
 */
export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <fieldset data-slot="form-section" className={cn('flex min-w-0 flex-col gap-4', className)}>
      {title ? <legend className="text-sm font-semibold text-foreground">{title}</legend> : null}
      {description ? <p className="-mt-2 text-sm text-muted-foreground">{description}</p> : null}
      {children}
    </fieldset>
  );
}

/**
 * Loading state that PRESERVES the shell (P3C). The surface has already
 * opened at its `size` dimensions; this just fills the body — no
 * tiny-spinner-then-huge-form jump.
 */
export function FormLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-3 py-12 text-muted-foreground"
    >
      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/**
 * Not-found / empty state for a detail surface — same footprint as
 * `FormLoading` so the shell does not resize between states.
 */
export function FormEmptyState({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
      {icon}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="text-sm">{description}</p> : null}
    </div>
  );
}
