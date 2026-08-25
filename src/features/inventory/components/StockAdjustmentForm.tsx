import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Product, Warehouse } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import type { AdjustStockInput, OpeningStockInput } from '../services/stockService';

const selectClassName = 'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

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
 * Re-skinned onto v0's Field/Input/Textarea (M8); validation and submit
 * wiring unchanged.
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
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <Field>
        <FieldLabel htmlFor="adj-kind">Movement Type</FieldLabel>
        <select id="adj-kind" className={selectClassName} {...register('movementKind')}>
          <option value="adjustment">Adjustment (write-off / damage / shrinkage / count variance)</option>
          <option value="opening">Opening Stock</option>
        </select>
      </Field>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="adj-product">Product</FieldLabel>
          <select id="adj-product" className={selectClassName} {...register('productId')}>
            <option value="">Select a product…</option>
            {trackedProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
          <FieldError errors={[errors.productId]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="adj-warehouse">Warehouse</FieldLabel>
          <select id="adj-warehouse" className={selectClassName} {...register('warehouseId')}>
            <option value="">Select…</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <FieldError errors={[errors.warehouseId]} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {movementKind === 'adjustment' && (
          <Field>
            <FieldLabel htmlFor="adj-direction">Direction</FieldLabel>
            <select id="adj-direction" className={selectClassName} {...register('direction')}>
              <option value="decrease">Decrease stock</option>
              <option value="increase">Increase stock</option>
            </select>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="adj-qty">Quantity</FieldLabel>
          <Input id="adj-qty" type="number" min={1} {...register('quantity')} />
          <FieldError errors={[errors.quantity]} />
        </Field>
      </div>

      {movementKind === 'adjustment' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="adj-reason-preset">Reason</FieldLabel>
            <select id="adj-reason-preset" className={selectClassName} {...register('reasonPreset')}>
              {REASON_PRESETS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="adj-ref">Reference</FieldLabel>
            <Input id="adj-ref" placeholder="e.g. ADJ-4021" {...register('reference')} />
          </Field>
        </div>
      )}

      <Field>
        <FieldLabel htmlFor="adj-notes">{movementKind === 'adjustment' ? 'Reason detail (required context)' : 'Notes'}</FieldLabel>
        <Textarea id="adj-notes" rows={2} {...register('reason')} />
        <FieldDescription>
          {movementKind === 'adjustment'
            ? 'Explain what happened — a bare quantity change is never recorded without this.'
            : 'Optional context for this opening balance.'}
        </FieldDescription>
      </Field>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {movementKind === 'opening' ? 'Record Opening Stock' : 'Record Adjustment'}
        </Button>
      </div>
    </form>
  );
}
