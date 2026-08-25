import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { Input } from '@/components/ui/shadcn/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/shadcn/table';
import { Amount } from '@/components/app/figure';
import { cn } from '@/lib/utils';
import type { DeferredTaxTemporaryDifference } from '@/types';
import { recalculateItem } from '../services/deferredTaxCalculations';

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
 * Editable temporary-difference lines feeding a DeferredTaxComputation.
 * Every field the user can type into (carryingAmount/taxBase) is
 * re-derived through `recalculateItem()` on every edit, so
 * classification/temporaryDifference/deferredTaxAmount can never go stale
 * relative to what was typed. Re-skinned onto shadcn Table/Input/Checkbox
 * (M7); recalculation logic unchanged.
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
    return <p className="text-sm text-muted-foreground">No temporary differences were recorded for this computation.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table aria-label="Deferred tax temporary differences">
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Carrying Amt</TableHead>
              <TableHead className="text-right">Tax Base</TableHead>
              <TableHead className="text-right">Temp. Diff.</TableHead>
              <TableHead>Recognized</TableHead>
              <TableHead className="text-right">Deferred Tax</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {editable ? (
                    <Input aria-label="Temporary difference description" value={row.description} onChange={(e) => updateRow(row.id, { description: e.target.value })} />
                  ) : (
                    row.description
                  )}
                  {row.source === 'fixed_asset' && <p className="text-xs text-muted-foreground">From Fixed Asset Tax Register</p>}
                </TableCell>
                <TableCell className="text-right">
                  {editable ? (
                    <Input aria-label="Carrying amount" type="number" step="0.01" className="text-right tabular-nums" value={row.carryingAmount} onChange={(e) => updateRow(row.id, { carryingAmount: Number(e.target.value) || 0 })} />
                  ) : (
                    <Amount value={row.carryingAmount} />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {editable ? (
                    <Input aria-label="Tax base" type="number" step="0.01" className="text-right tabular-nums" value={row.taxBase} onChange={(e) => updateRow(row.id, { taxBase: Number(e.target.value) || 0 })} />
                  ) : (
                    <Amount value={row.taxBase} />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Amount value={row.temporaryDifference} />
                  <p className="text-xs text-muted-foreground">{row.classification === 'taxable' ? 'Taxable (DTL)' : 'Deductible (DTA?)'}</p>
                </TableCell>
                <TableCell>
                  {row.classification === 'taxable' ? (
                    <span className="text-xs text-muted-foreground">Always (liability)</span>
                  ) : editable ? (
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox checked={row.recognized} onCheckedChange={(value) => updateRow(row.id, { recognized: value === true })} />
                      Recognize
                    </label>
                  ) : (
                    <span className={cn('text-xs', row.recognized ? 'text-positive' : 'text-muted-foreground')}>{row.recognized ? 'Recognized' : 'Not recognized'}</span>
                  )}
                  {row.classification === 'deductible' && row.recognized && editable && (
                    <Input aria-label="Recognition reason" className="mt-1" placeholder="Reason (required to post)" value={row.recognitionReason ?? ''} onChange={(e) => updateRow(row.id, { recognitionReason: e.target.value })} />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Amount value={row.deferredTaxAmount} />
                </TableCell>
                <TableCell>
                  {editable && (
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove temporary difference: ${row.description}`} onClick={() => removeRow(row.id)}>
                      <Trash2 />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-semibold">Total Deferred Tax Liability / Asset</TableCell>
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell className="text-right font-semibold">
                <Amount value={totalDTL - totalDTA} />
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {editable && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={addRow}>
            <Plus /> Add Temporary Difference
          </Button>
          <div className="flex items-center gap-2">
            {saveError && <span className="text-xs text-destructive">{saveError}</span>}
            <Button type="button" onClick={handleSave} disabled={saving}>
              Save Temporary Differences
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
