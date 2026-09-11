import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Account, AssetCategory, DepreciationMethod, FixedAsset } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { EnumSelect } from '@/components/app/combobox';
import { ACCOUNT_CODE_BY_KEY } from '@/features/accounting/services';
import { FormBody, FormFooter, FormGrid } from '@/components/app/form';
import { CATEGORY_LABELS, DEPRECIATION_METHOD_LABELS, WEAR_TEAR_RATE_DEFAULTS, ASSETS_CURRENCY } from '../constants';
import type { CreateFixedAssetDTO, UpdateFixedAssetDTO } from '../services';

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
const DEPRECIATION_METHOD_OPTIONS = Object.entries(DEPRECIATION_METHOD_LABELS).map(([value, label]) => ({ value, label }));

function isPositiveNumber(value: string): boolean {
  return value.trim() !== '' && !Number.isNaN(Number(value)) && Number(value) > 0;
}
function isNonNegativeNumber(value: string): boolean {
  return value.trim() !== '' && !Number.isNaN(Number(value)) && Number(value) >= 0;
}

const assetSchema = z
  .object({
    assetNumber: z.string().trim().min(1, 'Asset number is required'),
    name: z.string().trim().min(1, 'Name is required'),
    description: z.string().trim().optional(),
    category: z.enum([
      'land',
      'buildings',
      'plant_and_machinery',
      'furniture_and_fittings',
      'motor_vehicles',
      'computer_equipment',
      'office_equipment',
      'leasehold_improvements',
      'other',
    ]),
    acquisitionDate: z.string().min(1, 'Acquisition date is required'),
    cost: z.string().refine(isPositiveNumber, { message: 'Cost must be greater than 0' }),
    residualValue: z.string().refine(isNonNegativeNumber, { message: 'Residual value must be 0 or more' }),
    usefulLifeYears: z.string().refine(isPositiveNumber, { message: 'Useful life must be greater than 0' }),
    depreciationMethod: z.enum(['straight_line', 'reducing_balance']),
    reducingBalanceRatePercent: z.string().optional(),
    taxWearTearRatePercent: z.string().optional(),
  })
  .refine(
    (data) => Number(data.residualValue) <= Number(data.cost),
    { message: 'Residual value cannot exceed cost', path: ['residualValue'] },
  )
  .refine(
    (data) => data.depreciationMethod !== 'reducing_balance' || isPositiveNumber(data.reducingBalanceRatePercent ?? ''),
    { message: 'Reducing-balance rate is required for this method', path: ['reducingBalanceRatePercent'] },
  );

export type AssetFormValues = z.infer<typeof assetSchema>;

