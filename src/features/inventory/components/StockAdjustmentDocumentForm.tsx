import { useEffect, useState } from 'react';
import type { NewStockAdjustmentLine, Product, StockAdjustment, StockAdjustmentReason, Warehouse } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { FormBody, FormFooter } from '@/components/app/form';
import type { CreateStockAdjustmentDTO, UpdateStockAdjustmentDTO } from '../services/stockAdjustmentService';
import { StockAdjustmentLinesEditor } from './StockAdjustmentLinesEditor';

const REASON_LABEL: Record<StockAdjustmentReason, string> = {
  write_off: 'Write-off',
  shrinkage: 'Shrinkage',
  damage: 'Damage',
  stock_gain: 'Stock gain',
  correction: 'Correction',
  other: 'Other adjustment',
};

export interface StockAdjustmentDocumentFormProps {
  adjustment?: StockAdjustment;
  products: Product[];
  warehouses: Warehouse[];
  onSubmit: (data: CreateStockAdjustmentDTO | UpdateStockAdjustmentDTO) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Draft stock-adjustment header + lines. Only ever creates/edits a
 * `draft` document (stockAdjustmentService.updateAdjustment() rejects any
 * other status) — review, approval and posting are separate actions on
 * `StockAdjustmentDetailSheet`, not this form. A line's `warehouseId`
 * defaults to the header warehouse when it's still blank, but the header
 * field itself is only ever a convenience default: `StockAdjustment` (the
 * type) keeps its own header-level `warehouseId` alongside each line's,
 * matching migration 0027's schema.
 */
export function StockAdjustmentDocumentForm({
  adjustment,
  products,
  warehouses,
  onSubmit,
  onCancel,
  onDirtyChange,
}: StockAdjustmentDocumentFormProps) {
  const [warehouseId, setWarehouseId] = useState(adjustment?.warehouseId ?? warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id ?? '');
  const [adjustmentDate, setAdjustmentDate] = useState(adjustment?.adjustmentDate ?? today());
  const [reason, setReason] = useState<StockAdjustmentReason>(adjustment?.reason ?? 'write_off');
  const [notes, setNotes] = useState(adjustment?.notes ?? '');
  const [lines, setLines] = useState<NewStockAdjustmentLine[]>(
    adjustment?.lineItems.map(({ adjustmentId: _adjustmentId, ...line }) => {
      void _adjustmentId;
      return line;
    }) ?? [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => {
      setDirty(true);
      setter(v);
    };
  }

  const submit = async () => {
    setFormError(null);
    if (!warehouseId) {
      setFormError('Select a warehouse.');
      return;
    }
    if (lines.length === 0) {
      setFormError('Add at least one line.');
      return;
    }
    if (lines.some((l) => !l.productId || !l.warehouseId || l.quantityDelta === 0)) {
      setFormError('Every line needs a product, a warehouse and a non-zero quantity.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        warehouseId,
        adjustmentDate,
        reason,
        notes: notes || undefined,
        lineItems: lines.map((line) => ({ ...line, id: line.id ?? '', adjustmentId: adjustment?.id ?? '' })),
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save the stock adjustment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FormBody>
        {formError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="sa-warehouse">Warehouse</FieldLabel>
            <NativeSelect id="sa-warehouse" value={warehouseId} onChange={(e) => markDirty(setWarehouseId)(e.target.value)}>
              <option value="">Select…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="sa-date">Adjustment date</FieldLabel>
            <Input id="sa-date" type="date" value={adjustmentDate} onChange={(e) => markDirty(setAdjustmentDate)(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="sa-reason">Reason</FieldLabel>
            <NativeSelect id="sa-reason" value={reason} onChange={(e) => markDirty(setReason)(e.target.value as StockAdjustmentReason)}>
              {Object.entries(REASON_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="sa-notes">Notes</FieldLabel>
          <Textarea id="sa-notes" rows={2} value={notes} onChange={(e) => markDirty(setNotes)(e.target.value)} />
          <FieldDescription>Explain what happened — required context for anyone reviewing this before posting.</FieldDescription>
        </Field>

        <StockAdjustmentLinesEditor
          lines={lines}
          onChange={markDirty(setLines)}
          products={products}
          warehouses={warehouses}
        />
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={submitting} onClick={() => void submit()}>
          {adjustment ? 'Save draft' : 'Create draft'}
        </Button>
      </FormFooter>
    </div>
  );
}
