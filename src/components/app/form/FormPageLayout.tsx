import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/app/page-header';

/**
 * Centered, width-capped shell for a form that lives on its own page
 * (SupplierFormPage, CompanyPage, "Create delivery / return" pages, the
 * document create pages) rather than in a `FormShell` dialog (docs brief
 * §1, §16 — decision: "Centered card, max-w-4xl / 6xl").
 *
 * A page form must not stretch its fields across the full content area of a
 * wide monitor. This puts the whole form in a centered column:
 *
 * - `size="standard"` → `max-w-4xl` (56rem): entity forms — Supplier,
 *   Company, a create-delivery form.
 * - `size="document"` → `max-w-6xl` (72rem): forms with a line-item table
 *   that legitimately needs the room — the document create pages. The
 *   metadata grid inside still constrains itself (`FormGrid` / a
 *   `max-w-3xl` wrapper); only the line table uses the full width.
 *
 * `surface="card"` (default) wraps the body in the same rounded hairline
 * card every module page uses; `surface="plain"` is for a page that
 * composes its own `SectionCard`s.
 */
export interface FormPageLayoutProps {
  title: string;
  description?: string;
  size?: 'standard' | 'document';
  surface?: 'card' | 'plain';
  /** Back-link target above the heading (e.g. the record it belongs to). */
  backTo?: string;
  backLabel?: string;
  /** Right-hand actions in the page header. */
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

const maxWidthClass: Record<NonNullable<FormPageLayoutProps['size']>, string> = {
  standard: 'max-w-4xl',
  document: 'max-w-6xl',
};

export function FormPageLayout({
  title,
  description,
  size = 'standard',
  surface = 'card',
  backTo,
  backLabel = 'Back',
  actions,
  className,
  bodyClassName,
  children,
}: FormPageLayoutProps) {
  return (
    <div
      data-slot="form-page-layout"
      className={cn('mx-auto flex w-full flex-col gap-6', maxWidthClass[size], className)}
    >
      {backTo ? (
        <Link
          to={backTo}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {backLabel}
        </Link>
      ) : null}

      <PageHeader title={title} description={description} actions={actions} />

      {surface === 'card' ? (
        <div
          className={cn(
            'flex flex-col overflow-hidden rounded-xl border border-border bg-card',
            bodyClassName,
          )}
        >
          {children}
        </div>
      ) : (
        <div className={cn('flex flex-col gap-6', bodyClassName)}>{children}</div>
      )}
    </div>
  );
}
