import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { RelatedParty, RelatedPartyTransaction } from '@/types/relatedParty';
import { Button } from '@/components/ui/shadcn/button';
import { FormBody, FormFooter } from '@/components/app/form';
import { Field, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import type { CreateRelatedPartyTransactionDTO, UpdateRelatedPartyTransactionDTO } from '../services';

function isValidNumber(value: string): boolean {
  return value.trim() !== '' && !Number.isNaN(Number(value));
}

const transactionSchema = z.object({
  relatedPartyId: z.string().trim().min(1, 'Related party is required'),
  transactionDate: z.string().min(1, 'Transaction date is required'),
  natureOfTransaction: z.string().trim().min(1, 'Nature of transaction is required'),
  amount: z.string().refine(isValidNumber, { message: 'Amount must be a valid number' }),
  description: z.string().trim().optional(),
  sourceReference: z.string().trim().optional(),
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
    formState: { errors, isSubmitting, isDirty },
  } = useForm<RelatedPartyTransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: toDefaultValues(transaction, relatedParties),
  });

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  const submit = handleSubmit(async (data) => {
    await onSubmit({
      relatedPartyId: data.relatedPartyId,
      transactionDate: data.transactionDate,
      natureOfTransaction: data.natureOfTransaction,
      amount: Number(data.amount),
      description: data.description || undefined,
      sourceReference: data.sourceReference || undefined,
    });
  });

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <FormBody>
      <Field>
        <FieldLabel htmlFor="relatedPartyId">Related Party</FieldLabel>
        <NativeSelect id="relatedPartyId" {...register('relatedPartyId')}>
          {relatedParties.length === 0 && <option value="">No related parties yet</option>}
          {relatedParties.map((party) => (
            <option key={party.id} value={party.id}>
              {party.name}
            </option>
          ))}
        </NativeSelect>
        <FieldError errors={[errors.relatedPartyId]} />
      </Field>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
      </div>

      <Field>
        <FieldLabel htmlFor="natureOfTransaction">Nature of Transaction</FieldLabel>
        <Input id="natureOfTransaction" placeholder='e.g. "Loan advanced", "Consulting fee", "Rental of premises"' {...register('natureOfTransaction')} />
        <FieldError errors={[errors.natureOfTransaction]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="description">Description</FieldLabel>
        <Textarea id="description" rows={2} {...register('description')} />
      </Field>

      <Field>
        <FieldLabel htmlFor="sourceReference">Source Reference (optional)</FieldLabel>
        <Input id="sourceReference" placeholder="e.g. an Invoice or Bill number, for cross-checking only" {...register('sourceReference')} />
      </Field>

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
