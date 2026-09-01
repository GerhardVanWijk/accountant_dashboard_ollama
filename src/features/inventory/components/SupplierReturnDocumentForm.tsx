import { useEffect, useState } from 'react';
import type { NewSupplierReturnLine, Product, Supplier, SupplierReturn, TaxRate, Warehouse } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { FormBody, FormFooter } from '@/components/app/form';
import type { CreateSupplierReturnDTO, UpdateSupplierReturnDTO } from '../services/supplierReturnService';
import { SupplierReturnLinesEditor } from './SupplierReturnLinesEditor';

export interface SupplierReturnDocumentFormProps {
  supplierReturn?: SupplierReturn;
  products: Product[];
  warehouses: Warehouse[];
  suppliers: Supplier[];
  taxRates: TaxRate[];
  onSubmit: (data: CreateSupplierReturnDTO | UpdateSupplierReturnDTO) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Draft supplier-return header + lines. Only ever creates/edits a `draft`
 * document (supplierReturnService.updateSupplierReturn() rejects any
 * other status) — posting is a separate action on
 * `SupplierReturnDetailSheet`. `billId`/`purchaseOrderId` source-linking
 * (which changes the settlement leg between AP and GRNI — see
 * `buildReturnLines()`) is left for a future pass; every return created
 * here settles against Accounts Payable.
 */
export function SupplierReturnDocumentForm({
  supplierReturn,
  products,
  warehouses,
  suppliers,
  taxRates,
  onSubmit,
  onCancel,
  onDirtyChange,
}: SupplierReturnDocumentFormProps) {
  const [supplierId, setSupplierId] = useState(supplierReturn?.supplierId ?? suppliers[0]?.id ?? '');
  const [returnDate, setReturnDate] = useState(supplierReturn?.returnDate ?? today());
  const [reason, setReason] = useState(supplierReturn?.reason ?? '');
  const [notes, setNotes] = useState(supplierReturn?.notes ?? '');
  const [lines, setLines] = useState<NewSupplierReturnLine[]>(
    supplierReturn?.lineItems.map(({ supplierReturnId: _id, ...line }) => {
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
    if (!supplierId) {
      setFormError('Select a supplier.');
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
        supplierId,
        returnDate,
        reason: reason || undefined,
        notes: notes || undefined,
        lineItems: lines.map((line) => ({ ...line, id: line.id ?? '', supplierReturnId: supplierReturn?.id ?? '' })),
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save the supplier return.');
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
            <FieldLabel htmlFor="sr-supplier">Supplier</FieldLabel>
            <NativeSelect id="sr-supplier" value={supplierId} onChange={(e) => markDirty(setSupplierId)(e.target.value)}>
              <option value="">Select…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="sr-date">Return date</FieldLabel>
            <Input id="sr-date" type="date" value={returnDate} onChange={(e) => markDirty(setReturnDate)(e.target.value)} />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="sr-reason">Reason</FieldLabel>
          <Input id="sr-reason" value={reason} onChange={(e) => markDirty(setReason)(e.target.value)} placeholder="e.g. Damaged on arrival" />
        </Field>

        <Field>
          <FieldLabel htmlFor="sr-notes">Notes</FieldLabel>
          <Textarea id="sr-notes" rows={2} value={notes} onChange={(e) => markDirty(setNotes)(e.target.value)} />
          <FieldDescription>Optional context for whoever reviews this before posting.</FieldDescription>
        </Field>

        <SupplierReturnLinesEditor lines={lines} onChange={markDirty(setLines)} products={products} warehouses={warehouses} taxRates={taxRates} />
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={submitting} onClick={() => void submit()}>
          {supplierReturn ? 'Save draft' : 'Create draft'}
        </Button>
      </FormFooter>
    </div>
  );
}
