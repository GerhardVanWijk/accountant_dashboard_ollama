import { CheckCircle2Icon, Loader2, XCircleIcon } from 'lucide-react';
import { SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/app/format';
import type { LeaseRegisterReconciliation } from '../services';

interface Props {
  reconciliation: LeaseRegisterReconciliation | null;
  loading: boolean;
  error: Error | null;
  onRefresh?: () => void;
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1.5 text-sm', strong && 'font-medium')}>
      <span className={cn(muted && 'text-muted-foreground')}>{label}</span>
      <span className="figure tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Register↔GL reconciliation for the Lease Register (PART 1.14 of the
 * Leases + Payroll integrity audit) — mirrors AssetRegisterHealthCard.tsx.
 * Compares the lease subledger's ROU cost, accumulated depreciation and
 * outstanding liability against the three GL accounts every lease posts
 * against. Variances are surfaced with their exact numbers, never hidden or
 * coerced to zero; nothing is auto-corrected — this is an exception report,
 * not a balancing tool.
 */
export function LeaseRegisterHealthCard({ reconciliation, loading, error, onRefresh }: Props) {
  const allGood = reconciliation?.isReconciled ?? false;

  return (
    <SectionCard
      title="Register health"
      description="The lease register reconciled to the general ledger."
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
          Checking…
        </div>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-status-negative-outline bg-status-negative-surface px-3 py-2 text-sm text-status-negative">
          {error.message}
        </div>
      ) : !reconciliation ? (
        <p className="py-6 text-sm text-muted-foreground">Nothing to check yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col divide-y divide-border">
            <Row label="ROU cost — register" value={formatCurrency(reconciliation.totals.registerRouCost)} />
            <Row label="ROU cost — general ledger" value={formatCurrency(reconciliation.totals.glRouCost)} muted />
            <Row label="Accumulated depreciation — register" value={formatCurrency(reconciliation.totals.registerAccumulatedDepreciation)} />
            <Row label="Accumulated depreciation — general ledger" value={formatCurrency(reconciliation.totals.glAccumulatedDepreciation)} muted />
            <Row label="Lease liability — register" value={formatCurrency(reconciliation.totals.registerLeaseLiability)} />
            <Row label="Lease liability — general ledger" value={formatCurrency(reconciliation.totals.glLeaseLiability)} muted strong />
          </div>

          <div
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium',
              allGood
                ? 'border-status-positive-outline bg-status-positive-surface text-status-positive'
                : 'border-status-negative-outline bg-status-negative-surface text-status-negative',
            )}
          >
            {allGood ? <CheckCircle2Icon className="size-4 shrink-0" aria-hidden="true" /> : <XCircleIcon className="size-4 shrink-0" aria-hidden="true" />}
            {allGood
              ? 'Register reconciled'
              : `Not reconciled — ROU cost ${formatCurrency(reconciliation.totals.rouCostVariance)}, accumulated depreciation ${formatCurrency(reconciliation.totals.accumulatedDepreciationVariance)}, liability ${formatCurrency(reconciliation.totals.leaseLiabilityVariance)}`}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
