import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { formatCurrency } from '@/utils/formatFinancial';
import { cn } from '@/utils/cn';
import type { DeferredTaxTemporaryDifference } from '@/types';
import { recalculateItem } from '../services/deferredTaxCalculations';
import { fieldInput } from './formStyles';

let localIdSeq = 0;
function newLocalId(): string {
  localIdSeq += 1;
  return `dt_local_${localIdSeq}`;
}

function emptyItem(taxRatePercent: number): DeferredTaxTemporaryDifference {
  return recalculateItem(
    { id: newLocalId(), source: 'other', description: '', carryingAmount: 0, taxBase: 0, temporaryDifference: 0, classification: 'deductible', recognized: false, deferredTaxAmount: 0 },
    taxRatePercent,
  );
}

export interface TemporaryDifferencesTableProps {
  items: DeferredTaxTemporaryDifference[];
  taxRatePercent: number;
  /** Draft computations are editable; posted ones render read-only. */
  editable: boolean;
  onSave: (items: DeferredTaxTemporaryDifference[]) => Promise<void>;
}

/**
 * Editable temporary-difference lines feeding a DeferredTaxComputation
 * (SA_ACCOUNTING_MASTER_SPEC.md §50). Mirrors AdjustmentsTable.tsx's shape
 * exactly. Every field the user can type into (carryingAmount/taxBase) is
 * re-derived through `recalculateItem()` on every edit, so
 * classification/temporaryDifference/deferredTaxAmount can never go stale
 * relative to what was typed — never trust a caller-held computed field.
 * A `source: 'fixed_asset'` row's description/carryingAmount/taxBase stay
 * editable too (an accountant may need to correct a suggested figure), but
 * its link back to the originating asset (`sourceId`) is preserved.
 */
