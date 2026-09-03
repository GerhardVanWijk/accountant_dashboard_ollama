import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DocumentLineColumn<T> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right';
  /** Tailwind width hint, e.g. "w-24". */
  className?: string;
  cell: (row: T, index: number) => ReactNode;
}

export interface DocumentLineTotal {
  label: ReactNode;
  value: ReactNode;
  /** The grand total — rendered heavier, with the positive accent. */
  emphasis?: boolean;
}

export interface DocumentLineTableProps<T> {
  columns: DocumentLineColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  totals?: DocumentLineTotal[];
  emptyMessage?: string;
  /** Minimum table width before the wrapper scrolls horizontally. */
  minWidthClassName?: string;
}

/**
 * The one shared line-items table for every business document detail page
 * (invoice, bill, PO, sales order, credit note, supplier return, …) — so
 * there is a single layout to maintain rather than a copy-pasted `<table>`
 * per module. Full content width; only the table itself scrolls sideways
 * inside its `overflow-x-auto` wrapper, never the page.
 */
export function DocumentLineTable<T>({
  columns,
  rows,
  rowKey,
  totals,
  emptyMessage = 'No line items.',
  minWidthClassName = 'min-w-[720px]',
}: DocumentLineTableProps<T>) {
  if (rows.length === 0) {
    return <p className="px-1 py-2 text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  const totalColSpan = Math.max(columns.length - 1, 1);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className={cn('w-full border-collapse text-sm', minWidthClassName)}>
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase',
                  col.align === 'right' ? 'text-right' : 'text-left',
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} className="border-b border-border last:border-0">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-4 py-2 align-top',
                    col.align === 'right' ? 'figure text-right tabular-nums' : 'text-left',
                  )}
                >
                  {col.cell(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totals && totals.length > 0 ? (
          <tfoot>
            {totals.map((total, i) => (
              <tr
                key={i}
                className={cn(
                  'bg-muted/20',
                  i === 0 && 'border-t-2 border-border',
                  total.emphasis && 'border-t border-border bg-status-positive-muted',
                )}
              >
                <td colSpan={totalColSpan} className={cn('px-4 py-2 text-right text-sm', total.emphasis ? 'font-semibold uppercase' : 'text-muted-foreground')}>
                  {total.label}
                </td>
                <td className={cn('figure px-4 py-2 text-right tabular-nums', total.emphasis ? 'text-base font-bold text-positive' : 'font-medium')}>
                  {total.value}
                </td>
              </tr>
            ))}
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
