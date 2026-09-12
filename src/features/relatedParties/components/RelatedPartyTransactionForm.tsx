import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import type { RelatedParty, RelatedPartyTransaction } from '@/types/relatedParty';
import { Button } from '@/components/ui/shadcn/button';
import { FormBody, FormFooter, FormGrid } from '@/components/app/form';
import { Field, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { EnumSelect } from '@/components/app/combobox';
import type { CreateRelatedPartyTransactionDTO, UpdateRelatedPartyTransactionDTO } from '../services';

function isValidNumber(value: string): boolean {
  return value.trim() !== '' && !Number.isNaN(Number(value));
}

const SOURCE_TYPE_OPTIONS = [
  { value: '', label: 'Manual / Other (no matching accounting record)' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'bill', label: 'Supplier Invoice / Bill' },
  { value: 'journal_entry', label: 'Journal Entry' },
  { value: 'customer_receipt', label: 'Customer Receipt' },
  { value: 'payment', label: 'Supplier Payment' },
];

const transactionSchema = z
  .object({
    relatedPartyId: z.string().trim().min(1, 'Related party is required'),
    transactionDate: z.string().min(1, 'Transaction date is required'),
    natureOfTransaction: z.string().trim().min(1, 'Nature of transaction is required'),
    // Only actually required for a Manual/Other transaction — a linked one derives its amount from the source record (see the cross-field .refine() below).
    amount: z.string(),
    description: z.string().trim().optional(),
    sourceReference: z.string().trim().optional(),
    sourceDocumentType: z.enum(['', 'invoice', 'bill', 'journal_entry', 'customer_receipt', 'payment']),
    sourceDocumentId: z.string().trim().optional(),
  })
  .refine((data) => !data.sourceDocumentType || Boolean(data.sourceDocumentId?.trim()), {
    message: 'Enter the record\'s id to link it, or set the type back to Manual/Other.',
    path: ['sourceDocumentId'],
  })
  .refine((data) => Boolean(data.sourceDocumentType) || isValidNumber(data.amount), {
    message: 'Amount must be a valid number',
    path: ['amount'],
  });

export type RelatedPartyTransactionFormValues = z.infer<typeof transactionSchema>;

export interface RelatedPartyTransactionFormProps {
  transaction?: RelatedPartyTransaction;
  relatedParties: RelatedParty[];
  onSubmit: (data: CreateRelatedPartyTransactionDTO | UpdateRelatedPartyTransactionDTO) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function toDefaultValues(transaction?: RelatedPartyTransaction, relatedParties: RelatedParty[] = []): RelatedPartyTransactionFormValues {
  return {
    relatedPartyId: transaction?.relatedPartyId ?? relatedParties[0]?.id ?? '',
    transactionDate: transaction?.transactionDate ?? new Date().toISOString().slice(0, 10),
    natureOfTransaction: transaction?.natureOfTransaction ?? '',
    amount: transaction ? String(transaction.amount) : '',
    description: transaction?.description ?? '',
    sourceReference: transaction?.sourceReference ?? '',
    sourceDocumentType: transaction?.sourceDocumentType ?? '',
    sourceDocumentId: transaction?.sourceDocumentId ?? '',
  };
}

/**
 * Create/edit form for a Related Party Transaction (react-hook-form +
 * zod), mirroring RelatedPartyForm.tsx's shape. `natureOfTransaction` is
 * free text (no fixed enum). Re-skinned onto v0's Field/Input/Textarea
 * (M13); validation and submit wiring unchanged.
 */
export function RelatedPartyTransactionForm({ transaction, relatedParties, onSubmit, onCancel, onDirtyChange }: RelatedPartyTransactionFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<RelatedPartyTransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: toDefaultValues(transaction, relatedParties),
  });

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  const sourceDocumentType = watch('sourceDocumentType');
  const isLinked = Boolean(sourceDocumentType);

  const submit = handleSubmit(async (data) => {
    await onSubmit({
      relatedPartyId: data.relatedPartyId,
      // Amount/transactionDate/sourceReference are IGNORED by the service
      // and derived from the linked record instead once sourceDocumentType
      // is set (relatedPartyTransactionService.ts's resolveSource()) — the
      // placeholders below are never persisted for a linked transaction.
      transactionDate: data.transactionDate,
      natureOfTransaction: data.natureOfTransaction,
      amount: Number(data.amount || 0),
      description: data.description || undefined,
      sourceReference: data.sourceReference || undefined,
      sourceDocumentType: data.sourceDocumentType || undefined,
      sourceDocumentId: data.sourceDocumentType ? data.sourceDocumentId?.trim() : undefined,
    });
  });

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <FormBody>
      <Field>
        <FieldLabel htmlFor="relatedPartyId">Related Party</FieldLabel>
        <Controller
          control={control}
          name="relatedPartyId"
          render={({ field, fieldState }) => (
            <EnumSelect
              id="relatedPartyId"
              name="relatedPartyId"
              value={field.value ?? ''}
              onValueChange={field.onChange}
              invalid={Boolean(fieldState.error)}
              placeholder={relatedParties.length === 0 ? 'No related parties yet' : 'Select…'}
              options={
                relatedParties.length === 0
                  ? [{ value: '', label: 'No related parties yet' }]
                  : relatedParties.map((party) => ({ value: party.id, label: party.name }))
              }
            />
          )}
        />
        <FieldError errors={[errors.relatedPartyId]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="sourceDocumentType">Source Record</FieldLabel>
        <Controller
          control={control}
          name="sourceDocumentType"
          render={({ field }) => (
            <EnumSelect id="sourceDocumentType" name="sourceDocumentType" value={field.value} onValueChange={field.onChange} options={SOURCE_TYPE_OPTIONS} />
          )}
        />
      </Field>

      {isLinked ? (
        <Field>
          <FieldLabel htmlFor="sourceDocumentId">Record ID</FieldLabel>
          <Input id="sourceDocumentId" placeholder="Paste the record's id" {...register('sourceDocumentId')} />
          <FieldError errors={[errors.sourceDocumentId]} />
          <p className="text-xs text-muted-foreground">Amount, date, and reference will be derived from this record once saved — not entered manually.</p>
        </Field>
      ) : (
        <FormGrid>
          <Field>
            <FieldLabel htmlFor="transactionDate">Transaction Date</FieldLabel>
            <Input id="transactionDate" type="date" {...register('transactionDate')} />
            <FieldError errors={[errors.transactionDate]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="amount">Amount</FieldLabel>
            <Input id="amount" type="number" step="0.01" {...register('amount')} />
            <FieldError errors={[errors.amount]} />
          </Field>
        </FormGrid>
      )}

      <Field>
        <FieldLabel htmlFor="natureOfTransaction">Nature of Transaction</FieldLabel>
        <Input id="natureOfTransaction" placeholder='e.g. "Loan advanced", "Consulting fee", "Rental of premises"' {...register('natureOfTransaction')} />
        <FieldError errors={[errors.natureOfTransaction]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="description">Description</FieldLabel>
        <Textarea id="description" rows={2} {...register('description')} />
      </Field>

      {!isLinked && (
        <Field>
          <FieldLabel htmlFor="sourceReference">Note (optional)</FieldLabel>
          <Input id="sourceReference" placeholder="Why no accounting record exists for this disclosure, if relevant" {...register('sourceReference')} />
        </Field>
      )}

      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || relatedParties.length === 0}>
          {transaction ? 'Save Changes' : 'Add Transaction'}
        </Button>
      </FormFooter>
    </form>
  );
}
