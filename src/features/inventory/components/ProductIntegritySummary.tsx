import { AlertTriangleIcon, CheckCircle2Icon, Loader2, ShieldAlertIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/app/format';
import type { InventoryReconciliationFinding } from '../services/reconcileInventory';
import {
  PRODUCT_INTEGRITY_LABEL,
  type ProductIntegritySummary as Summary,
} from '../services/productIntegrity';

const STATUS_STYLE: Record<Summary['status'], string> = {
  not_tracked: 'border-border bg-muted/40 text-muted-foreground',
  reconciled: 'border-status-positive-outline bg-status-positive-surface/40 text-status-positive',
  attention: 'border-status-warning-outline bg-status-warning-surface/50 text-status-warning',
  investigate: 'border-status-negative-outline bg-status-negative-surface/50 text-status-negative',
};

const FINDING_STYLE: Record<InventoryReconciliationFinding['severity'], string> = {
  error: 'border-status-negative-outline bg-status-negative-surface/40 text-status-negative',
  warning: 'border-status-warning-outline bg-status-warning-surface/40 text-status-warning',
  info: 'border-border bg-muted/40 text-muted-foreground',
};

/**
 * Per-product stock integrity status + the exact findings behind it. Reuses
 * `reconcileInventory()`'s findings verbatim (via `selectProductFindings` /
 * `summarizeProductIntegrity`) — it reproduces none of the reconciliation
 * math, and it never coerces a difference to zero (spec: report, don't hide).
 */
export function ProductIntegritySummary({
  summary,
  loading,
  error,
  warehouseName,
  className,
}: {
  summary: Summary | null;
  loading?: boolean;
  error?: Error | null;
  /** Resolve a finding's `warehouseId` to a human name. */
  warehouseName?: (id: string) => string;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground', className)}>
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Checking stock integrity…
      </div>
    );
  }
  if (error) {
    return (
      <div className={cn('rounded-lg border border-status-negative-outline bg-status-negative-surface/40 px-3 py-2.5 text-sm text-status-negative', className)}>
        Stock integrity check unavailable: {error.message}
      </div>
    );
  }
  if (!summary) return null;

  const Icon =
    summary.status === 'reconciled'
      ? CheckCircle2Icon
      : summary.status === 'investigate'
        ? ShieldAlertIcon
        : AlertTriangleIcon;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium',
          STATUS_STYLE[summary.status],
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span>{PRODUCT_INTEGRITY_LABEL[summary.status]}</span>
        {summary.status !== 'reconciled' && summary.status !== 'not_tracked' && (
          <span className="ml-auto text-xs font-normal opacity-80">
            {summary.errorCount > 0 && `${summary.errorCount} error${summary.errorCount === 1 ? '' : 's'}`}
            {summary.errorCount > 0 && summary.warningCount > 0 && ' · '}
            {summary.warningCount > 0 && `${summary.warningCount} warning${summary.warningCount === 1 ? '' : 's'}`}
          </span>
        )}
      </div>

      {summary.findings.length > 0 && (
        <ul className="flex flex-col gap-2">
          {summary.findings.map((f, i) => (
            <li
              key={`${f.code}-${i}`}
              className={cn('flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs', FINDING_STYLE[f.severity])}
            >
              <span className="inline-flex items-center gap-1.5 font-medium">
                <AlertTriangleIcon className="size-3.5 shrink-0" aria-hidden="true" />
                {f.code.replace(/_/g, ' ')}
                {f.warehouseId && warehouseName ? ` — ${warehouseName(f.warehouseId)}` : ''}
              </span>
              <span className="leading-relaxed opacity-90">{f.detail}</span>
              {(f.expected !== 0 || f.actual !== 0 || f.difference !== 0) && (
                <span className="figure tabular-nums opacity-90">
                  expected {fmt(f.expected)} · actual {fmt(f.actual)} · difference {fmt(f.difference)}
                  {f.toleranceBound != null ? ` · allowed ±${fmt(f.toleranceBound)}` : ''}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {summary.status !== 'reconciled' && summary.status !== 'not_tracked' && (
        <Link
          to="/inventory/reports/inventory-reconciliation"
          className="text-xs font-medium text-brand hover:underline"
        >
          Open the full inventory reconciliation report →
        </Link>
      )}
    </div>
  );
}

/** Findings mix quantities and money; show whole numbers plainly, money with the currency. */
function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : formatCurrency(v);
}
