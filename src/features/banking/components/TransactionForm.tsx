import { useState } from 'react';
import type { Account, BankAccount, TaxRate } from '@/types';
import { Button } from '@/components/ui/Button';
import type { AllocationInput, CreateDirectTransactionInput, CreateTransferInput } from '../services';
import { AllocationRows } from './AllocationRows';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

type Mode = 'receipt' | 'payment' | 'transfer';

export interface TransactionFormProps {
  bankAccounts: BankAccount[];
  glAccounts: Account[];
  taxRates: TaxRate[];
  defaultBankAccountId?: string;
  onSubmitDirect: (input: CreateDirectTransactionInput) => Promise<void>;
  onSubmitTransfer: (input: CreateTransferInput) => Promise<void>;
  onCancel: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Direct Payment / Direct Receipt / Inter-Account Transfer entry form.
 * Receipts and payments share the split-allocation editor with per-line
 * VAT; a transfer has no allocation at all — it's a direct move between
 * two bank accounts (debit destination / credit source), never a
 * revenue/expense line, per this dispatch's brief.
 */
export function TransactionForm({
  bankAccounts,
  glAccounts,
  taxRates,
  defaultBankAccountId,
  onSubmitDirect,
  onSubmitTransfer,
  onCancel,
}: TransactionFormProps) {
  const [mode, setMode] = useState<Mode>('receipt');
  const [bankAccountId, setBankAccountId] = useState(defaultBankAccountId ?? bankAccounts[0]?.id ?? '');
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [allocations, setAllocations] = useState<AllocationInput[]>([{ glAccountId: '', description: '', netAmount: 0 }]);

  const [fromAccountId, setFromAccountId] = useState(defaultBankAccountId ?? bankAccounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(bankAccounts[1]?.id ?? bankAccounts[0]?.id ?? '');
  const [transferAmount, setTransferAmount] = useState<number>(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    setIsSubmitting(true);
    try {
      if (mode === 'transfer') {
        await onSubmitTransfer({
          fromBankAccountId: fromAccountId,
          toBankAccountId: toAccountId,
          date: new Date(date).toISOString(),
          amount: transferAmount,
          description: description || undefined,
          reference: reference || undefined,
        });
      } else {
        await onSubmitDirect({
          bankAccountId,
          date: new Date(date).toISOString(),
          description,
          reference: reference || undefined,
          amount,
          direction: mode === 'receipt' ? 'debit' : 'credit',
          allocations,
        });
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save transaction.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex gap-xs border-b border-border" role="tablist">
        {(['receipt', 'payment', 'transfer'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`px-md py-sm text-sm font-medium transition-colors ${
              mode === m ? 'border-b-2 border-primary text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {m === 'receipt' ? 'Direct Receipt' : m === 'payment' ? 'Direct Payment' : 'Inter-Account Transfer'}
          </button>
        ))}
      </div>

      {formError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">
          {formError}
        </p>
      )}

      {mode !== 'transfer' && (
        <div className="flex flex-col gap-md">
          <div className="grid grid-cols-1 gap-md md:grid-cols-2">
            <label className="flex flex-col gap-xs text-sm">
              <span className="font-medium text-text-primary">Bank Account</span>
              <select className={inputClass} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-xs text-sm">
              <span className="font-medium text-text-primary">Date</span>
              <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-xs text-sm">
              <span className="font-medium text-text-primary">Description</span>
              <input
                className={inputClass}
                placeholder={mode === 'receipt' ? 'e.g. Customer payment' : 'e.g. Supplier payment, bank charges'}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-xs text-sm">
              <span className="font-medium text-text-primary">Reference</span>
              <input className={`${inputClass} font-mono`} value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
            <label className="flex flex-col gap-xs text-sm">
              <span className="font-medium text-text-primary">
                Gross Amount {mode === 'receipt' ? '(money in)' : '(money out)'}
              </span>
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={amount || ''}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              />
            </label>
          </div>

          <AllocationRows
            allocations={allocations}
            onChange={setAllocations}
            glAccounts={glAccounts}
            taxRates={taxRates}
            grossAmount={amount}
          />
        </div>
      )}

      {mode === 'transfer' && (
        <div className="grid grid-cols-1 gap-md md:grid-cols-2">
          <label className="flex flex-col gap-xs text-sm">
            <span className="font-medium text-text-primary">From Account (source — credited)</span>
            <select className={inputClass} value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-xs text-sm">
            <span className="font-medium text-text-primary">To Account (destination — debited)</span>
            <select className={inputClass} value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-xs text-sm">
            <span className="font-medium text-text-primary">Date</span>
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-xs text-sm">
            <span className="font-medium text-text-primary">Amount</span>
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={transferAmount || ''}
              onChange={(e) => setTransferAmount(parseFloat(e.target.value) || 0)}
            />
          </label>
          <label className="flex flex-col gap-xs text-sm md:col-span-2">
            <span className="font-medium text-text-primary">Description (optional)</span>
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {fromAccountId && toAccountId && fromAccountId === toAccountId && (
            <p className="text-xs text-danger md:col-span-2">Source and destination accounts must be different.</p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-sm border-t border-border pt-md">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Saving…' : mode === 'transfer' ? 'Record Transfer' : 'Record Transaction'}
        </Button>
      </div>
    </div>
  );
}
