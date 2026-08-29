import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Loader2, Plus } from 'lucide-react';
import type { BankAccount } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn/select';
import { ConfirmDialog } from '@/components/app/form';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useBankAccounts } from '../hooks/useBankAccounts';
import { useBankTransactions } from '../hooks/useBankTransactions';
import { useBankTransactionMutations } from '../hooks/useBankTransactionMutations';
import { useGlAccounts } from '../hooks/useGlAccounts';
import { BankTransactionTable } from '../components/BankTransactionTable';
import { BankTransactionDetailSheet } from '../components/BankTransactionDetailSheet';
import { TransactionFormModal } from '../components/TransactionFormModal';
import { AllocateTransactionFormModal } from '../components/AllocateTransactionFormModal';
import { StatementImportWizard } from '../components/StatementImportWizard';
import type { BankTransactionWithAllocations } from '../types';

type DialogState =
  | { mode: 'new' }
  | { mode: 'allocate'; transaction: BankTransactionWithAllocations }
  | { mode: 'import' }
  | { mode: 'confirmDelete'; transaction: BankTransactionWithAllocations }
  | null;

/**
 * Bank Transactions — route `/banking/transactions`. Real
 * useBankTransactions()/BankTransactionService data: Direct Payments/
 * Receipts with split allocation and per-line VAT, inter-account
 * transfers, statement import (real CSV/OFX/QIF/MT940 parsing), and
 * smart-match suggestions — all unchanged, only the JSX re-skinned.
 */
export function BankTransactionsPage() {
  const { bankAccounts, isLoading: accountsLoading } = useBankAccounts();
  const { taxRates } = useTaxRates();
  const { accounts: glAccounts } = useGlAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');

  const filterAccountId = selectedAccountId === 'all' ? undefined : selectedAccountId;
  const { transactions, isLoading, error, refetch } = useBankTransactions(filterAccountId);
  const { createDirectTransaction, createTransfer, allocateTransaction, deleteTransaction, error: mutationError } =
    useBankTransactionMutations({ onSuccess: refetch });
  const navigate = useNavigate();

  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTransactionId = searchParams.get('record') ?? undefined;
  const detailOpen = Boolean(selectedTransactionId);
  function openRecord(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('record', id);
      return next;
    });
  }
  function closeRecord() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('record');
      return next;
    });
  }
  const detailTransaction = transactions.find((t) => t.id === selectedTransactionId);

  const bankAccountsById = useMemo(() => new Map(bankAccounts.map((a) => [a.id, a] as [string, BankAccount])), [bankAccounts]);

  const unreconciledCount = transactions.filter((t) => t.status !== 'reconciled').length;
  const needsAllocationCount = transactions.filter((t) => t.allocations.length === 0 && !t.transferPairId).length;

  async function handleDelete(txn: BankTransactionWithAllocations) {
    setDeleteError(null);
    try {
      await deleteTransaction(txn.id);
      setDialog(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete transaction.');
    }
  }

  const importTargetAccountId = filterAccountId ?? bankAccounts[0]?.id;

  return (
    <>
      <PageHeader
        title="Bank transactions"
        description="Direct payments and receipts, inter-account transfers, and bank statement import."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setDialog({ mode: 'import' })} disabled={!importTargetAccountId}>
              <Download data-icon="inline-start" />
              Import statement
            </Button>
            <Button size="sm" onClick={() => setDialog({ mode: 'new' })} disabled={bankAccounts.length === 0}>
              <Plus data-icon="inline-start" />
              New transaction
            </Button>
          </>
        }
      />

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-3">
          <FigureBlock label="Statement lines" value={String(transactions.length)} hint="In the current view" />
          <FigureBlock
            label="Awaiting reconciliation"
            value={String(unreconciledCount)}
            hint="Not yet cleared"
            tone={unreconciledCount > 0 ? 'warning' : 'default'}
          />
          <FigureBlock
            label="Needs allocation"
            value={String(needsAllocationCount)}
            hint="No GL split yet"
            tone={needsAllocationCount > 0 ? 'warning' : 'default'}
          />
        </div>
      </SectionCard>

      <Select
        items={[{ value: 'all', label: 'All accounts' }, ...bankAccounts.map((a) => ({ value: a.id, label: a.name }))]}
        value={selectedAccountId}
        onValueChange={(value) => setSelectedAccountId(String(value))}
      >
        <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-56" aria-label="Filter by bank account">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">All accounts</SelectItem>
            {bankAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      {mutationError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {mutationError.message}
        </p>
      )}

      {(isLoading || accountsLoading) && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading bank transactions…</p>
        </div>
      )}

      {!isLoading && error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error.message}
        </div>
      )}

      {!isLoading && !error && bankAccounts.length === 0 && (
        <SectionCard>
          <p className="py-8 text-center text-sm text-muted-foreground">
            Set up a bank account first, then record transactions against it.
          </p>
        </SectionCard>
      )}

      {!isLoading && !error && bankAccounts.length > 0 && (
        <BankTransactionTable
          transactions={transactions}
          bankAccountsById={bankAccountsById}
          showAccountColumn={selectedAccountId === 'all'}
          onAllocate={(txn) => setDialog({ mode: 'allocate', transaction: txn })}
          onDelete={(txn) => setDialog({ mode: 'confirmDelete', transaction: txn })}
          onSelect={(txn) => openRecord(txn.id)}
        />
      )}

      <BankTransactionDetailSheet
        transaction={detailTransaction}
        isLoading={isLoading}
        bankAccount={detailTransaction ? bankAccountsById.get(detailTransaction.bankAccountId) : undefined}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeRecord();
        }}
        onAllocate={detailTransaction ? () => setDialog({ mode: 'allocate', transaction: detailTransaction }) : undefined}
      />

      {dialog?.mode === 'new' && (
        <TransactionFormModal
          bankAccounts={bankAccounts}
          glAccounts={glAccounts}
          taxRates={taxRates}
          defaultBankAccountId={filterAccountId}
          onSubmitDirect={async (input) => {
            await createDirectTransaction(input);
            setDialog(null);
          }}
          onSubmitTransfer={async (input) => {
            await createTransfer(input);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.mode === 'allocate' && (
        <AllocateTransactionFormModal
          transaction={dialog.transaction}
          glAccounts={glAccounts}
          taxRates={taxRates}
          onSubmit={async (allocations) => {
            await allocateTransaction(dialog.transaction.id, allocations);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.mode === 'import' && importTargetAccountId && (
        <StatementImportWizard
          bankAccounts={bankAccounts}
          defaultBankAccountId={importTargetAccountId}
          onImported={() => {
            void refetch();
          }}
          onReconcile={() => {
            setDialog(null);
            // P2: route to the reconciliation workspace scoped to this statement id
            // (the /banking/reconciliation route does not read a statement param yet).
            navigate('/banking/reconciliation');
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.mode === 'confirmDelete' && (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setDialog(null); }}
          title={`Delete ${dialog.transaction.description}?`}
          description="This permanently removes the transaction. This cannot be undone. A transaction already cleared by a finalized reconciliation can never be deleted this way."
          confirmLabel="Delete transaction"
          destructive
          error={deleteError}
          onConfirm={() => void handleDelete(dialog.transaction)}
        />
      )}
    </>
  );
}
