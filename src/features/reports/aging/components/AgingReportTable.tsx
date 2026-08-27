import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/shadcn/empty';
import { sumAgingBuckets } from '../utils/agingReportUtils';
import type { AgingReportRow } from '../types';

export interface AgingReportTableProps {
  /** Already filtered (zero-balance toggle) and sorted (total descending) rows to render. */
  rows: AgingReportRow[];
  /** Label for the name column header, e.g. "Customer" or "Supplier". */
  entityLabel: string;
  emptyTitle: string;
  emptyMessage: string;
  /** Opens the record-detail sheet for this row's real customer/supplier id. */
  onSelect?: (id: string) => void;
}

/**
 * Aged Receivables/Payables Summary table — one row per customer/supplier
 * with current/30/60/90+ buckets side by side, plus a grand-total footer
 * row. Presentational-only, driven entirely by the already-computed `rows`
 * prop: no aging math happens in this component. Re-skinned onto v0's
 * table visual language (M9), matching
 * `src/features/purchases/pages/VendorAgingPage.tsx`'s equivalent table
 * shape for consistency across both aging reports in the app.
 */
export function AgingReportTable({ rows, entityLabel, emptyTitle, emptyMessage, onSelect }: AgingReportTableProps) {
  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyTitle>{emptyTitle}</EmptyTitle>
        <EmptyDescription>{emptyMessage}</EmptyDescription>
      </Empty>
    );
  }

  const totals = sumAgingBuckets(rows);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">{entityLabel}</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Current</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">1-30 Days</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">31-60 Days</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">90+ Days</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border">
              <td className="whitespace-nowrap px-4 py-2.5 font-medium">
                {onSelect ? <RecordLink onClick={() => onSelect(row.id)}>{row.name}</RecordLink> : row.name}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                <Amount value={row.buckets.current} />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                <Amount value={row.buckets.days30} className={row.buckets.days30 > 0 ? 'text-warning' : undefined} />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                <Amount value={row.buckets.days60} className={row.buckets.days60 > 0 ? 'text-warning' : undefined} />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                <Amount value={row.buckets.days90Plus} className={row.buckets.days90Plus > 0 ? 'text-destructive' : undefined} />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums">
                <Amount value={row.buckets.total} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-semibold">
            <td className="whitespace-nowrap px-4 py-2.5">Total</td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
              <Amount value={totals.current} />
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
              <Amount value={totals.days30} />
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
              <Amount value={totals.days60} />
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
              <Amount value={totals.days90Plus} />
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
              <Amount value={totals.total} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
