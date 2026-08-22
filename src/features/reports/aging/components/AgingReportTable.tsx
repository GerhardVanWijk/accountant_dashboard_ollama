import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { EmptyState } from '@/components/feedback/EmptyState';
import { formatCurrency } from '@/utils/formatFinancial';
import { sumAgingBuckets } from '../utils/agingReportUtils';
import type { AgingReportRow } from '../types';

export interface AgingReportTableProps {
  /** Already filtered (zero-balance toggle) and sorted (total descending) rows to render. */
  rows: AgingReportRow[];
  /** Label for the name column header, e.g. "Customer" or "Supplier". */
  entityLabel: string;
  emptyTitle: string;
  emptyMessage: string;
}

const GRID_COLS = 'grid-cols-[2fr_120px_120px_120px_120px_120px]';

/**
 * Aged Receivables/Payables Summary table — one row per customer/supplier
 * with current/30/60/90+ buckets side by side, plus a grand-total footer
 * row (see `sumAgingBuckets`). Shared, presentational-only, driven entirely
 * by the already-computed `rows` prop: no aging math happens in this
 * component, per docs/DO_NOT_BREAK.md ("never calculate aging inside JSX").
 *
 * Not built here (out of scope, see aging-bee's task brief): drill-down
 * into individual open invoices/bills from a row, statement printing,
 * YoY/comparative aging, export/PDF/CSV, credit-limit exception flagging.
 */
export function AgingReportTable({ rows, entityLabel, emptyTitle, emptyMessage }: AgingReportTableProps) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }

  const totals = sumAgingBuckets(rows);

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className={`grid ${GRID_COLS} gap-3 border-b border-border bg-primary/10 px-4 py-3 text-sm font-semibold tabular-nums`}>
        <FinancialTableCell type="label">{entityLabel}</FinancialTableCell>
        <FinancialTableCell type="number">Current</FinancialTableCell>
        <FinancialTableCell type="number">1-30 Days</FinancialTableCell>
        <FinancialTableCell type="number">31-60 Days</FinancialTableCell>
        <FinancialTableCell type="number">90+ Days</FinancialTableCell>
        <FinancialTableCell type="number">Total</FinancialTableCell>
      </div>

      {rows.map((row) => (
        <div key={row.id} className={`grid ${GRID_COLS} gap-3 border-b border-border/50 px-4 py-3 tabular-nums`}>
          <FinancialTableCell type="label" className="font-medium">
            {row.name}
          </FinancialTableCell>
          <FinancialTableCell type="number">
            <FinancialNumber value={row.buckets.current} format={formatCurrency} showFlash={false} />
          </FinancialTableCell>
          <FinancialTableCell type="number">
            <FinancialNumber
              value={row.buckets.days30}
              format={formatCurrency}
              showFlash={false}
              className={row.buckets.days30 > 0 ? 'text-warning-financial' : undefined}
            />
          </FinancialTableCell>
          <FinancialTableCell type="number">
            <FinancialNumber
              value={row.buckets.days60}
              format={formatCurrency}
              showFlash={false}
              className={row.buckets.days60 > 0 ? 'text-warning-financial' : undefined}
            />
          </FinancialTableCell>
          <FinancialTableCell type="number">
            <FinancialNumber
              value={row.buckets.days90Plus}
              format={formatCurrency}
              showFlash={false}
              className={row.buckets.days90Plus > 0 ? 'text-negative' : undefined}
            />
          </FinancialTableCell>
          <FinancialTableCell type="number" className="font-semibold">
            <FinancialNumber value={row.buckets.total} format={formatCurrency} showFlash={false} />
          </FinancialTableCell>
        </div>
      ))}

      <div className={`grid ${GRID_COLS} gap-3 border-t-2 border-border bg-background px-4 py-3 font-bold tabular-nums`}>
        <div className="px-2 py-2 text-left text-sm">TOTAL</div>
        <div className="px-2 py-2 text-right text-sm">
          <FinancialNumber value={totals.current} format={formatCurrency} showFlash={false} />
        </div>
        <div className="px-2 py-2 text-right text-sm">
          <FinancialNumber value={totals.days30} format={formatCurrency} showFlash={false} />
        </div>
        <div className="px-2 py-2 text-right text-sm">
          <FinancialNumber value={totals.days60} format={formatCurrency} showFlash={false} />
        </div>
        <div className="px-2 py-2 text-right text-sm">
          <FinancialNumber value={totals.days90Plus} format={formatCurrency} showFlash={false} />
        </div>
        <div className="px-2 py-2 text-right text-sm">
          <FinancialNumber value={totals.total} format={formatCurrency} showFlash={false} />
        </div>
      </div>
    </div>
  );
}
