import { useState } from 'react';
import { Amount } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import type { AgingBucketKey, EclBucketLine } from '@/types';
import { recalculateBucketLine } from '../services/eclCalculations';

const BUCKET_LABELS: Record<AgingBucketKey, string> = {
  current: 'Current (not yet due)',
  days30: '1-30 days overdue',
  days60: '31-60 days overdue',
  days90Plus: '61+ days overdue',
};

export interface EclBucketTableProps {
  buckets: EclBucketLine[];
  /** Draft computations are editable; posted ones render read-only. */
  editable: boolean;
  onSave: (buckets: EclBucketLine[]) => Promise<void>;
}

/**
 * The four fixed aging-bucket rows feeding an EclComputation. Unlike
 * AdjustmentsTable/TemporaryDifferencesTable, rows are NOT
 * addable/removable — the bucket set is fixed (it matches the Customer
 * Aging Report's own four buckets), only `lossRatePercent` per bucket is
 * ever user-entered. `grossReceivable` is shown read-only even while
 * editable — it's real posted data, not something to hand-edit here
 * (recompute a fresh draft to pull in newer figures). Kept as a
 * purpose-built matrix (not the generic DataTable) — a fixed row set with
 * a totals footer doesn't need that abstraction. Re-skinned onto v0's
 * visual language (M13); `recalculateBucketLine()` remains the sole
 * source of the recomputed provision figure.
 */
export function EclBucketTable({ buckets, editable, onSave }: EclBucketTableProps) {
  const [rows, setRows] = useState<EclBucketLine[]>(buckets);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const updateRate = (bucket: AgingBucketKey, lossRatePercent: number) => {
    setRows((prev) => prev.map((r) => (r.bucket === bucket ? recalculateBucketLine({ ...r, lossRatePercent }) : r)));
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      await onSave(rows);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save loss rates.');
    } finally {
      setSaving(false);
    }
  };

  const totalGross = rows.reduce((sum, r) => sum + r.grossReceivable, 0);
  const totalEcl = rows.reduce((sum, r) => sum + r.expectedCreditLoss, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Aging bucket</th>
              <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Gross receivable</th>
              <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Loss rate %</th>
              <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Expected credit loss</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.bucket} className="border-t border-border">
                <td className="whitespace-nowrap px-4 py-2.5">{BUCKET_LABELS[row.bucket]}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                  <Amount value={row.grossReceivable} plain className="text-sm" />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                  {editable ? (
                    <Input aria-label={`${BUCKET_LABELS[row.bucket]} loss rate percent`} type="number" min={0} max={100} step="0.1" className="text-right" value={row.lossRatePercent} onChange={(e) => updateRate(row.bucket, Number(e.target.value) || 0)} />
                  ) : (
                    <span>{row.lossRatePercent}%</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                  <Amount value={row.expectedCreditLoss} plain className="text-sm" />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td className="whitespace-nowrap px-4 py-2.5">Total</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                <Amount value={totalGross} plain className="text-sm font-semibold" />
              </td>
              <td />
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                <Amount value={totalEcl} plain className="text-sm font-semibold" />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {editable && (
        <div className="flex items-center justify-end gap-3">
          {saveError && <span className="text-xs text-destructive">{saveError}</span>}
          <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
            Save Loss Rates
          </Button>
        </div>
      )}
    </div>
  );
}
