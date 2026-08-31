import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Account, ProductCategory, TaxRate } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { FormBody, FormFooter, FormSection } from '@/components/app/form';
import type {
  CreateProductCategoryDTO,
  UpdateProductCategoryDTO,
} from '../services/productCategoryService';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  description: z.string().trim().optional(),
  isActive: z.boolean(),
  revenueAccountId: z.string().optional(),
  cogsAccountId: z.string().optional(),
  inventoryAccountId: z.string().optional(),
  adjustmentAccountId: z.string().optional(),
  defaultTaxRateId: z.string().optional(),
});

type CategoryFormValues = z.infer<typeof schema>;

export interface CategoryFormProps {
  category?: ProductCategory;
  accounts: Account[];
  taxRates: TaxRate[];
  onSubmit: (data: CreateProductCategoryDTO | UpdateProductCategoryDTO) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function toDefaults(category?: ProductCategory): CategoryFormValues {
  return {
    name: category?.name ?? '',
    description: category?.description ?? '',
    isActive: category?.isActive ?? true,
    revenueAccountId: category?.revenueAccountId ?? '',
    cogsAccountId: category?.cogsAccountId ?? '',
    inventoryAccountId: category?.inventoryAccountId ?? '',
    adjustmentAccountId: category?.adjustmentAccountId ?? '',
    defaultTaxRateId: category?.defaultTaxRateId ?? '',
  };
}

const blankToUndefined = (v: string | undefined) => (v && v.length > 0 ? v : undefined);

export function CategoryForm({ category, accounts, taxRates, onSubmit, onCancel, onDirtyChange }: CategoryFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CategoryFormValues>({ resolver: zodResolver(schema), defaultValues: toDefaults(category) });

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  const submit = handleSubmit(async (data) => {
    await onSubmit({
      name: data.name,
      description: blankToUndefined(data.description),
      isActive: data.isActive,
      revenueAccountId: blankToUndefined(data.revenueAccountId),
      cogsAccountId: blankToUndefined(data.cogsAccountId),
      inventoryAccountId: blankToUndefined(data.inventoryAccountId),
      adjustmentAccountId: blankToUndefined(data.adjustmentAccountId),
      defaultTaxRateId: blankToUndefined(data.defaultTaxRateId),
    });
  });

  const byType = (types: Account['type'][]) => accounts.filter((a) => types.includes(a.type));
  const accountOptions = (list: Account[]) => (
    <>
      <option value="">Use standard account</option>
      {list.map((a) => (
        <option key={a.id} value={a.id}>
          {a.code} — {a.name}
        </option>
      ))}
    </>
  );

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <FormBody>
        <FormSection title="Details">
          <Field>
            <FieldLabel htmlFor="cat-name">Name</FieldLabel>
            <Input id="cat-name" {...register('name')} />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="cat-desc">Description</FieldLabel>
            <Textarea id="cat-desc" rows={2} {...register('description')} />
          </Field>
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id="cat-active"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
                <FieldLabel htmlFor="cat-active">Active</FieldLabel>
              </Field>
            )}
          />
        </FormSection>

        <FormSection
          title="Account mappings"
          description="Optional. When set, these win over the standard account for every product in this category (a product-specific override still wins over the category)."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="cat-rev">Sales revenue</FieldLabel>
              <NativeSelect id="cat-rev" {...register('revenueAccountId')}>
                {accountOptions(byType(['revenue']))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="cat-cogs">Cost of goods sold</FieldLabel>
              <NativeSelect id="cat-cogs" {...register('cogsAccountId')}>
                {accountOptions(byType(['expense']))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="cat-inv">Inventory asset</FieldLabel>
              <NativeSelect id="cat-inv" {...register('inventoryAccountId')}>
                {accountOptions(byType(['asset']))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="cat-adj">Inventory adjustments</FieldLabel>
              <NativeSelect id="cat-adj" {...register('adjustmentAccountId')}>
                {accountOptions(byType(['expense']))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="cat-tax">Default tax rate</FieldLabel>
              <NativeSelect id="cat-tax" {...register('defaultTaxRateId')}>
                <option value="">No default</option>
                {taxRates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </FormSection>
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {category ? 'Save changes' : 'Create category'}
        </Button>
      </FormFooter>
    </form>
  );
}
