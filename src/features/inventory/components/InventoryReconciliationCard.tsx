import { AlertTriangleIcon, CheckCircle2Icon, Loader2, XCircleIcon } from 'lucide-react';
import { SectionCard } from '@/components/app/page-header';
import { Amount } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/app/format';
import type {
  InventoryReconciliationFinding,
  InventoryReconciliationResult,
} from '../services/reconcileInventory';

interface Props {
  result: InventoryReconciliationResult | null;
  loading: boolean;
  error: Error | null;
  onRefresh?: () => void;
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className={cn(muted ? 'text-muted-foreground' : 'text-foreground')}>{label}</span>
      <span className="figure tabular-nums">{value}</span>
    </div>
  );
}

const SEVERITY_STYLE: Record<InventoryReconciliationFinding['severity'], string> = {
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  info: 'border-border bg-muted/40 text-muted-foreground',
};

/**
 * Surfaces the Phase-3 `reconcileInventory()` engine — the subledger vs GL
 * position for Inventory Asset (1200) and Inventory in Transit (1210), the
 * exact difference, and every finding. Evidence / rounding warnings are shown
 * verbatim with their exact expected / actual / difference numbers — never
 * hidden, never coerced to R0.00 (spec item 8). The full Difference
 * Investigator is Phase 14.
 */
export function InventoryReconciliationCard({ result, loading, error, onRefresh }: Props) {
  return (
    <SectionCard
      title="Inventory reconciliation"
      description="Subledger valuation against the general ledger control accounts."
      actions={
        onRefresh ? (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            Refresh
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <div role="status" className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Reconciling…
        </div>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </div>
      ) : !result ? (
        <p className="py-6 text-sm text-muted-foreground">Nothing to reconcile yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col divide-y divide-border">
            <Row label="Inventory subledger (round-after-sum Σ qty × cost)" value={formatCurrency(result.subledgerValuation)} />
            <Row label="Inventory Asset GL — 1200" value={formatCurrency(result.inventoryGlBalance)} />
            <Row label="Inventory in transit (subledger)" value={formatCurrency(result.inTransitValuation)} muted />
            <Row label="Inventory in Transit GL — 1210" value={formatCurrency(result.inTransitGlBalance)} muted />
            <div className="flex items-center justify-between gap-3 py-2 text-sm font-medium">
              <span>Difference</span>
              <Amount value={result.totalInventoryVsGl} />
            </div>
          </div>

          <div
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium',
              result.isReconciled
                ? 'border-positive/30 bg-positive/10 text-positive'
                : 'border-destructive/30 bg-destructive/10 text-destructive',
            )}
          >
            {result.isReconciled ? (
              <CheckCircle2Icon className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <XCircleIcon className="size-4 shrink-0" aria-hidden="true" />
            )}
            {result.isReconciled ? 'Reconciled' : 'Not reconciled — investigate'}
          </div>

          {result.findings.length > 0 && (
            <ul className="flex flex-col gap-2">
              {result.findings.map((finding, i) => (
                <li
                  key={`${finding.code}-${i}`}
                  className={cn('flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs', SEVERITY_STYLE[finding.severity])}
                >
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <AlertTriangleIcon className="size-3.5 shrink-0" aria-hidden="true" />
                    {finding.code.replace(/_/g, ' ')}
                    {finding.productSku ? ` — ${finding.productSku}` : ''}
                  </span>
                  <span className="leading-relaxed opacity-90">{finding.detail}</span>
                  {(finding.expected !== 0 || finding.actual !== 0 || finding.difference !== 0) && (
                    <span className="figure tabular-nums opacity-90">
                      expected {formatCurrency(finding.expected)} · actual {formatCurrency(finding.actual)} · diff{' '}
                      {formatCurrency(finding.difference)}
                      {finding.toleranceBound != null ? ` · bound ±${formatCurrency(finding.toleranceBound)}` : ''}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </SectionCard>
  );
}
