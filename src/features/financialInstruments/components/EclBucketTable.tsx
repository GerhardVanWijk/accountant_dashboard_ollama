import { useState } from 'react';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/utils/formatFinancial';
import type { AgingBucketKey, EclBucketLine } from '@/types';
import { recalculateBucketLine } from '../services/eclCalculations';
import { fieldInput } from './formStyles';

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
 * The four fixed aging-bucket rows feeding an EclComputation
 * (SA_ACCOUNTING_MASTER_SPEC.md §46). Unlike AdjustmentsTable/
 * TemporaryDifferencesTable, rows are NOT addable/removable — the bucket
 * set is fixed (it matches the Customer Aging Report's own four buckets),
 * only `lossRatePercent` per bucket is ever user-entered.
 * `grossReceivable` is shown read-only even while editable — it's real
 * posted data, not something to hand-edit here (recompute a fresh draft to
 * pull in newer figures).
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
    <div className="flex flex-col gap-sm">
      <div className="tabular-nums" role="table" aria-label="Expected credit loss provision matrix">
        <div className="grid grid-cols-[1.5fr_130px_110px_130px] gap-xs border-b border-border pb-xs text-xs font-medium text-text-secondary">
          <FinancialTableCell type="label" className="font-medium">Aging Bucket</FinancialTableCell>
          <FinancialTableCell type="number" className="font-medium">Gross Receivable</FinancialTableCell>
          <FinancialTableCell type="number" className="font-medium">Loss Rate %</FinancialTableCell>
          <FinancialTableCell type="number" className="font-medium">Expected Credit Loss</FinancialTableCell>
        </div>

        {rows.map((row) => (
          <div key={row.bucket} className="grid grid-cols-[1.5fr_130px_110px_130px] items-center gap-xs border-b border-border/50 py-xs">
            <FinancialTableCell type="label">
              <span className="text-sm text-text-primary">{BUCKET_LABELS[row.bucket]}</span>
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={row.grossReceivable} format={formatCurrency} showFlash={false} minWidth={80} />
            </FinancialTableCell>
            <FinancialTableCell type="number">
              {editable ? (
                <input
                  aria-label={`${BUCKET_LABELS[row.bucket]} loss rate percent`}
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  className={`${fieldInput} text-right tabular-nums`}
                  value={row.lossRatePercent}
                  onChange={(e) => updateRate(row.bucket, Number(e.target.value) || 0)}
                />
              ) : (
                <span className="text-sm text-text-primary">{row.lossRatePercent}%</span>
              )}
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={row.expectedCreditLoss} format={formatCurrency} showFlash={false} minWidth={80} />
            </FinancialTableCell>
          </div>
        ))}

        <div className="grid grid-cols-[1.5fr_130px_110px_130px] items-center gap-xs pt-xs">
          <FinancialTableCell type="label" className="font-semibold">Total</FinancialTableCell>
          <FinancialTableCell type="number" className="font-semibold">
            <FinancialNumber value={totalGross} format={formatCurrency} showFlash={false} minWidth={80} />
          </FinancialTableCell>
          <FinancialTableCell type="number">{null}</FinancialTableCell>
          <FinancialTableCell type="number" className="font-semibold">
            <FinancialNumber value={totalEcl} format={formatCurrency} showFlash={false} minWidth={80} />
          </FinancialTableCell>
        </div>
      </div>

      {editable && (
        <div className="flex items-center justify-end gap-sm pt-sm">
          {saveError && <span className="text-xs text-danger">{saveError}</span>}
          <Button type="button" onClick={handleSave} disabled={saving}>
            Save Loss Rates
          </Button>
        </div>
      )}
    </div>
  );
}
