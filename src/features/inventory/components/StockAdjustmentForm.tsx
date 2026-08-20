import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Product, Warehouse } from '@/types';
import { Button } from '@/components/ui/Button';
import { fieldError, fieldHint, fieldInput, fieldLabel } from './formStyles';
import type { AdjustStockInput, OpeningStockInput } from '../services/stockService';

const REASON_PRESETS = ['Write-off', 'Damage', 'Shrinkage', 'Stock take variance', 'Other'] as const;

const adjustmentSchema = z.object({
  movementKind: z.enum(['adjustment', 'opening']),
  productId: z.string().min(1, 'Select a product'),
  warehouseId: z.string().min(1, 'Select a warehouse'),
  direction: z.enum(['increase', 'decrease']),
  quantity: z.coerce.number({ invalid_type_error: 'Quantity is required' }).positive('Must be greater than 0'),
  reasonPreset: z.string().optional(),
  reason: z.string().trim().optional(),
  reference: z.string().trim().optional(),
});

type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

export interface StockAdjustmentFormProps {
  products: Product[];
  warehouses: Warehouse[];
  onSubmitAdjustment: (input: AdjustStockInput) => Promise<void>;
  onSubmitOpening: (input: OpeningStockInput) => Promise<void>;
  onCancel: () => void;
}

/**
 * Stock Adjustment / Opening Stock form. Never lets a caller edit a bare
 * quantity: an 'adjustment' movement always requires a reason
 * (write-off/damage/shrinkage/count variance/other), and both paths go
 * through stockService (via useStockMovements), which is the only place
 * quantities are written (docs/DO_NOT_BREAK.md § Inventory & Stock).
 */
export function StockAdjustmentForm({
  products,
  warehouses,
  onSubmitAdjustment,
  onSubmitOpening,
  onCancel,
}: StockAdjustmentFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      movementKind: 'adjustment',
      productId: '',
      warehouseId: '',
      direction: 'decrease',
      quantity: 1,
      reasonPreset: REASON_PRESETS[0],
      reason: '',
      reference: '',
    },
  });

  const movementKind = watch('movementKind');
  const trackedProducts = products.filter((p) => p.trackInventory);

  const submit = handleSubmit(async (data) => {
    if (data.movementKind === 'opening') {
      await onSubmitOpening({
        productId: data.productId,
        warehouseId: data.warehouseId,
        quantity: data.quantity,
        reference: data.reference || undefined,
        notes: data.reason || 'Opening stock',
      });
      return;
    }

    const reason = [data.reasonPreset, data.reason].filter(Boolean).join(' — ');
    await onSubmitAdjustment({
      productId: data.productId,
      warehouseId: data.warehouseId,
      quantityDelta: data.direction === 'decrease' ? -Math.abs(data.quantity) : Math.abs(data.quantity),
      reason: reason || 'Stock adjustment',
      reference: data.reference || undefined,
    });
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-md" noValidate>
      <div>
        <label className={fieldLabel} htmlFor="adj-kind">
          Movement Type
        </label>
        <select id="adj-kind" className={fieldInput} {...register('movementKind')}>
          <option value="adjustment">Adjustment (write-off / damage / shrinkage / count variance)</option>
          <option value="opening">Opening Stock</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="adj-product">
            Product
          </label>
          <select id="adj-product" className={fieldInput} {...register('productId')}>
            <option value="">Select a product…</option>
            {trackedProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
          {errors.productId && <p className={fieldError}>{errors.productId.message}</p>}
        </div>
        <div>
          <label className={fieldLabel} htmlFor="adj-warehouse">
            Warehouse
          </label>
          <select id="adj-warehouse" className={fieldInput} {...register('warehouseId')}>
            <option value="">Select…</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          {errors.warehouseId && <p className={fieldError}>{errors.warehouseId.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        {movementKind === 'adjustment' && (
          <div>
            <label className={fieldLabel} htmlFor="adj-direction">
              Direction
            </label>
            <select id="adj-direction" className={fieldInput} {...register('direction')}>
              <option value="decrease">Decrease stock</option>
              <option value="increase">Increase stock</option>
            </select>
          </div>
        )}
        <div>
          <label className={fieldLabel} htmlFor="adj-qty">
            Quantity
          </label>
          <input id="adj-qty" type="number" min={1} className={fieldInput} {...register('quantity')} />
          {errors.quantity && <p className={fieldError}>{errors.quantity.message}</p>}
        </div>
      </div>

      {movementKind === 'adjustment' && (
        <div className="grid grid-cols-1 gap-md md:grid-cols-2">
          <div>
            <label className={fieldLabel} htmlFor="adj-reason-preset">
              Reason
            </label>
            <select id="adj-reason-preset" className={fieldInput} {...register('reasonPreset')}>
              {REASON_PRESETS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={fieldLabel} htmlFor="adj-ref">
              Reference
            </label>
            <input id="adj-ref" className={fieldInput} placeholder="e.g. ADJ-4021" {...register('reference')} />
          </div>
        </div>
      )}

      <div>
        <label className={fieldLabel} htmlFor="adj-notes">
          {movementKind === 'adjustment' ? 'Reason detail (required context)' : 'Notes'}
        </label>
        <textarea id="adj-notes" rows={2} className={fieldInput} {...register('reason')} />
        <p className={fieldHint}>
          {movementKind === 'adjustment'
            ? 'Explain what happened — a bare quantity change is never recorded without this.'
            : 'Optional context for this opening balance.'}
        </p>
      </div>

      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {movementKind === 'opening' ? 'Record Opening Stock' : 'Record Adjustment'}
        </Button>
      </div>
    </form>
  );
}
