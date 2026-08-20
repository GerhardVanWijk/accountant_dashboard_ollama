import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Warehouse } from '@/types';
import { Button } from '@/components/ui/Button';
import { fieldError, fieldInput, fieldLabel } from './formStyles';
import type { CreateWarehouseDTO, UpdateWarehouseDTO } from '../services/warehouseService';

const warehouseSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  code: z.string().trim().min(1, 'Code is required'),
  line1: z.string().trim().optional(),
  city: z.string().trim().optional(),
  postalCode: z.string().trim().optional(),
  country: z.string().trim().optional(),
  isDefault: z.boolean(),
  status: z.enum(['active', 'inactive']),
});

type WarehouseFormValues = z.infer<typeof warehouseSchema>;

export interface WarehouseFormProps {
  warehouse?: Warehouse;
  onSubmit: (data: CreateWarehouseDTO | UpdateWarehouseDTO) => Promise<void>;
  onCancel: () => void;
}

function toDefaultValues(warehouse?: Warehouse): WarehouseFormValues {
  return {
    name: warehouse?.name ?? '',
    code: warehouse?.code ?? '',
    line1: warehouse?.address?.line1 ?? '',
    city: warehouse?.address?.city ?? '',
    postalCode: warehouse?.address?.postalCode ?? '',
    country: warehouse?.address?.country ?? '',
    isDefault: warehouse?.isDefault ?? false,
    status: warehouse?.status ?? 'active',
  };
}

/** Create/edit form for warehouses (react-hook-form + zod), used by WarehousesPage. */
export function WarehouseForm({ warehouse, onSubmit, onCancel }: WarehouseFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: toDefaultValues(warehouse),
  });

  const submit = handleSubmit(async (data) => {
    const hasAddress = data.line1 || data.city || data.postalCode || data.country;
    await onSubmit({
      name: data.name,
      code: data.code,
      address: hasAddress
        ? {
            line1: data.line1 || '',
            city: data.city || '',
            postalCode: data.postalCode || undefined,
            country: data.country || '',
          }
        : undefined,
      isDefault: data.isDefault,
      status: data.status,
    });
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-md" noValidate>
      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="wh-name">
            Name
          </label>
          <input id="wh-name" className={fieldInput} {...register('name')} />
          {errors.name && <p className={fieldError}>{errors.name.message}</p>}
        </div>
        <div>
          <label className={fieldLabel} htmlFor="wh-code">
            Code
          </label>
          <input id="wh-code" className={fieldInput} {...register('code')} />
          {errors.code && <p className={fieldError}>{errors.code.message}</p>}
        </div>
      </div>

      <div>
        <label className={fieldLabel} htmlFor="wh-line1">
          Address Line 1
        </label>
        <input id="wh-line1" className={fieldInput} {...register('line1')} />
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-3">
        <div>
          <label className={fieldLabel} htmlFor="wh-city">
            City
          </label>
          <input id="wh-city" className={fieldInput} {...register('city')} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="wh-postal">
            Postal Code
          </label>
          <input id="wh-postal" className={fieldInput} {...register('postalCode')} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="wh-country">
            Country
          </label>
          <input id="wh-country" className={fieldInput} {...register('country')} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div className="flex items-center gap-sm pt-lg">
          <input id="wh-default" type="checkbox" className="h-4 w-4" {...register('isDefault')} />
          <label className="text-sm font-medium text-text-primary" htmlFor="wh-default">
            Default warehouse
          </label>
        </div>
        <div>
          <label className={fieldLabel} htmlFor="wh-status">
            Status
          </label>
          <select id="wh-status" className={fieldInput} {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {warehouse ? 'Save Changes' : 'Create Warehouse'}
        </Button>
      </div>
    </form>
  );
}
