import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/shadcn/table';
import { EnumSelect } from '@/components/app/combobox';
import { Amount } from '@/components/app/figure';
import type { TaxAdjustment, TaxAdjustmentCategory, TaxAdjustmentDirection } from '@/types';

const CATEGORY_LABELS: Record<TaxAdjustmentCategory, string> = {
  non_deductible_expense: 'Non-deductible expense',
  exempt_income: 'Exempt income',
  wear_and_tear_allowance: 'Wear-and-tear allowance',
  depreciation_addback: 'Depreciation add-back',
  disposal_gain_loss_addback: 'Disposal gain/loss add-back',
  recoupment_or_capital_gain: 'Recoupment / capital gain',
  donations: 'Donations',
  entertainment: 'Entertainment',
  penalties: 'Penalties',
  provisions: 'Provisions',
  bad_debts: 'Bad debts',
  interest_limitation: 'Interest limitation',
  assessed_loss_brought_forward: 'Assessed loss brought forward',
  other: 'Other',
};

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as [TaxAdjustmentCategory, string][];
const CATEGORY_ENUM_OPTIONS = CATEGORY_OPTIONS.map(([value, label]) => ({ value, label }));
const DIRECTION_OPTIONS = [
  { value: 'add', label: '+ Add' },
  { value: 'subtract', label: '- Subtract' },
];

let localIdSeq = 0;
function newLocalId(): string {
  localIdSeq += 1;
  return `adj_local_${localIdSeq}`;
}

function emptyAdjustment(): TaxAdjustment {
  return { id: newLocalId(), category: 'other', description: '', amount: 0, direction: 'add' };
}

/** Signed amount for display, matching netAdjustmentAmount()'s sign convention. */
function signedAmount(adjustment: TaxAdjustment): number {
  return adjustment.direction === 'add' ? adjustment.amount : -adjustment.amount;
}

export interface AdjustmentsTableProps {
  adjustments: TaxAdjustment[];
  /** Draft computations are editable; posted ones render read-only. */
  editable: boolean;
  onSave: (adjustments: TaxAdjustment[]) => Promise<void>;
}

/**
 * Editable accounting-profit-to-taxable-income adjustment lines. Every
 * line is pre-filled by TaxComputationService but stays fully editable
 * while the parent computation is a draft. Re-skinned onto shadcn
 * Table/Input (M7); add/remove/save logic unchanged.
 */
export function AdjustmentsTable({ adjustments, editable, onSave }: AdjustmentsTableProps) {
  const [rows, setRows] = useState<TaxAdjustment[]>(adjustments);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const updateRow = (id: string, patch: Partial<TaxAdjustment>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyAdjustment()]);
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      await onSave(rows);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save adjustments.');
    } finally {
      setSaving(false);
    }
  };

  const netTotal = rows.reduce((sum, r) => sum + signedAmount(r), 0);

  if (!editable && rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No adjustment lines were recorded for this computation.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table aria-label="Tax adjustments">
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {editable ? (
                    <EnumSelect
                      aria-label="Adjustment category"
                      value={row.category}
                      onValueChange={(value) => updateRow(row.id, { category: value as TaxAdjustmentCategory })}
                      options={CATEGORY_ENUM_OPTIONS}
                    />
                  ) : (
                    CATEGORY_LABELS[row.category]
                  )}
                </TableCell>
                <TableCell>
                  {editable ? (
                    <Input aria-label="Adjustment description" value={row.description} onChange={(e) => updateRow(row.id, { description: e.target.value })} />
                  ) : (
                    <span className="text-muted-foreground">{row.description}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {editable ? (
                    <Input
                      aria-label="Adjustment amount"
                      type="number"
                      min={0}
                      step="0.01"
                      className="text-right tabular-nums"
                      value={row.amount}
                      onChange={(e) => updateRow(row.id, { amount: Number(e.target.value) || 0 })}
                    />
                  ) : (
                    <Amount value={signedAmount(row)} />
                  )}
                </TableCell>
                <TableCell>
                  {editable ? (
                    <EnumSelect
                      aria-label="Adjustment direction"
                      value={row.direction}
                      onValueChange={(value) => updateRow(row.id, { direction: value as TaxAdjustmentDirection })}
                      options={DIRECTION_OPTIONS}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">{row.direction === 'add' ? '+' : '-'}</span>
                  )}
                </TableCell>
                <TableCell>
                  {editable && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove adjustment: ${row.description || CATEGORY_LABELS[row.category]}`}
                      onClick={() => removeRow(row.id)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-semibold">Net adjustment</TableCell>
              <TableCell />
              <TableCell className="text-right font-semibold">
                <Amount value={netTotal} />
              </TableCell>
              <TableCell />
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {editable && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={addRow}>
            <Plus /> Add Adjustment
          </Button>
          <div className="flex items-center gap-2">
            {saveError && <span className="text-xs text-destructive">{saveError}</span>}
            <Button type="button" onClick={handleSave} disabled={saving}>
              Save Adjustments
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
