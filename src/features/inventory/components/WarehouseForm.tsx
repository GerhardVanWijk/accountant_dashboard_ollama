import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Warehouse } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
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

/** Create/edit form for warehouses (react-hook-form + zod), used by WarehousesPage. Re-skinned onto v0's Field/Input/Checkbox (M8). */
export function WarehouseForm({ warehouse, onSubmit, onCancel }: WarehouseFormProps) {
  const {
    register,
    handleSubmit,
    control,
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
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="wh-name">Name</FieldLabel>
          <Input id="wh-name" {...register('name')} />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="wh-code">Code</FieldLabel>
          <Input id="wh-code" {...register('code')} />
          <FieldError errors={[errors.code]} />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="wh-line1">Address Line 1</FieldLabel>
        <Input id="wh-line1" {...register('line1')} />
      </Field>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="wh-city">City</FieldLabel>
          <Input id="wh-city" {...register('city')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="wh-postal">Postal Code</FieldLabel>
          <Input id="wh-postal" {...register('postalCode')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="wh-country">Country</FieldLabel>
          <Input id="wh-country" {...register('country')} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Controller
          control={control}
          name="isDefault"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox id="wh-default" checked={field.value} onCheckedChange={(value) => field.onChange(value === true)} />
              <FieldLabel htmlFor="wh-default">Default warehouse</FieldLabel>
            </Field>
          )}
        />
        <Field>
          <FieldLabel htmlFor="wh-status">Status</FieldLabel>
          <NativeSelect id="wh-status" {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </NativeSelect>
        </Field>
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {warehouse ? 'Save Changes' : 'Create Warehouse'}
        </Button>
      </div>
    </form>
  );
}
