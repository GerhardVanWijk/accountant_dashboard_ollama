import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { LeaseContract } from '@/types/lease';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Amount } from '@/components/app/figure';
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
 * AssetForm.tsx's shape. The initialLeaseLiability/initialRightOfUseAsset
 * preview below calls calculateLeaseLiabilityPresentValue() directly — the
 * same pure function leaseService.createLease() uses — rather than
 * round-tripping through the service, so the figure updates instantly as
 * the user types. Only a draft lease can reach this form (leaseService
 * rejects edits once commenced), so nothing here is ever locked/disabled
 * the way AssetForm locks fields post-capitalization. Re-skinned onto v0's
 * Field/Input (M13); validation and preview calculation unchanged.
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
  const previewPv = previewValid ? calculateLeaseLiabilityPresentValue(Number(monthlyPayment), Number(leaseTermMonths), Number(discountRatePercent)) : 0;

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
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <Field>
        <FieldLabel htmlFor="lessorName">Lessor Name</FieldLabel>
        <Input id="lessorName" {...register('lessorName')} />
        <FieldError errors={[errors.lessorName]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="assetDescription">Asset Description</FieldLabel>
        <Input id="assetDescription" {...register('assetDescription')} />
        <FieldError errors={[errors.assetDescription]} />
      </Field>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="commencementDate">Commencement Date</FieldLabel>
          <Input id="commencementDate" type="date" {...register('commencementDate')} />
          <FieldError errors={[errors.commencementDate]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="leaseTermMonths">Lease Term (Months)</FieldLabel>
          <Input id="leaseTermMonths" type="number" step="1" {...register('leaseTermMonths')} />
          <FieldError errors={[errors.leaseTermMonths]} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="monthlyPayment">Monthly Payment</FieldLabel>
          <Input id="monthlyPayment" type="number" step="0.01" {...register('monthlyPayment')} />
          <FieldError errors={[errors.monthlyPayment]} />
          <FieldDescription>A single fixed figure for the whole term — escalation clauses are not modeled.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="discountRatePercent">Discount Rate (% p.a.)</FieldLabel>
          <Input id="discountRatePercent" type="number" step="0.01" {...register('discountRatePercent')} />
          <FieldError errors={[errors.discountRatePercent]} />
          <FieldDescription>Your incremental borrowing rate — always a manual input, never looked up automatically.</FieldDescription>
        </Field>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Lease Liability / Right-of-Use Asset (at commencement)</span>
          <Amount value={previewPv} className="text-sm font-medium" />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Present value of the payment annuity, computed live as you type. This is what will be posted (DR
          Right-of-Use Assets / CR Lease Liability) once you post commencement.
        </p>
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {lease ? 'Save Changes' : 'Add Lease'}
        </Button>
      </div>
    </form>
  );
}
