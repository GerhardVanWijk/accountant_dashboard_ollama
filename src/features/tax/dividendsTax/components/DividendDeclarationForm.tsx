import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { fieldError, fieldHint, fieldInput, fieldLabel } from './formStyles';
import type { CreateDividendDeclarationInput } from '../services';

function isPositiveNumber(value: string): boolean {
  return value.trim() !== '' && !Number.isNaN(Number(value)) && Number(value) > 0;
}
function isNonNegativeNumberOrEmpty(value: string | undefined): boolean {
  if (!value || value.trim() === '') return true;
  return !Number.isNaN(Number(value)) && Number(value) >= 0;
}

const declarationSchema = z
  .object({
    declarationDate: z.string().min(1, 'Declaration date is required'),
    totalAmount: z.string().refine(isPositiveNumber, { message: 'Total amount must be greater than 0' }),
    exemptPortion: z.string().optional().refine(isNonNegativeNumberOrEmpty, { message: 'Exempt portion must be 0 or more' }),
    exemptionReason: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((data) => !data.exemptPortion || Number(data.exemptPortion) <= Number(data.totalAmount), {
    message: 'Exempt portion cannot exceed the total amount',
    path: ['exemptPortion'],
  })
  .refine((data) => !data.exemptPortion || Number(data.exemptPortion) === 0 || Boolean(data.exemptionReason?.trim()), {
    message: 'An exemption reason is required whenever an exempt portion is entered',
    path: ['exemptionReason'],
  });

export type DividendDeclarationFormValues = z.infer<typeof declarationSchema>;

export interface DividendDeclarationFormProps {
  onSubmit: (data: CreateDividendDeclarationInput) => Promise<void>;
  onCancel: () => void;
}

/**
 * Create form for a new draft dividend declaration
 * (SA_ACCOUNTING_MASTER_SPEC.md §56). No shareholder allocation field —
 * see DividendDeclaration's doc comment for why (no shareholder
 * register exists in this app). `exemptPortion` + `exemptionReason` are
 * a manual override the preparer enters, never a computed eligibility
 * check.
 */
export function DividendDeclarationForm({ onSubmit, onCancel }: DividendDeclarationFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DividendDeclarationFormValues>({
    resolver: zodResolver(declarationSchema),
    defaultValues: {
      declarationDate: new Date().toISOString().slice(0, 10),
      totalAmount: '',
      exemptPortion: '',
      exemptionReason: '',
      notes: '',
    },
  });

  const exemptPortion = watch('exemptPortion');
  const showExemptionReason = Boolean(exemptPortion && Number(exemptPortion) > 0);

  const submit = handleSubmit(async (data) => {
    await onSubmit({
      declarationDate: data.declarationDate,
      totalAmount: Number(data.totalAmount),
      exemptPortion: data.exemptPortion ? Number(data.exemptPortion) : undefined,
      exemptionReason: data.exemptionReason?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
    });
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-md" noValidate>
      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="declarationDate">
            Declaration Date
          </label>
          <input id="declarationDate" type="date" className={fieldInput} {...register('declarationDate')} />
          {errors.declarationDate && <p className={fieldError}>{errors.declarationDate.message}</p>}
        </div>
        <div>
          <label className={fieldLabel} htmlFor="totalAmount">
            Total Amount (ZAR, gross)
          </label>
          <input id="totalAmount" type="number" step="0.01" className={fieldInput} {...register('totalAmount')} />
          {errors.totalAmount && <p className={fieldError}>{errors.totalAmount.message}</p>}
        </div>
      </div>

      <div>
        <label className={fieldLabel} htmlFor="exemptPortion">
          Exempt Portion (ZAR, optional)
        </label>
        <input id="exemptPortion" type="number" step="0.01" className={fieldInput} {...register('exemptPortion')} />
        {errors.exemptPortion && <p className={fieldError}>{errors.exemptPortion.message}</p>}
        <p className={fieldHint}>
          A manual override amount exempt from Dividends Tax withholding (e.g. a shareholder that is an SA resident
          company under s64F). This app has no shareholder register, so eligibility is not computed — enter the
          amount and reason yourself, and confirm with a tax practitioner (§110/§111).
        </p>
      </div>

      {showExemptionReason && (
        <div>
          <label className={fieldLabel} htmlFor="exemptionReason">
            Exemption Reason
          </label>
          <textarea id="exemptionReason" rows={2} className={fieldInput} {...register('exemptionReason')} />
          {errors.exemptionReason && <p className={fieldError}>{errors.exemptionReason.message}</p>}
        </div>
      )}

      <div>
        <label className={fieldLabel} htmlFor="notes">
          Notes (optional)
        </label>
        <textarea id="notes" rows={2} className={fieldInput} {...register('notes')} />
      </div>

      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Create Draft
        </Button>
      </div>
    </form>
  );
}
