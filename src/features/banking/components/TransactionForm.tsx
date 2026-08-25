import { useState } from 'react';
import type { Account, BankAccount, TaxRate } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/shadcn/tabs';
import type { AllocationInput, CreateDirectTransactionInput, CreateTransferInput } from '../services';
import { AllocationRows } from './AllocationRows';

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

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
 * Direct Payment / Direct Receipt / Inter-Account Transfer entry form —
 * same fields/validation/submit shape as before the port, JSX re-skinned
 * onto v0's Tabs/Field/Input primitives. Receipts and payments share the
 * split-allocation editor with per-line VAT; a transfer has no allocation
 * at all — it's a direct move between two bank accounts (debit
 * destination / credit source), never a revenue/expense line.
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
    <div className="flex flex-col gap-6">
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList variant="line" className="w-full justify-start border-b border-border">
          <TabsTrigger value="receipt">Direct receipt</TabsTrigger>
          <TabsTrigger value="payment">Direct payment</TabsTrigger>
          <TabsTrigger value="transfer">Inter-account transfer</TabsTrigger>
        </TabsList>

        {formError && (
          <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}

        {/* Receipt and payment share this exact body (only the labels/direction differ) — rendered
            manually rather than as two near-duplicate TabsContent panels, since TabsContent's
            per-tab matching isn't meant to serve two distinct tab values from one panel. */}
        {mode !== 'transfer' && (
          <div className="flex flex-col gap-4 pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="txn-account">Bank account</FieldLabel>
              <select id="txn-account" className={selectClassName} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="txn-date">Date</FieldLabel>
              <Input id="txn-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="txn-description">Description</FieldLabel>
              <Input
                id="txn-description"
                placeholder={mode === 'receipt' ? 'e.g. Customer payment' : 'e.g. Supplier payment, bank charges'}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="txn-reference">Reference</FieldLabel>
              <Input id="txn-reference" className="figure" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="txn-amount">Gross amount {mode === 'receipt' ? '(money in)' : '(money out)'}</FieldLabel>
              <Input
                id="txn-amount"
                type="number"
                step="0.01"
                value={amount || ''}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              />
            </Field>
          </div>

          <AllocationRows allocations={allocations} onChange={setAllocations} glAccounts={glAccounts} taxRates={taxRates} grossAmount={amount} />
          </div>
        )}

        <TabsContent value="transfer" className="flex flex-col gap-4 pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="txn-from">From account (source — credited)</FieldLabel>
              <select id="txn-from" className={selectClassName} value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="txn-to">To account (destination — debited)</FieldLabel>
              <select id="txn-to" className={selectClassName} value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="txn-transfer-date">Date</FieldLabel>
              <Input id="txn-transfer-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="txn-transfer-amount">Amount</FieldLabel>
              <Input
                id="txn-transfer-amount"
                type="number"
                step="0.01"
                value={transferAmount || ''}
                onChange={(e) => setTransferAmount(parseFloat(e.target.value) || 0)}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="txn-transfer-description">Description (optional)</FieldLabel>
              <Input id="txn-transfer-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            {fromAccountId && toAccountId && fromAccountId === toAccountId && (
              <p className="text-xs text-destructive sm:col-span-2">Source and destination accounts must be different.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Saving…' : mode === 'transfer' ? 'Record transfer' : 'Record transaction'}
        </Button>
      </div>
    </div>
  );
}
