import { TriangleAlertIcon } from 'lucide-react';
import type { ID } from '@/types';
import type { AccountingEffectPreview } from '../types/accountingPreview';
import { Amount } from '@/components/app/figure';
import { FormEmptyState, FormLoading } from '@/components/app/form';

export interface AccountingPreviewProps {
  preview: AccountingEffectPreview | null;
  loading?: boolean;
  error?: string;
  /** Resolves an account id to its human chart-of-accounts label. Falls back to the raw id when omitted. */
  resolveAccountLabel?: (accountId: ID) => string;
}

const GRID_COLS = 'sm:grid-cols-[2fr_110px_110px_2fr]';

/**
 * The ONE reusable accounting-preview table (Phase 5, spec §8) — shared by
 * every inventory workflow's review step (stock adjustment, stock take,
 * supplier return, opening stock, in-transit transfer). Renders exactly
 * what a workflow service's `previewXEffect()` returned; it never computes
 * or recalculates the accounting effect itself, so it can never drift from
 * what actually posts. Desktop: a table-like grid. Mobile: the same
 * stacked-pair idiom used by `LineItemsEditor`/`SalesLineItemsEditor`.
 */
export function AccountingPreview({ preview, loading, error, resolveAccountLabel }: AccountingPreviewProps) {
  if (loading) return <FormLoading label="Calculating accounting effect…" />;

  if (error) {
    return (
      <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <TriangleAlertIcon className="size-4 shrink-0" aria-hidden="true" />
        <span>{error}</span>
      </div>
    );
  }

  if (!preview) return null;

  if (preview.lines.length === 0) {
    return (
      <FormEmptyState
        title="No GL impact"
        description="This action does not post a journal entry."
      />
    );
  }

  const totalDebit = preview.lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = preview.lines.reduce((sum, l) => sum + l.credit, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className={`hidden gap-3 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:grid ${GRID_COLS}`}>
        <span>Account</span>
        <span className="text-right">Debit</span>
        <span className="text-right">Credit</span>
        <span>Reason / source</span>
      </div>

      <div className="flex flex-col gap-2">
        {preview.lines.map((line, index) => (
          <div
            key={`${line.accountId}-${index}`}
            className={`grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-border p-3 sm:grid-cols-none sm:gap-3 sm:border-0 sm:p-0 ${GRID_COLS}`}
          >
            <span className="col-span-2 text-sm font-medium sm:col-span-1">
              {resolveAccountLabel ? resolveAccountLabel(line.accountId) : line.accountId}
            </span>
            <span className="text-right text-sm tabular-nums">{line.debit > 0 ? <Amount value={line.debit} /> : null}</span>
            <span className="text-right text-sm tabular-nums">{line.credit > 0 ? <Amount value={line.credit} /> : null}</span>
            <span className="col-span-2 text-xs text-muted-foreground sm:col-span-1">{line.source}</span>
          </div>
        ))}
      </div>

      <div className={`grid grid-cols-2 gap-3 border-t border-border px-1 pt-2 text-sm font-semibold sm:grid-cols-none ${GRID_COLS}`}>
        <span>Total</span>
        <span className="text-right tabular-nums">
          <Amount value={totalDebit} />
        </span>
        <span className="text-right tabular-nums">
          <Amount value={totalCredit} />
        </span>
        <span />
      </div>

      {!preview.balanced && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <TriangleAlertIcon className="size-4 shrink-0" aria-hidden="true" />
          <span>Unbalanced preview — debits and credits do not match. Do not post; this indicates a defect.</span>
        </div>
      )}
    </div>
  );
}
