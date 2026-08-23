import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { LeaseContract } from '@/types/lease';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { fieldError, fieldHint, fieldInput, fieldLabel } from './formStyles';
import type { CreateLeaseDTO, UpdateLeaseDTO } from '../services';
import { calculateLeaseLiabilityPresentValue } from '../services';

function isPositiveNumber(value: string): boolean {
  return value.trim() !== '' && !Number.isNaN(Number(value)) && Number(value) > 0;
}
function isNonNegativeNumber(value: string): boolean {
  return value.trim() !== '' && !Number.isNaN(Number(value)) && Number(value) >= 0;
}

const leaseSchema = z.object({
  lessorName: z.string().trim().min(1, 'Lessor name is required'),
  assetDescription: z.string().trim().min(1, 'Asset description is required'),
  commencementDate: z.string().min(1, 'Commencement date is required'),
  leaseTermMonths: z.string().refine(isPositiveNumber, { message: 'Lease term must be greater than 0 months' }),
  monthlyPayment: z.string().refine(isPositiveNumber, { message: 'Monthly payment must be greater than 0' }),
  discountRatePercent: z.string().refine(isNonNegativeNumber, { message: 'Discount rate must be 0 or more' }),
});

export type LeaseFormValues = z.infer<typeof leaseSchema>;

export interface LeaseFormProps {
  lease?: LeaseContract;
  onSubmit: (data: CreateLeaseDTO | UpdateLeaseDTO) => Promise<void>;
  onCancel: () => void;
}

function toDefaultValues(lease?: LeaseContract): LeaseFormValues {
  return {
    lessorName: lease?.lessorName ?? '',
    assetDescription: lease?.assetDescription ?? '',
    commencementDate: lease?.commencementDate ?? new Date().toISOString().slice(0, 10),
    leaseTermMonths: lease ? String(lease.leaseTermMonths) : '36',
    monthlyPayment: lease ? String(lease.monthlyPayment) : '',
    discountRatePercent: lease ? String(lease.discountRatePercent) : '10',
  };
}

/**
 * Create/edit form for a draft lease (react-hook-form + zod), mirroring
 * src/features/assets/components/AssetForm.tsx's shape. The
 * initialLeaseLiability/initialRightOfUseAsset preview below calls
 * calculateLeaseLiabilityPresentValue() directly — the same pure function
 * leaseService.createLease() uses — rather than round-tripping through the
 * service, so the figure updates instantly as the user types. Only a
 * draft lease can reach this form (leaseService rejects edits once
 * commenced), so nothing here is ever locked/disabled the way AssetForm
 * locks fields post-capitalization.
 */
export function LeaseForm({ lease, onSubmit, onCancel }: LeaseFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LeaseFormValues>({
    resolver: zodResolver(leaseSchema),
    defaultValues: toDefaultValues(lease),
  });

  const leaseTermMonths = watch('leaseTermMonths');
  const monthlyPayment = watch('monthlyPayment');
  const discountRatePercent = watch('discountRatePercent');

  const termValid = isPositiveNumber(leaseTermMonths);
  const paymentValid = isPositiveNumber(monthlyPayment);
  const rateValid = isNonNegativeNumber(discountRatePercent);
  const previewValid = termValid && paymentValid && rateValid;
  const previewPv = previewValid
    ? calculateLeaseLiabilityPresentValue(Number(monthlyPayment), Number(leaseTermMonths), Number(discountRatePercent))
    : 0;

  const submit = handleSubmit(async (data) => {
    await onSubmit({
      lessorName: data.lessorName,
      assetDescription: data.assetDescription,
      commencementDate: data.commencementDate,
      leaseTermMonths: Number(data.leaseTermMonths),
      monthlyPayment: Number(data.monthlyPayment),
      discountRatePercent: Number(data.discountRatePercent),
    });
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-md" noValidate>
      <div>
        <label className={fieldLabel} htmlFor="lessorName">
          Lessor Name
        </label>
        <input id="lessorName" className={fieldInput} {...register('lessorName')} />
        {errors.lessorName && <p className={fieldError}>{errors.lessorName.message}</p>}
      </div>

      <div>
        <label className={fieldLabel} htmlFor="assetDescription">
          Asset Description
        </label>
        <input id="assetDescription" className={fieldInput} {...register('assetDescription')} />
        {errors.assetDescription && <p className={fieldError}>{errors.assetDescription.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="commencementDate">
            Commencement Date
          </label>
          <input id="commencementDate" type="date" className={fieldInput} {...register('commencementDate')} />
          {errors.commencementDate && <p className={fieldError}>{errors.commencementDate.message}</p>}
        </div>
        <div>
          <label className={fieldLabel} htmlFor="leaseTermMonths">
            Lease Term (Months)
          </label>
          <input id="leaseTermMonths" type="number" step="1" className={fieldInput} {...register('leaseTermMonths')} />
          {errors.leaseTermMonths && <p className={fieldError}>{errors.leaseTermMonths.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="monthlyPayment">
            Monthly Payment
          </label>
          <input id="monthlyPayment" type="number" step="0.01" className={fieldInput} {...register('monthlyPayment')} />
          {errors.monthlyPayment && <p className={fieldError}>{errors.monthlyPayment.message}</p>}
          <p className={fieldHint}>A single fixed figure for the whole term — escalation clauses are not modeled.</p>
        </div>
        <div>
          <label className={fieldLabel} htmlFor="discountRatePercent">
            Discount Rate (% p.a.)
          </label>
          <input id="discountRatePercent" type="number" step="0.01" className={fieldInput} {...register('discountRatePercent')} />
          {errors.discountRatePercent && <p className={fieldError}>{errors.discountRatePercent.message}</p>}
          <p className={fieldHint}>Your incremental borrowing rate — always a manual input, never looked up automatically.</p>
        </div>
      </div>

      <div className="rounded-md border border-border bg-background p-md text-sm">
        <div className="flex justify-between">
          <span className="text-text-secondary">Lease Liability / Right-of-Use Asset (at commencement)</span>
          <FinancialNumber value={previewPv} format={formatCurrency} showFlash={false} />
        </div>
        <p className={fieldHint}>
          Present value of the payment annuity, computed live as you type. This is what will be posted (DR Right-of-Use
          Assets / CR Lease Liability) once you post commencement.
        </p>
      </div>

      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {lease ? 'Save Changes' : 'Add Lease'}
        </Button>
      </div>
    </form>
  );
}
