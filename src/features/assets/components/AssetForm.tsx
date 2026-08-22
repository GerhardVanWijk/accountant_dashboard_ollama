import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { AssetCategory, DepreciationMethod, FixedAsset } from '@/types';
import { Button } from '@/components/ui/Button';
import { CATEGORY_LABELS, DEPRECIATION_METHOD_LABELS, WEAR_TEAR_RATE_DEFAULTS, ASSETS_CURRENCY } from '../constants';
import { fieldError, fieldHint, fieldInput, fieldLabel } from './formStyles';
import type { CreateFixedAssetDTO, UpdateFixedAssetDTO } from '../services';

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
  onSubmit: (data: CreateFixedAssetDTO | UpdateFixedAssetDTO) => Promise<void>;
  onCancel: () => void;
}

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
 * visible before the user tries.
 */
export function AssetForm({ asset, onSubmit, onCancel }: AssetFormProps) {
  const locked = asset !== undefined && asset.status !== 'draft';

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AssetFormValues>({
    resolver: zodResolver(assetSchema),
    defaultValues: toDefaultValues(asset),
  });

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
      glAssetAccountId: asset?.glAssetAccountId ?? 'acc_1500',
      glAccumulatedDepreciationAccountId: asset?.glAccumulatedDepreciationAccountId ?? 'acc_1590',
      glDepreciationExpenseAccountId: asset?.glDepreciationExpenseAccountId ?? 'acc_5200',
    });
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-md" noValidate>
      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="assetNumber">
            Asset Number
          </label>
          <input id="assetNumber" className={fieldInput} {...register('assetNumber')} />
          {errors.assetNumber && <p className={fieldError}>{errors.assetNumber.message}</p>}
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

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="category">
            Category
          </label>
          <select id="category" className={fieldInput} {...register('category')}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={fieldLabel} htmlFor="acquisitionDate">
            Acquisition Date
          </label>
          <input
            id="acquisitionDate"
            type="date"
            className={fieldInput}
            disabled={locked}
            {...register('acquisitionDate')}
          />
          {errors.acquisitionDate && <p className={fieldError}>{errors.acquisitionDate.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-3">
        <div>
          <label className={fieldLabel} htmlFor="cost">
            Cost ({ASSETS_CURRENCY})
          </label>
          <input id="cost" type="number" step="0.01" className={fieldInput} disabled={locked} {...register('cost')} />
          {errors.cost && <p className={fieldError}>{errors.cost.message}</p>}
        </div>
        <div>
          <label className={fieldLabel} htmlFor="residualValue">
            Residual Value ({ASSETS_CURRENCY})
          </label>
          <input
            id="residualValue"
            type="number"
            step="0.01"
            className={fieldInput}
            disabled={locked}
            {...register('residualValue')}
          />
          {errors.residualValue && <p className={fieldError}>{errors.residualValue.message}</p>}
        </div>
        <div>
          <label className={fieldLabel} htmlFor="usefulLifeYears">
            Useful Life (Years)
          </label>
          <input
            id="usefulLifeYears"
            type="number"
            step="1"
            className={fieldInput}
            disabled={locked}
            {...register('usefulLifeYears')}
          />
          {errors.usefulLifeYears && <p className={fieldError}>{errors.usefulLifeYears.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="depreciationMethod">
            Depreciation Method
          </label>
          <select id="depreciationMethod" className={fieldInput} disabled={locked} {...register('depreciationMethod')}>
            {Object.entries(DEPRECIATION_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {depreciationMethod === 'reducing_balance' && (
          <div>
            <label className={fieldLabel} htmlFor="reducingBalanceRatePercent">
              Annual Rate (%)
            </label>
            <input
              id="reducingBalanceRatePercent"
              type="number"
              step="0.01"
              className={fieldInput}
              disabled={locked}
              {...register('reducingBalanceRatePercent')}
            />
            {errors.reducingBalanceRatePercent && <p className={fieldError}>{errors.reducingBalanceRatePercent.message}</p>}
          </div>
        )}
      </div>

      <div>
        <label className={fieldLabel} htmlFor="taxWearTearRatePercent">
          SARS Wear-and-Tear Rate (%)
        </label>
        <input
          id="taxWearTearRatePercent"
          type="number"
          step="0.01"
          className={fieldInput}
          {...register('taxWearTearRatePercent')}
        />
        <p className={fieldHint}>
          Feeds the Tax Register — a typical/indicative rate prefilled from the category, always editable. Not
          independently verified against SARS Binding General Practice Note 7; confirm with a tax practitioner
          before relying on it.
        </p>
      </div>

      {locked && (
        <p className={fieldHint}>
          This asset has already been capitalized — cost, dates, useful life, and depreciation method are locked
          because real GL history now depends on them. Name, description, category, and the tax rate can still be
          edited.
        </p>
      )}

      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {asset ? 'Save Changes' : 'Add Asset'}
        </Button>
      </div>
    </form>
  );
}
