import { AlertTriangleIcon, CheckCircle2Icon, Loader2, XCircleIcon } from 'lucide-react';
import { SectionCard } from '@/components/app/page-header';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/app/format';
import type { AssetIntegrityException, AssetIntegrityReport, AssetRegisterReconciliation } from '../services';

interface Props {
  reconciliation: AssetRegisterReconciliation | null;
  integrity: AssetIntegrityReport | null;
  loading: boolean;
  error: Error | null;
  onRefresh?: () => void;
  onOpenAsset?: (assetId: string) => void;
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1.5 text-sm', strong && 'font-medium')}>
      <span className={cn(muted && 'text-muted-foreground')}>{label}</span>
      <span className="figure tabular-nums">{value}</span>
    </div>
  );
}

const SEVERITY_STYLE: Record<AssetIntegrityException['severity'], string> = {
  error: 'border-status-negative-outline bg-status-negative-surface/40 text-status-negative',
  warning: 'border-status-warning-outline bg-status-warning-surface/40 text-status-warning',
};

function title(code: string): string {
  const s = code.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Register↔GL reconciliation and the integrity sweep for the Fixed Asset
 * Register (spec Parts L & M). Variances are surfaced with their exact
 * numbers, never hidden or coerced to zero; nothing is auto-corrected.
 */
export function AssetRegisterHealthCard({ reconciliation, integrity, loading, error, onRefresh, onOpenAsset }: Props) {
  const reconciled = reconciliation?.isReconciled ?? false;
  const clean = integrity?.isClean ?? false;
  const allGood = reconciled && clean;

  return (
    <SectionCard
      title="Register health"
      description="The register reconciled to the general ledger, plus an integrity sweep."
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
      ) : !reconciliation || !integrity ? (
        <p className="py-6 text-sm text-muted-foreground">Nothing to check yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col divide-y divide-border">
            <Row label="Cost — register" value={formatCurrency(reconciliation.totals.registerCost)} />
            <Row label="Cost — general ledger" value={formatCurrency(reconciliation.totals.glCost)} muted />
            <Row label="Accumulated depreciation — register" value={formatCurrency(reconciliation.totals.registerAccumulatedDepreciation)} />
            <Row label="Accumulated depreciation — general ledger" value={formatCurrency(reconciliation.totals.glAccumulatedDepreciation)} muted />
            <div className="flex items-center justify-between gap-3 py-2 text-sm font-medium">
              <span>Carrying value variance</span>
              <Amount value={reconciliation.totals.carryingValueVariance} />
            </div>
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
              ? 'Register reconciled and clean'
              : `${reconciled ? 'Reconciled' : 'Not reconciled'} · ${integrity.errorCount} error${integrity.errorCount === 1 ? '' : 's'}, ${integrity.warningCount} warning${integrity.warningCount === 1 ? '' : 's'}`}
          </div>

          {integrity.exceptions.length > 0 && (
            <ul className="flex flex-col gap-2">
              {integrity.exceptions.map((ex, i) => (
                <li key={`${ex.assetId}-${ex.code}-${i}`} className={cn('flex flex-col gap-1 rounded-lg border px-3 py-2.5', SEVERITY_STYLE[ex.severity])}>
                  <span className="flex items-start gap-1.5 text-sm font-semibold">
                    <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {onOpenAsset ? (
                        <RecordLink onClick={() => onOpenAsset(ex.assetId)}>{ex.assetNumber}</RecordLink>
                      ) : (
                        ex.assetNumber
                      )}{' '}
                      — {title(ex.code)}
                    </span>
                  </span>
                  <span className="text-xs leading-relaxed opacity-90">{ex.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </SectionCard>
  );
}
