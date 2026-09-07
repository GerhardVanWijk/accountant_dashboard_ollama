import { useState } from 'react';
import type { Account, BankAccount, TaxRate } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/shadcn/input-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/shadcn/tabs';
import { EnumSelect } from '@/components/app/combobox';
import { FormFooter, FormGrid, FormSection } from '@/components/app/form';
import type { AllocationInput, CreateDirectTransactionInput, CreateTransferInput } from '../services';
import { AllocationRows } from './AllocationRows';

type Mode = 'receipt' | 'payment' | 'transfer';

export interface TransactionFormProps {
  bankAccounts: BankAccount[];
  glAccounts: Account[];
  taxRates: TaxRate[];
  defaultBankAccountId?: string;
  onSubmitDirect: (input: CreateDirectTransactionInput) => Promise<void>;
  onSubmitTransfer: (input: CreateTransferInput) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Gross / transfer amount — a fixed-width currency field (money is not a full-bleed input). */
function MoneyField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field className="max-w-[16rem]">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupAddon className="text-muted-foreground">R</InputGroupAddon>
        <InputGroupInput
          id={id}
          type="number"
          inputMode="decimal"
          step="0.01"
          className="figure text-right tabular-nums"
          placeholder="0,00"
          value={value || ''}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
      </InputGroup>
    </Field>
  );
}

/**
 * Direct Payment / Direct Receipt / Inter-Account Transfer entry form —
 * same fields/validation/submit shape as before, JSX re-skinned onto the
 * shared Vertex Form System (FormSection / FormGrid / FormFooter). Receipts
 * and payments share the split-allocation editor with per-line VAT; a
 * transfer has no allocation at all — it's a direct move between two bank
 * accounts (debit destination / credit source), never a revenue/expense line.
 */
export function TransactionForm({
  bankAccounts,
  glAccounts,
  taxRates,
  defaultBankAccountId,
  onSubmitDirect,
  onSubmitTransfer,
  onCancel,
  onDirtyChange,
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

  const accountOptions = bankAccounts.map((a) => ({ value: a.id, label: a.name }));

  return (
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="flex min-h-0 flex-1 flex-col">
        <TabsList variant="line" className="w-full shrink-0 justify-start border-b border-border px-4 sm:px-6">
          <TabsTrigger value="receipt">Direct receipt</TabsTrigger>
          <TabsTrigger value="payment">Direct payment</TabsTrigger>
          <TabsTrigger value="transfer">Inter-account transfer</TabsTrigger>
        </TabsList>

        {/* Receipt and payment share this exact body (only the labels/direction differ) — rendered
            manually rather than as two near-duplicate TabsContent panels, since TabsContent's
            per-tab matching isn't meant to serve two distinct tab values from one panel. */}
        {mode !== 'transfer' && (
          <div className="app-scroll flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 sm:px-6 sm:py-5">
            <FormSection title="Transaction details">
              <FormGrid>
                <Field>
                  <FieldLabel htmlFor="txn-account">Bank account</FieldLabel>
                  <EnumSelect id="txn-account" value={bankAccountId} onValueChange={setBankAccountId} options={accountOptions} />
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
              </FormGrid>
            </FormSection>

            <FormSection title="Amount">
              <MoneyField
                id="txn-amount"
                label={`Gross amount ${mode === 'receipt' ? '(money in)' : '(money out)'}`}
                value={amount}
                onChange={setAmount}
              />
            </FormSection>

            <AllocationRows
              allocations={allocations}
              onChange={setAllocations}
              glAccounts={glAccounts}
              taxRates={taxRates}
              grossAmount={amount}
            />
          </div>
        )}

        <TabsContent
          value="transfer"
          className="app-scroll flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 sm:px-6 sm:py-5"
        >
          <FormSection title="Transfer details">
            <FormGrid>
              <Field>
                <FieldLabel htmlFor="txn-from">From account (source — credited)</FieldLabel>
                <EnumSelect id="txn-from" value={fromAccountId} onValueChange={setFromAccountId} options={accountOptions} />
              </Field>
              <Field>
                <FieldLabel htmlFor="txn-to">To account (destination — debited)</FieldLabel>
                <EnumSelect id="txn-to" value={toAccountId} onValueChange={setToAccountId} options={accountOptions} />
              </Field>
              <Field>
                <FieldLabel htmlFor="txn-transfer-date">Date</FieldLabel>
                <Input id="txn-transfer-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field className="col-span-full">
                <FieldLabel htmlFor="txn-transfer-description">Description (optional)</FieldLabel>
                <Input id="txn-transfer-description" value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
              {fromAccountId && toAccountId && fromAccountId === toAccountId && (
                <p className="col-span-full text-xs text-destructive">Source and destination accounts must be different.</p>
              )}
            </FormGrid>
          </FormSection>

          <FormSection title="Amount">
            <MoneyField id="txn-transfer-amount" label="Transfer amount" value={transferAmount} onChange={setTransferAmount} />
          </FormSection>
        </TabsContent>
      </Tabs>

      <FormFooter error={formError ?? undefined}>
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Saving…' : mode === 'transfer' ? 'Record transfer' : 'Record transaction'}
        </Button>
      </FormFooter>
    </div>
  );
}