export interface AssetFormProps {
  asset?: FixedAsset;
  /** Chart of Accounts — used to resolve the standard Fixed Asset / Accumulated Depreciation / Depreciation Expense GL accounts for a new asset. */
  accounts: Account[];
  onSubmit: (data: CreateFixedAssetDTO | UpdateFixedAssetDTO) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Chart-of-Accounts codes for the three fixed-asset posting roles — the
 * single source of truth is `AccountMappingService.ACCOUNT_CODE_BY_KEY`
 * (the same map `fixedAssetService.capitalizeFromBillLine()` resolves
 * through server-side). This form only picks the account ids to seed a new
 * asset with; it never invents its own resolution.
 */
const ASSET_ACCOUNT_CODES = {
  cost: ACCOUNT_CODE_BY_KEY.FIXED_ASSET,
  accumulated: ACCOUNT_CODE_BY_KEY.ACCUMULATED_DEPRECIATION,
  expense: ACCOUNT_CODE_BY_KEY.DEPRECIATION_EXPENSE,
} as const;

function toDefaultValues(asset?: FixedAsset): AssetFormValues {
  return {
    assetNumber: asset?.assetNumber ?? '',
    name: asset?.name ?? '',
    description: asset?.description ?? '',
    category: asset?.category ?? 'other',
    acquisitionDate: asset?.acquisitionDate ?? new Date().toISOString().slice(0, 10),
    cost: asset ? String(asset.cost) : '',
    residualValue: asset ? String(asset.residualValue) : '0',
    usefulLifeYears: asset ? String(asset.usefulLifeYears) : '5',
    depreciationMethod: asset?.depreciationMethod ?? 'straight_line',
    reducingBalanceRatePercent: asset?.reducingBalanceRatePercent !== undefined ? String(asset.reducingBalanceRatePercent) : '',
    taxWearTearRatePercent: asset?.taxWearTearRatePercent !== undefined ? String(asset.taxWearTearRatePercent) : '',
  };
}

/**
 * Create/edit form for the Fixed Asset Register (react-hook-form + zod),
 * mirroring src/features/inventory/components/ProductForm.tsx's shape.
 * Once an asset has left 'draft' (capitalized), fixedAssetService rejects
 * edits to cost/method/useful-life/dates/GL-mapping — those fields are
 * disabled here rather than only failing on submit, so the guard is
 * visible before the user tries. Re-skinned onto v0's Field/Input/Textarea
 * (M8); validation schema and submit wiring unchanged.
 */
export function AssetForm({ asset, accounts, onSubmit, onCancel, onDirtyChange }: AssetFormProps) {
  const locked = asset !== undefined && asset.status !== 'draft';

  const accountIdByCode = (code: string) => accounts.find((a) => a.code === code)?.id;
  const resolvedCost = asset?.glAssetAccountId ?? accountIdByCode(ASSET_ACCOUNT_CODES.cost);
  const resolvedAccumulated = asset?.glAccumulatedDepreciationAccountId ?? accountIdByCode(ASSET_ACCOUNT_CODES.accumulated);
  const resolvedExpense = asset?.glDepreciationExpenseAccountId ?? accountIdByCode(ASSET_ACCOUNT_CODES.expense);
  const accountsUnresolved =
    !asset && accounts.length > 0 && (!resolvedCost || !resolvedAccumulated || !resolvedExpense);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<AssetFormValues>({
    resolver: zodResolver(assetSchema),
    defaultValues: toDefaultValues(asset),
  });

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  const category = watch('category');
  const depreciationMethod = watch('depreciationMethod');

  // Prefill the tax wear-and-tear rate from the category default the first
  // time a category is picked on a brand-new asset, never overwriting a
  // value the user (or an existing asset) already set.
  useEffect(() => {
    if (asset) return;
    setValue('taxWearTearRatePercent', String(WEAR_TEAR_RATE_DEFAULTS[category as AssetCategory]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const submit = handleSubmit(async (data) => {
    await onSubmit({
      assetNumber: data.assetNumber,
      name: data.name,
      description: data.description || undefined,
      category: data.category as AssetCategory,
      acquisitionDate: data.acquisitionDate,
      cost: Number(data.cost),
      residualValue: Number(data.residualValue),
      usefulLifeYears: Number(data.usefulLifeYears),
      depreciationMethod: data.depreciationMethod as DepreciationMethod,
      reducingBalanceRatePercent:
        data.depreciationMethod === 'reducing_balance' && data.reducingBalanceRatePercent
          ? Number(data.reducingBalanceRatePercent)
          : undefined,
      taxWearTearRatePercent: data.taxWearTearRatePercent ? Number(data.taxWearTearRatePercent) : undefined,
      taxWearTearRateSource: asset?.taxWearTearRateSource,
      glAssetAccountId: resolvedCost ?? '',
      glAccumulatedDepreciationAccountId: resolvedAccumulated ?? '',
      glDepreciationExpenseAccountId: resolvedExpense ?? '',
    });
  });

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <FormBody>
      <FormGrid>
        <Field>
          <FieldLabel htmlFor="assetNumber">Asset Number</FieldLabel>
          <Input id="assetNumber" className="font-mono" {...register('assetNumber')} />
          <FieldError errors={[errors.assetNumber]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input id="name" {...register('name')} />
          <FieldError errors={[errors.name]} />
        </Field>
      </FormGrid>

      <Field className="max-w-3xl">
        <FieldLabel htmlFor="description">Description</FieldLabel>
        <Textarea id="description" rows={2} {...register('description')} />
      </Field>

      <FormGrid>
        <Field>
          <FieldLabel htmlFor="category">Category</FieldLabel>
          <Controller
            control={control}
            name="category"
            render={({ field, fieldState }) => (
              <EnumSelect
                id="category"
                name="category"
                value={field.value ?? 'other'}
                onValueChange={field.onChange}
                invalid={Boolean(fieldState.error)}
                options={CATEGORY_OPTIONS}
              />
            )}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="acquisitionDate">Acquisition Date</FieldLabel>
          <Input id="acquisitionDate" type="date" disabled={locked} {...register('acquisitionDate')} />
          <FieldError errors={[errors.acquisitionDate]} />
        </Field>
      </FormGrid>

      <FormGrid columns={3}>
        <Field>
          <FieldLabel htmlFor="cost">Cost ({ASSETS_CURRENCY})</FieldLabel>
          <Input id="cost" type="number" step="0.01" disabled={locked} {...register('cost')} />
          <FieldError errors={[errors.cost]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="residualValue">Residual Value ({ASSETS_CURRENCY})</FieldLabel>
          <Input id="residualValue" type="number" step="0.01" disabled={locked} {...register('residualValue')} />
          <FieldError errors={[errors.residualValue]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="usefulLifeYears">Useful Life (Years)</FieldLabel>
          <Input id="usefulLifeYears" type="number" step="1" disabled={locked} {...register('usefulLifeYears')} />
          <FieldError errors={[errors.usefulLifeYears]} />
        </Field>
      </FormGrid>

      <FormGrid>
        <Field>
          <FieldLabel htmlFor="depreciationMethod">Depreciation Method</FieldLabel>
          <Controller
            control={control}
            name="depreciationMethod"
            render={({ field, fieldState }) => (
              <EnumSelect
                id="depreciationMethod"
                name="depreciationMethod"
                disabled={locked}
                value={field.value ?? 'straight_line'}
                onValueChange={field.onChange}
                invalid={Boolean(fieldState.error)}
                options={DEPRECIATION_METHOD_OPTIONS}
              />
            )}
          />
        </Field>
        {depreciationMethod === 'reducing_balance' && (
          <Field>
            <FieldLabel htmlFor="reducingBalanceRatePercent">Annual Rate (%)</FieldLabel>
            <Input id="reducingBalanceRatePercent" type="number" step="0.01" disabled={locked} {...register('reducingBalanceRatePercent')} />
            <FieldError errors={[errors.reducingBalanceRatePercent]} />
          </Field>
        )}
      </FormGrid>

      <Field className="max-w-3xl">
        <FieldLabel htmlFor="taxWearTearRatePercent">SARS Wear-and-Tear Rate (%)</FieldLabel>
        <Input id="taxWearTearRatePercent" type="number" step="0.01" {...register('taxWearTearRatePercent')} />
        <FieldDescription>
          Feeds the Tax Register — a typical/indicative rate prefilled from the category, always editable. Not
          independently verified against SARS Binding General Practice Note 7; confirm with a tax practitioner
          before relying on it.
        </FieldDescription>
      </Field>

      {accountsUnresolved && (
        <p role="alert" className="rounded-lg border border-status-warning-outline bg-status-warning-surface px-3 py-2 text-sm text-status-warning">
          The standard Fixed Asset (1500), Accumulated Depreciation (1590) or Depreciation Expense (5200) accounts
          are missing from the Chart of Accounts. Add them before capitalizing assets.
        </p>
      )}

      {locked && (
        <p className="text-sm text-muted-foreground">
          This asset has already been capitalized — cost, dates, useful life, and depreciation method are locked
          because real GL history now depends on them. Name, description, category, and the tax rate can still be
          edited.
        </p>
      )}
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || accountsUnresolved}>
          {asset ? 'Save Changes' : 'Add Asset'}
        </Button>
      </FormFooter>
    </form>
  );
}
