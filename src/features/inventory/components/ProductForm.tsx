import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Product, ProductType } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { FormBody, FormFooter } from '@/components/app/form';
import { UOM_OPTIONS, INVENTORY_CURRENCY } from '../constants';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import type { CreateProductDTO, UpdateProductDTO } from '../services/productService';

function isNonNegativeNumber(value: string): boolean {
  return value.trim() !== '' && !Number.isNaN(Number(value)) && Number(value) >= 0;
}

const productSchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required'),
  name: z.string().trim().min(1, 'Name is required'),
  description: z.string().trim().optional(),
  type: z.enum(['good', 'service']),
  category: z.string().trim().optional(),
  uom: z.string().trim().optional(),
  barcode: z.string().trim().optional(),
  costPrice: z.string().refine(isNonNegativeNumber, { message: 'Cost price must be 0 or more' }),
  unitPrice: z.string().refine(isNonNegativeNumber, { message: 'Sell price must be 0 or more' }),
  taxRateId: z.string().optional(),
  trackInventory: z.boolean(),
  valuationMethod: z.enum(['weighted_average', 'fifo']),
  reorderLevel: z
    .string()
    .optional()
    .refine((v) => v === undefined || v.trim() === '' || isNonNegativeNumber(v), {
      message: 'Reorder level must be 0 or more',
    }),
  status: z.enum(['active', 'inactive']),
});

export type ProductFormValues = z.infer<typeof productSchema>;

export interface ProductFormProps {
  product?: Product;
  onSubmit: (data: CreateProductDTO | UpdateProductDTO) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function toDefaultValues(product?: Product): ProductFormValues {
  return {
    sku: product?.sku ?? '',
    name: product?.name ?? '',
    description: product?.description ?? '',
    type: product?.type ?? 'good',
    category: product?.category ?? '',
    uom: product?.uom ?? 'EA',
    barcode: product?.barcode ?? '',
    costPrice: String(product?.costPrice ?? 0),
    unitPrice: String(product?.unitPrice ?? 0),
    taxRateId: product?.taxRateId ?? '',
    trackInventory: product?.trackInventory ?? true,
    valuationMethod: product?.valuationMethod ?? 'weighted_average',
    reorderLevel: product?.reorderLevel !== undefined ? String(product.reorderLevel) : '',
    status: product?.status ?? 'active',
  };
}

/**
 * Create/edit form for the product catalog (react-hook-form + zod), used
 * by ProductsPage. quantityOnHand is intentionally NOT a form field — it
 * is shown read-only for context and can only change via a stock movement
 * (docs/DO_NOT_BREAK.md § Inventory & Stock). Re-skinned onto v0's
 * Field/Input/Textarea/Checkbox (M8); validation schema and submit wiring
 * unchanged.
 */
export function ProductForm({ product, onSubmit, onCancel, onDirtyChange }: ProductFormProps) {
  const { taxRates } = useTaxRates();
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: toDefaultValues(product),
  });

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  const type = watch('type');
  const trackInventoryWatched = watch('trackInventory');

  const submit = handleSubmit(async (data) => {
    const trackInventory = type === 'service' ? false : data.trackInventory;
    const reorderLevel =
      data.reorderLevel !== undefined && data.reorderLevel.trim() !== '' ? Number(data.reorderLevel) : undefined;
    await onSubmit({
      sku: data.sku,
      name: data.name,
      description: data.description || undefined,
      type: data.type as ProductType,
      category: data.category || undefined,
      uom: data.uom || undefined,
      barcode: data.barcode || undefined,
      costPrice: Number(data.costPrice),
      unitPrice: Number(data.unitPrice),
      taxRateId: data.taxRateId || undefined,
      trackInventory,
      valuationMethod: data.valuationMethod,
      reorderLevel,
      status: data.status,
    });
  });

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <FormBody>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="sku">SKU</FieldLabel>
          <Input id="sku" {...register('sku')} />
          <FieldError errors={[errors.sku]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input id="name" {...register('name')} />
          <FieldError errors={[errors.name]} />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="description">Description</FieldLabel>
        <Textarea id="description" rows={2} {...register('description')} />
      </Field>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="type">Type</FieldLabel>
          <NativeSelect id="type" {...register('type')}>
            <option value="good">Physical Good</option>
            <option value="service">Service</option>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="category">Category</FieldLabel>
          <Input id="category" {...register('category')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="uom">Unit of Measure</FieldLabel>
          <NativeSelect id="uom" {...register('uom')}>
            {UOM_OPTIONS.map((uom) => (
              <option key={uom} value={uom}>
                {uom}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="costPrice">Cost Price ({INVENTORY_CURRENCY})</FieldLabel>
          <Input id="costPrice" type="number" step="0.01" {...register('costPrice')} />
          <FieldError errors={[errors.costPrice]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="unitPrice">Sell Price ({INVENTORY_CURRENCY})</FieldLabel>
          <Input id="unitPrice" type="number" step="0.01" {...register('unitPrice')} />
          <FieldError errors={[errors.unitPrice]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="taxRateId">Tax Rate</FieldLabel>
          <NativeSelect id="taxRateId" {...register('taxRateId')}>
            <option value="">No tax rate</option>
            {taxRates.map((rate) => (
              <option key={rate.id} value={rate.id}>
                {rate.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="barcode">Barcode</FieldLabel>
          <Input id="barcode" {...register('barcode')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="status">Status</FieldLabel>
          <NativeSelect id="status" {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </NativeSelect>
        </Field>
      </div>

      {type !== 'service' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Controller
            control={control}
            name="trackInventory"
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox id="trackInventory" checked={field.value} onCheckedChange={(value) => field.onChange(value === true)} />
                <FieldLabel htmlFor="trackInventory">Track inventory for this item</FieldLabel>
              </Field>
            )}
          />
          <Field>
            <FieldLabel htmlFor="reorderLevel">Reorder Level</FieldLabel>
            <Input id="reorderLevel" type="number" {...register('reorderLevel')} />
            <FieldError errors={[errors.reorderLevel]} />
          </Field>
        </div>
      )}

      {type !== 'service' && trackInventoryWatched && (
        <Field>
          <FieldLabel htmlFor="valuationMethod">Valuation Method</FieldLabel>
          <NativeSelect id="valuationMethod" {...register('valuationMethod')}>
            <option value="weighted_average">Weighted Average Cost</option>
            <option value="fifo">FIFO (First In, First Out)</option>
          </NativeSelect>
          <FieldDescription>
            FIFO costs each sale from the oldest stock received first, instead of a blended average. Switching an
            existing product to FIFO only affects stock received from now on — it has no cost history to draw on
            until then.
          </FieldDescription>
        </Field>
      )}

      {product && (
        <Field>
          <FieldLabel>Quantity on Hand</FieldLabel>
          <p className="text-sm text-foreground">{product.quantityOnHand}</p>
          <FieldDescription>Read-only — record a Stock Adjustment or Transfer on the Warehouses page to change quantities.</FieldDescription>
        </Field>
      )}
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {product ? 'Save Changes' : 'Create Product'}
        </Button>
      </FormFooter>
    </form>
  );
}
