import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { RelatedParty, RelatedPartyTransaction } from '@/types/relatedParty';
import { Button } from '@/components/ui/Button';
import { fieldError, fieldInput, fieldLabel } from './formStyles';
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
 * free text (no fixed enum, §110 — see relatedParty.ts's doc comment).
 */
export function RelatedPartyTransactionForm({ transaction, relatedParties, onSubmit, onCancel }: RelatedPartyTransactionFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RelatedPartyTransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: toDefaultValues(transaction, relatedParties),
  });

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
    <form onSubmit={submit} className="flex flex-col gap-md" noValidate>
      <div>
        <label className={fieldLabel} htmlFor="relatedPartyId">
          Related Party
        </label>
        <select id="relatedPartyId" className={fieldInput} {...register('relatedPartyId')}>
          {relatedParties.length === 0 && <option value="">No related parties yet</option>}
          {relatedParties.map((party) => (
            <option key={party.id} value={party.id}>
              {party.name}
            </option>
          ))}
        </select>
        {errors.relatedPartyId && <p className={fieldError}>{errors.relatedPartyId.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="transactionDate">
            Transaction Date
          </label>
          <input id="transactionDate" type="date" className={fieldInput} {...register('transactionDate')} />
          {errors.transactionDate && <p className={fieldError}>{errors.transactionDate.message}</p>}
        </div>
        <div>
          <label className={fieldLabel} htmlFor="amount">
            Amount
          </label>
          <input id="amount" type="number" step="0.01" className={fieldInput} {...register('amount')} />
          {errors.amount && <p className={fieldError}>{errors.amount.message}</p>}
        </div>
      </div>

      <div>
        <label className={fieldLabel} htmlFor="natureOfTransaction">
          Nature of Transaction
        </label>
        <input
          id="natureOfTransaction"
          className={fieldInput}
          placeholder='e.g. "Loan advanced", "Consulting fee", "Rental of premises"'
          {...register('natureOfTransaction')}
        />
        {errors.natureOfTransaction && <p className={fieldError}>{errors.natureOfTransaction.message}</p>}
      </div>

      <div>
        <label className={fieldLabel} htmlFor="description">
          Description
        </label>
        <textarea id="description" rows={2} className={fieldInput} {...register('description')} />
      </div>

      <div>
        <label className={fieldLabel} htmlFor="sourceReference">
          Source Reference (optional)
        </label>
        <input
          id="sourceReference"
          className={fieldInput}
          placeholder="e.g. an Invoice or Bill number, for cross-checking only"
          {...register('sourceReference')}
        />
      </div>

      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || relatedParties.length === 0}>
          {transaction ? 'Save Changes' : 'Add Transaction'}
        </Button>
      </div>
    </form>
  );
}