export function TemporaryDifferencesTable({ items, taxRatePercent, editable, onSave }: TemporaryDifferencesTableProps) {
  const [rows, setRows] = useState<DeferredTaxTemporaryDifference[]>(items);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const updateRow = (id: string, patch: Partial<DeferredTaxTemporaryDifference>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? recalculateItem({ ...r, ...patch }, taxRatePercent) : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyItem(taxRatePercent)]);
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      await onSave(rows);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save temporary differences.');
    } finally {
      setSaving(false);
    }
  };

  const totalDTL = rows.filter((r) => r.classification === 'taxable').reduce((sum, r) => sum + r.deferredTaxAmount, 0);
  const totalDTA = rows.filter((r) => r.classification === 'deductible' && r.recognized).reduce((sum, r) => sum + r.deferredTaxAmount, 0);

  if (!editable && rows.length === 0) {
    return <p className="text-sm text-text-secondary">No temporary differences were recorded for this computation.</p>;
  }

  return (
    <div className="flex flex-col gap-sm">
      <div className="tabular-nums" role="table" aria-label="Deferred tax temporary differences">
        <div className="grid grid-cols-[2fr_110px_110px_110px_130px_100px_40px] gap-xs border-b border-border pb-xs text-xs font-medium text-text-secondary">
          <FinancialTableCell type="label" className="font-medium">Description</FinancialTableCell>
          <FinancialTableCell type="number" className="font-medium">Carrying Amt</FinancialTableCell>
          <FinancialTableCell type="number" className="font-medium">Tax Base</FinancialTableCell>
          <FinancialTableCell type="number" className="font-medium">Temp. Diff.</FinancialTableCell>
          <FinancialTableCell type="status" className="font-medium">Recognized</FinancialTableCell>
          <FinancialTableCell type="number" className="font-medium">Deferred Tax</FinancialTableCell>
          <FinancialTableCell type="status">{null}</FinancialTableCell>
        </div>

        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[2fr_110px_110px_110px_130px_100px_40px] items-center gap-xs border-b border-border/50 py-xs">
            <FinancialTableCell type="label">
              {editable ? (
                <input
                  aria-label="Temporary difference description"
                  className={fieldInput}
                  value={row.description}
                  onChange={(e) => updateRow(row.id, { description: e.target.value })}
                />
              ) : (
                <span className="text-sm text-text-primary">{row.description}</span>
              )}
              {row.source === 'fixed_asset' && <p className="text-xs text-text-muted">From Fixed Asset Tax Register</p>}
            </FinancialTableCell>
            <FinancialTableCell type="number">
              {editable ? (
                <input
                  aria-label="Carrying amount"
                  type="number"
                  step="0.01"
                  className={`${fieldInput} text-right tabular-nums`}
                  value={row.carryingAmount}
                  onChange={(e) => updateRow(row.id, { carryingAmount: Number(e.target.value) || 0 })}
                />
              ) : (
                <FinancialNumber value={row.carryingAmount} format={formatCurrency} showFlash={false} minWidth={80} />
              )}
            </FinancialTableCell>
            <FinancialTableCell type="number">
              {editable ? (
                <input
                  aria-label="Tax base"
                  type="number"
                  step="0.01"
                  className={`${fieldInput} text-right tabular-nums`}
                  value={row.taxBase}
                  onChange={(e) => updateRow(row.id, { taxBase: Number(e.target.value) || 0 })}
                />
              ) : (
                <FinancialNumber value={row.taxBase} format={formatCurrency} showFlash={false} minWidth={80} />
              )}
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={row.temporaryDifference} format={formatCurrency} showFlash={false} minWidth={80} />
              <p className="text-xs text-text-muted">{row.classification === 'taxable' ? 'Taxable (DTL)' : 'Deductible (DTA?)'}</p>
            </FinancialTableCell>
            <FinancialTableCell type="status">
              {row.classification === 'taxable' ? (
                <span className="text-xs text-text-secondary">Always (liability)</span>
              ) : editable ? (
                <label className="flex items-center gap-xs text-xs text-text-primary">
                  <input type="checkbox" checked={row.recognized} onChange={(e) => updateRow(row.id, { recognized: e.target.checked })} />
                  Recognize
                </label>
              ) : (
                <span className={cn('text-xs', row.recognized ? 'text-positive' : 'text-text-muted')}>
                  {row.recognized ? 'Recognized' : 'Not recognized'}
                </span>
              )}
              {row.classification === 'deductible' && row.recognized && editable && (
                <input
                  aria-label="Recognition reason"
                  className={`${fieldInput} mt-xs`}
                  placeholder="Reason (required to post)"
                  value={row.recognitionReason ?? ''}
                  onChange={(e) => updateRow(row.id, { recognitionReason: e.target.value })}
                />
              )}
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={row.deferredTaxAmount} format={formatCurrency} showFlash={false} minWidth={80} />
            </FinancialTableCell>
            <FinancialTableCell type="status">
              {editable && (
                <button
                  type="button"
                  aria-label={`Remove temporary difference: ${row.description}`}
                  onClick={() => removeRow(row.id)}
                  className="rounded-md p-xs text-text-secondary hover:bg-background hover:text-danger"
                >
                  <Icon name="delete" size={16} />
                </button>
              )}
            </FinancialTableCell>
          </div>
        ))}

        <div className="grid grid-cols-[2fr_110px_110px_110px_130px_100px_40px] items-center gap-xs pt-xs">
          <FinancialTableCell type="label" className="font-semibold">Total Deferred Tax Liability / Asset</FinancialTableCell>
          <FinancialTableCell type="number">{null}</FinancialTableCell>
          <FinancialTableCell type="number">{null}</FinancialTableCell>
          <FinancialTableCell type="number">{null}</FinancialTableCell>
          <FinancialTableCell type="status">{null}</FinancialTableCell>
          <FinancialTableCell type="number" className="font-semibold">
            <FinancialNumber value={totalDTL - totalDTA} format={formatCurrency} showFlash={false} minWidth={80} />
          </FinancialTableCell>
          <FinancialTableCell type="status">{null}</FinancialTableCell>
        </div>
      </div>

      {editable && (
        <div className="flex items-center justify-between gap-sm pt-sm">
          <Button type="button" variant="ghost" onClick={addRow}>
            <Icon name="add" size={16} /> Add Temporary Difference
          </Button>
          <div className="flex items-center gap-sm">
            {saveError && <span className="text-xs text-danger">{saveError}</span>}
            <Button type="button" onClick={handleSave} disabled={saving}>
              Save Temporary Differences
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
