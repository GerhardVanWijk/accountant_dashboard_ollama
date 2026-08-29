import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/shadcn/button';
import { FormBody, FormFooter } from '@/components/app/form';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
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
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Create form for a new draft dividend declaration. No shareholder
 * allocation field — this app has no shareholder register, so amounts are
 * gross/company-wide only. `exemptPortion` + `exemptionReason` are a
 * manual override the preparer enters, never a computed eligibility
 * check. Re-skinned onto v0's Field/Input/Textarea (M7); validation
 * schema and submit wiring unchanged.
 */
export function DividendDeclarationForm({ onSubmit, onCancel, onDirtyChange }: DividendDeclarationFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isDirty },
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

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

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
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <FormBody>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="declarationDate">Declaration Date</FieldLabel>
          <Input id="declarationDate" type="date" {...register('declarationDate')} />
          <FieldError errors={[errors.declarationDate]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="totalAmount">Total Amount (ZAR, gross)</FieldLabel>
          <Input id="totalAmount" type="number" step="0.01" {...register('totalAmount')} />
          <FieldError errors={[errors.totalAmount]} />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="exemptPortion">Exempt Portion (ZAR, optional)</FieldLabel>
        <Input id="exemptPortion" type="number" step="0.01" {...register('exemptPortion')} />
        <FieldError errors={[errors.exemptPortion]} />
        <FieldDescription>
          A manual override amount exempt from Dividends Tax withholding (e.g. a shareholder that is an SA resident company under s64F). This app has no shareholder register, so
          eligibility is not computed — enter the amount and reason yourself, and confirm with a tax practitioner.
        </FieldDescription>
      </Field>

      {showExemptionReason && (
        <Field>
          <FieldLabel htmlFor="exemptionReason">Exemption Reason</FieldLabel>
          <Textarea id="exemptionReason" rows={2} {...register('exemptionReason')} />
          <FieldError errors={[errors.exemptionReason]} />
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="notes">Notes (optional)</FieldLabel>
        <Textarea id="notes" rows={2} {...register('notes')} />
      </Field>

      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Create Draft
        </Button>
      </FormFooter>
    </form>
  );
}
