import { useEffect, useState } from 'react';
import type { NewOpeningStockLine, OpeningStockBatch, Product, Warehouse } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { EnumSelect } from '@/components/app/combobox';
import { FormBody, FormFooter } from '@/components/app/form';
import type { CreateOpeningStockBatchDTO, UpdateOpeningStockBatchDTO } from '../services/openingStockBatchService';
import { OpeningStockLinesEditor } from './OpeningStockLinesEditor';

export interface OpeningStockBatchDocumentFormProps {
  batch?: OpeningStockBatch;
  products: Product[];
  warehouses: Warehouse[];
  onSubmit: (data: CreateOpeningStockBatchDTO | UpdateOpeningStockBatchDTO) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Draft opening-stock-batch header + lines. Only ever creates/edits a
 * `draft` batch (openingStockBatchService.updateOpeningStockBatch()
 * rejects any other status) — the explicit confirmation step lives on
 * `OpeningStockBatchDetailSheet`, never here.
 */
export function OpeningStockBatchDocumentForm({ batch, products, warehouses, onSubmit, onCancel, onDirtyChange }: OpeningStockBatchDocumentFormProps) {
  const [warehouseId, setWarehouseId] = useState(batch?.warehouseId ?? warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id ?? '');
  const [effectiveDate, setEffectiveDate] = useState(batch?.effectiveDate ?? today());
  const [notes, setNotes] = useState(batch?.notes ?? '');
  const [lines, setLines] = useState<NewOpeningStockLine[]>(
    batch?.lineItems.map(({ openingStockBatchId: _id, ...line }) => {
      void _id;
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
    if (lines.some((l) => !l.productId || !l.warehouseId || l.quantity <= 0)) {
      setFormError('Every line needs a product, a warehouse and a quantity greater than zero.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        warehouseId,
        effectiveDate,
        notes: notes || undefined,
        lineItems: lines.map((line) => ({ ...line, id: line.id ?? '', openingStockBatchId: batch?.id ?? '' })),
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save the opening stock batch.');
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="osb-warehouse">Warehouse</FieldLabel>
            <EnumSelect
              id="osb-warehouse"
              value={warehouseId}
              onValueChange={(v) => markDirty(setWarehouseId)(v)}
              placeholder="Select…"
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="osb-date">Effective date</FieldLabel>
            <Input id="osb-date" type="date" value={effectiveDate} onChange={(e) => markDirty(setEffectiveDate)(e.target.value)} />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="osb-notes">Notes</FieldLabel>
          <Textarea id="osb-notes" rows={2} value={notes} onChange={(e) => markDirty(setNotes)(e.target.value)} />
          <FieldDescription>Optional context — e.g. the source of these opening balances (a migration, a stocktake at go-live).</FieldDescription>
        </Field>

        <OpeningStockLinesEditor lines={lines} onChange={markDirty(setLines)} products={products} warehouses={warehouses} />
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={submitting} onClick={() => void submit()}>
          {batch ? 'Save draft' : 'Create draft'}
        </Button>
      </FormFooter>
    </div>
  );
}
