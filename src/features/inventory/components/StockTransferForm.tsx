import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Product, Warehouse } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { FormBody, FormFooter } from '@/components/app/form';
import type { TransferStockInput } from '../services/stockService';

const transferSchema = z
  .object({
    productId: z.string().min(1, 'Select a product'),
    fromWarehouseId: z.string().min(1, 'Select a source warehouse'),
    toWarehouseId: z.string().min(1, 'Select a destination warehouse'),
    quantity: z.coerce.number({ invalid_type_error: 'Quantity is required' }).positive('Must be greater than 0'),
    reference: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  })
  .refine((data) => data.fromWarehouseId !== data.toWarehouseId, {
    message: 'Source and destination warehouses must differ',
    path: ['toWarehouseId'],
  });

type TransferFormValues = z.infer<typeof transferSchema>;

export interface StockTransferFormProps {
  products: Product[];
  warehouses: Warehouse[];
  onSubmit: (input: TransferStockInput) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Stock Transfer form: warehouse A -> warehouse B. Submits through
 * stockService.transferStock (via useStockMovements), which records the
 * paired transfer_out/transfer_in ledger entries — this form never writes
 * a quantity directly (docs/DO_NOT_BREAK.md § Inventory & Stock).
 * Re-skinned onto v0's Field/Input/Textarea (M8).
 */
export function StockTransferForm({ products, warehouses, onSubmit, onCancel, onDirtyChange }: StockTransferFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      productId: '',
      fromWarehouseId: '',
      toWarehouseId: '',
      quantity: 1,
      reference: '',
      notes: '',
    },
  });

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  const trackedProducts = products.filter((p) => p.trackInventory);

  const submit = handleSubmit(async (data) => {
    await onSubmit({
      productId: data.productId,
      fromWarehouseId: data.fromWarehouseId,
      toWarehouseId: data.toWarehouseId,
      quantity: data.quantity,
      reference: data.reference || undefined,
      notes: data.notes || undefined,
    });
  });

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <FormBody>
      <Field>
        <FieldLabel htmlFor="tr-product">Product</FieldLabel>
        <NativeSelect id="tr-product" {...register('productId')}>
          <option value="">Select a product…</option>
          {trackedProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} — {p.name}
            </option>
          ))}
        </NativeSelect>
        <FieldError errors={[errors.productId]} />
      </Field>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="tr-from">From Warehouse</FieldLabel>
          <NativeSelect id="tr-from" {...register('fromWarehouseId')}>
            <option value="">Select…</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </NativeSelect>
          <FieldError errors={[errors.fromWarehouseId]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="tr-to">To Warehouse</FieldLabel>
          <NativeSelect id="tr-to" {...register('toWarehouseId')}>
            <option value="">Select…</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </NativeSelect>
          <FieldError errors={[errors.toWarehouseId]} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="tr-qty">Quantity</FieldLabel>
          <Input id="tr-qty" type="number" min={1} {...register('quantity')} />
          <FieldError errors={[errors.quantity]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="tr-ref">Reference</FieldLabel>
          <Input id="tr-ref" placeholder="e.g. TRF-1042" {...register('reference')} />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="tr-notes">Notes</FieldLabel>
        <Textarea id="tr-notes" rows={2} {...register('notes')} />
      </Field>
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Transfer Stock
        </Button>
      </FormFooter>
    </form>
  );
}
