import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { formatCurrency } from '@/utils/formatFinancial';
import type { TaxAdjustment, TaxAdjustmentCategory, TaxAdjustmentDirection } from '@/types';
import { fieldInput } from './formStyles';

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
 * Editable accounting-profit-to-taxable-income adjustment lines
 * (SA_ACCOUNTING_MASTER_SPEC.md §51). Every line is pre-filled by
 * TaxComputationService but stays fully editable (amount/direction/
 * category/description, add/remove lines) while the parent computation is
 * a draft — §111 "professional review required", this is guidance, not
 * gospel. Parent should pass `key={computation.id}` so switching financial
 * year remounts this with a fresh local copy instead of merging stale
 * edits across computations.
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
    return <p className="text-sm text-text-secondary">No adjustment lines were recorded for this computation.</p>;
  }

  return (
    <div className="flex flex-col gap-sm">
      <div className="tabular-nums" role="table" aria-label="Tax adjustments">
        <div className="grid grid-cols-[1.5fr_2fr_120px_100px_40px] gap-xs border-b border-border pb-xs text-xs font-medium text-text-secondary">
          <FinancialTableCell type="label" className="font-medium">
            Category
          </FinancialTableCell>
          <FinancialTableCell type="label" className="font-medium">
            Description
          </FinancialTableCell>
          <FinancialTableCell type="number" className="font-medium">
            Amount
          </FinancialTableCell>
          <FinancialTableCell type="status" className="font-medium">
            Direction
          </FinancialTableCell>
          <FinancialTableCell type="status">{null}</FinancialTableCell>
        </div>

        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[1.5fr_2fr_120px_100px_40px] items-center gap-xs border-b border-border/50 py-xs">
            <FinancialTableCell type="label">
              {editable ? (
                <select
                  aria-label="Adjustment category"
                  className={fieldInput}
                  value={row.category}
                  onChange={(e) => updateRow(row.id, { category: e.target.value as TaxAdjustmentCategory })}
                >
                  {CATEGORY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-text-primary">{CATEGORY_LABELS[row.category]}</span>
              )}
            </FinancialTableCell>
            <FinancialTableCell type="label">
              {editable ? (
                <input
                  aria-label="Adjustment description"
                  className={fieldInput}
                  value={row.description}
                  onChange={(e) => updateRow(row.id, { description: e.target.value })}
                />
              ) : (
                <span className="text-sm text-text-secondary">{row.description}</span>
              )}
            </FinancialTableCell>
            <FinancialTableCell type="number">
              {editable ? (
                <input
                  aria-label="Adjustment amount"
                  type="number"
                  min={0}
                  step="0.01"
                  className={`${fieldInput} text-right tabular-nums`}
                  value={row.amount}
                  onChange={(e) => updateRow(row.id, { amount: Number(e.target.value) || 0 })}
                />
              ) : (
                <FinancialNumber value={signedAmount(row)} format={formatCurrency} minWidth={90} />
              )}
            </FinancialTableCell>
            <FinancialTableCell type="status">
              {editable ? (
                <select
                  aria-label="Adjustment direction"
                  className={fieldInput}
                  value={row.direction}
                  onChange={(e) => updateRow(row.id, { direction: e.target.value as TaxAdjustmentDirection })}
                >
                  <option value="add">+ Add</option>
                  <option value="subtract">- Subtract</option>
                </select>
              ) : (
                <span className="text-xs text-text-secondary">{row.direction === 'add' ? '+' : '-'}</span>
              )}
            </FinancialTableCell>
            <FinancialTableCell type="status">
              {editable && (
                <button
                  type="button"
                  aria-label={`Remove adjustment: ${row.description || CATEGORY_LABELS[row.category]}`}
                  onClick={() => removeRow(row.id)}
                  className="rounded-md p-xs text-text-secondary hover:bg-background hover:text-danger"
                >
                  <Icon name="delete" size={16} />
                </button>
              )}
            </FinancialTableCell>
          </div>
        ))}

        <div className="grid grid-cols-[1.5fr_2fr_120px_100px_40px] items-center gap-xs pt-xs">
          <FinancialTableCell type="label" className="font-semibold">
            Net adjustment
          </FinancialTableCell>
          <FinancialTableCell type="label">{null}</FinancialTableCell>
          <FinancialTableCell type="number" className="font-semibold">
            <FinancialNumber value={netTotal} format={formatCurrency} minWidth={90} />
          </FinancialTableCell>
          <FinancialTableCell type="status">{null}</FinancialTableCell>
          <FinancialTableCell type="status">{null}</FinancialTableCell>
        </div>
      </div>

      {editable && (
        <div className="flex items-center justify-between gap-sm pt-sm">
          <Button type="button" variant="ghost" onClick={addRow}>
            <Icon name="add" size={16} /> Add Adjustment
          </Button>
          <div className="flex items-center gap-sm">
            {saveError && <span className="text-xs text-danger">{saveError}</span>}
            <Button type="button" onClick={handleSave} disabled={saving}>
              Save Adjustments
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
