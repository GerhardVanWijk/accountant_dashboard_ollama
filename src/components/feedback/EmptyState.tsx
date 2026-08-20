import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

export interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

/**
 * Base "no data yet" indicator. Every feature component's "empty" state
 * (docs/ARCHITECTURE.md § Component State) should render this.
 */
export function EmptyState({
  title = 'Nothing here yet',
  message = 'There is no data to display.',
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-sm rounded-md border border-dashed border-border p-2xl text-center">
      <span className="text-text-muted" aria-hidden="true">
        {icon ?? <Icon name="empty" size={28} />}
      </span>
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      <p className="text-sm text-text-secondary">{message}</p>
      {action}
    </div>
  );
}
