import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Product, ProductType } from '@/types';
import { Button } from '@/components/ui/Button';
import { UOM_OPTIONS, INVENTORY_CURRENCY } from '../constants';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { fieldError, fieldHint, fieldInput, fieldLabel } from './formStyles';
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
 * (docs/DO_NOT_BREAK.md § Inventory & Stock).
 */
export function ProductForm({ product, onSubmit, onCancel }: ProductFormProps) {
  const { taxRates } = useTaxRates();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: toDefaultValues(product),
  });

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
    <form onSubmit={submit} className="flex flex-col gap-md" noValidate>
      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="sku">
            SKU
          </label>
          <input id="sku" className={fieldInput} {...register('sku')} />
          {errors.sku && <p className={fieldError}>{errors.sku.message}</p>}
        </div>
        <div>
          <label className={fieldLabel} htmlFor="name">
            Name
          </label>
          <input id="name" className={fieldInput} {...register('name')} />
          {errors.name && <p className={fieldError}>{errors.name.message}</p>}
        </div>
      </div>

      <div>
        <label className={fieldLabel} htmlFor="description">
          Description
        </label>
        <textarea id="description" rows={2} className={fieldInput} {...register('description')} />
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-3">
        <div>
          <label className={fieldLabel} htmlFor="type">
            Type
          </label>
          <select id="type" className={fieldInput} {...register('type')}>
            <option value="good">Physical Good</option>
            <option value="service">Service</option>
          </select>
        </div>
        <div>
          <label className={fieldLabel} htmlFor="category">
            Category
          </label>
          <input id="category" className={fieldInput} {...register('category')} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="uom">
            Unit of Measure
          </label>
          <select id="uom" className={fieldInput} {...register('uom')}>
            {UOM_OPTIONS.map((uom) => (
              <option key={uom} value={uom}>
                {uom}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-3">
        <div>
          <label className={fieldLabel} htmlFor="costPrice">
            Cost Price ({INVENTORY_CURRENCY})
          </label>
          <input id="costPrice" type="number" step="0.01" className={fieldInput} {...register('costPrice')} />
          {errors.costPrice && <p className={fieldError}>{errors.costPrice.message}</p>}
        </div>
        <div>
          <label className={fieldLabel} htmlFor="unitPrice">
            Sell Price ({INVENTORY_CURRENCY})
          </label>
          <input id="unitPrice" type="number" step="0.01" className={fieldInput} {...register('unitPrice')} />
          {errors.unitPrice && <p className={fieldError}>{errors.unitPrice.message}</p>}
        </div>
        <div>
          <label className={fieldLabel} htmlFor="taxRateId">
            Tax Rate
          </label>
          <select id="taxRateId" className={fieldInput} {...register('taxRateId')}>
            <option value="">No tax rate</option>
            {taxRates.map((rate) => (
              <option key={rate.id} value={rate.id}>
                {rate.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="barcode">
            Barcode
          </label>
          <input id="barcode" className={fieldInput} {...register('barcode')} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="status">
            Status
          </label>
          <select id="status" className={fieldInput} {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {type !== 'service' && (
        <div className="grid grid-cols-1 gap-md md:grid-cols-2">
          <div className="flex items-center gap-sm pt-lg">
            <input id="trackInventory" type="checkbox" className="h-4 w-4" {...register('trackInventory')} />
            <label className="text-sm font-medium text-text-primary" htmlFor="trackInventory">
              Track inventory for this item
            </label>
          </div>
          <div>
            <label className={fieldLabel} htmlFor="reorderLevel">
              Reorder Level
            </label>
            <input id="reorderLevel" type="number" className={fieldInput} {...register('reorderLevel')} />
            {errors.reorderLevel && <p className={fieldError}>{errors.reorderLevel.message}</p>}
          </div>
        </div>
      )}

      {type !== 'service' && trackInventoryWatched && (
        <div>
          <label className={fieldLabel} htmlFor="valuationMethod">
            Valuation Method
          </label>
          <select id="valuationMethod" className={fieldInput} {...register('valuationMethod')}>
            <option value="weighted_average">Weighted Average Cost</option>
            <option value="fifo">FIFO (First In, First Out)</option>
          </select>
          <p className={fieldHint}>
            FIFO costs each sale from the oldest stock received first, instead of a blended average. Switching an
            existing product to FIFO only affects stock received from now on — it has no cost history to draw on
            until then.
          </p>
        </div>
      )}

      {product && (
        <div>
          <p className={fieldLabel}>Quantity on Hand</p>
          <p className="text-sm text-text-primary">{product.quantityOnHand}</p>
          <p className={fieldHint}>
            Read-only — record a Stock Adjustment or Transfer on the Warehouses page to change quantities.
          </p>
        </div>
      )}

      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {product ? 'Save Changes' : 'Create Product'}
        </Button>
      </div>
    </form>
  );
}
