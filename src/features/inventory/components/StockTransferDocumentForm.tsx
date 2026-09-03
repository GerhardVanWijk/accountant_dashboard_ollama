import { useEffect, useState } from 'react';
import type { NewStockTransferLine, Product, StockTransfer, Warehouse } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { EnumSelect } from '@/components/app/combobox';
import { FormBody, FormFooter } from '@/components/app/form';
import type { CreateStockTransferDTO, UpdateStockTransferDTO } from '../services/stockTransferService';
import { StockTransferLinesEditor } from './StockTransferLinesEditor';

export interface StockTransferDocumentFormProps {
  transfer?: StockTransfer;
  products: Product[];
  warehouses: Warehouse[];
  onSubmit: (data: CreateStockTransferDTO | UpdateStockTransferDTO) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Draft stock-transfer header + lines. Only ever creates/edits a `draft`
 * document (stockTransferService.updateTransfer() rejects any other
 * status) — dispatch/receive/complete are separate actions on
 * `StockTransferDetailSheet`.
 */
export function StockTransferDocumentForm({
  transfer,
  products,
  warehouses,
  onSubmit,
  onCancel,
  onDirtyChange,
}: StockTransferDocumentFormProps) {
  const [fromWarehouseId, setFromWarehouseId] = useState(transfer?.fromWarehouseId ?? warehouses[0]?.id ?? '');
  const [toWarehouseId, setToWarehouseId] = useState(transfer?.toWarehouseId ?? warehouses[1]?.id ?? '');
  const [transferDate, setTransferDate] = useState(transfer?.transferDate ?? today());
  const [expectedReceiptDate, setExpectedReceiptDate] = useState(transfer?.expectedReceiptDate ?? '');
  const [notes, setNotes] = useState(transfer?.notes ?? '');
  const [lines, setLines] = useState<NewStockTransferLine[]>(
    transfer?.lineItems.map(({ transferId: _transferId, ...line }) => {
      void _transferId;
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
    if (!fromWarehouseId || !toWarehouseId) {
      setFormError('Select both a source and a destination warehouse.');
      return;
    }
    if (fromWarehouseId === toWarehouseId) {
      setFormError('A stock transfer must move stock between two different warehouses.');
      return;
    }
    if (lines.length === 0) {
      setFormError('Add at least one line.');
      return;
    }
    if (lines.some((l) => !l.productId || l.quantity <= 0)) {
      setFormError('Every line needs a product and a quantity greater than zero.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        fromWarehouseId,
        toWarehouseId,
        transferDate,
        expectedReceiptDate: expectedReceiptDate || undefined,
        notes: notes || undefined,
        lineItems: lines.map((line) => ({ ...line, id: line.id ?? '', transferId: transfer?.id ?? '' })),
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save the stock transfer.');
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
            <FieldLabel htmlFor="st-from">From warehouse</FieldLabel>
            <EnumSelect
              id="st-from"
              value={fromWarehouseId}
              onValueChange={(v) => markDirty(setFromWarehouseId)(v)}
              placeholder="Select…"
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="st-to">To warehouse</FieldLabel>
            <EnumSelect
              id="st-to"
              value={toWarehouseId}
              onValueChange={(v) => markDirty(setToWarehouseId)(v)}
              placeholder="Select…"
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="st-date">Transfer date</FieldLabel>
            <Input id="st-date" type="date" value={transferDate} onChange={(e) => markDirty(setTransferDate)(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="st-expected">Expected receipt date</FieldLabel>
            <Input id="st-expected" type="date" value={expectedReceiptDate} onChange={(e) => markDirty(setExpectedReceiptDate)(e.target.value)} />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="st-notes">Notes</FieldLabel>
          <Textarea id="st-notes" rows={2} value={notes} onChange={(e) => markDirty(setNotes)(e.target.value)} />
          <FieldDescription>Optional context — e.g. the reason for the transfer or courier details.</FieldDescription>
        </Field>

        <StockTransferLinesEditor lines={lines} onChange={markDirty(setLines)} products={products} />
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={submitting} onClick={() => void submit()}>
          {transfer ? 'Save draft' : 'Create draft'}
        </Button>
      </FormFooter>
    </div>
  );
}
