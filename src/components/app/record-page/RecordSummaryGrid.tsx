import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The label/value overview grid for a record page — wider than the
 * sheet's single column: two columns from `sm`, three from `lg`, so a
 * document's header details use the page width instead of a tall stack.
 */
export function RecordSummaryGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {children}
    </div>
  );
}

export function RecordField({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}
