import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Product, Warehouse } from '@/types';
import { Button } from '@/components/ui/Button';
import { fieldError, fieldInput, fieldLabel } from './formStyles';
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
}

/**
 * Stock Transfer form: warehouse A -> warehouse B. Submits through
 * stockService.transferStock (via useStockMovements), which records the
 * paired transfer_out/transfer_in ledger entries — this form never writes
 * a quantity directly (docs/DO_NOT_BREAK.md § Inventory & Stock).
 */
export function StockTransferForm({ products, warehouses, onSubmit, onCancel }: StockTransferFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
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
    <form onSubmit={submit} className="flex flex-col gap-md" noValidate>
      <div>
        <label className={fieldLabel} htmlFor="tr-product">
          Product
        </label>
        <select id="tr-product" className={fieldInput} {...register('productId')}>
          <option value="">Select a product…</option>
          {trackedProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} — {p.name}
            </option>
          ))}
        </select>
        {errors.productId && <p className={fieldError}>{errors.productId.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="tr-from">
            From Warehouse
          </label>
          <select id="tr-from" className={fieldInput} {...register('fromWarehouseId')}>
            <option value="">Select…</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          {errors.fromWarehouseId && <p className={fieldError}>{errors.fromWarehouseId.message}</p>}
        </div>
        <div>
          <label className={fieldLabel} htmlFor="tr-to">
            To Warehouse
          </label>
          <select id="tr-to" className={fieldInput} {...register('toWarehouseId')}>
            <option value="">Select…</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          {errors.toWarehouseId && <p className={fieldError}>{errors.toWarehouseId.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="tr-qty">
            Quantity
          </label>
          <input id="tr-qty" type="number" min={1} className={fieldInput} {...register('quantity')} />
          {errors.quantity && <p className={fieldError}>{errors.quantity.message}</p>}
        </div>
        <div>
          <label className={fieldLabel} htmlFor="tr-ref">
            Reference
          </label>
          <input id="tr-ref" className={fieldInput} placeholder="e.g. TRF-1042" {...register('reference')} />
        </div>
      </div>

      <div>
        <label className={fieldLabel} htmlFor="tr-notes">
          Notes
        </label>
        <textarea id="tr-notes" rows={2} className={fieldInput} {...register('notes')} />
      </div>

      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Transfer Stock
        </Button>
      </div>
    </form>
  );
}
