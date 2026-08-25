import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';

export interface AccessDeniedProps {
  /** Optional context line, e.g. naming the area — never exposes the raw permission key/feature name to the end user. */
  description?: string;
}

/**
 * Reusable "you don't have access to this" state for a gated route — v0's
 * general empty/error-state visual language (icon + heading + description +
 * a way back), not a bespoke one-off design. Deliberately says nothing
 * about the underlying `feature`/`action` permission key: that's an
 * implementation detail, not something to surface to a user who can't see
 * the page anyway.
 */
export function AccessDenied({ description }: AccessDeniedProps) {
  return (
    <div role="alert" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldAlert className="size-6" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">You don&apos;t have access to this page</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{description ?? 'Ask a company admin to grant you the role that includes this area.'}</p>
      </div>
      <Button variant="outline" size="sm" render={<Link to="/" />}>
        Back to dashboard
      </Button>
    </div>
  );
}
