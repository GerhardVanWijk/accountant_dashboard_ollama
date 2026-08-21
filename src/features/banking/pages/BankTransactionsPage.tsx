import { useMemo, useState } from 'react';
import type { BankAccount } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useBankAccounts } from '../hooks/useBankAccounts';
import { useBankTransactions } from '../hooks/useBankTransactions';
import { useBankTransactionMutations } from '../hooks/useBankTransactionMutations';
import { useGlAccounts } from '../hooks/useGlAccounts';
import { bankTransactionService } from '../services';
import { BankTransactionTable } from '../components/BankTransactionTable';
import { TransactionForm } from '../components/TransactionForm';
import { AllocateTransactionForm } from '../components/AllocateTransactionForm';
import { StatementImportPanel } from '../components/StatementImportPanel';
import { Modal } from '../components/Modal';
import type { BankTransactionWithAllocations } from '../types';

type StatusFilter = 'all' | 'unreconciled' | 'matched' | 'reconciled';
type DialogState =
  | { mode: 'new' }
  | { mode: 'allocate'; transaction: BankTransactionWithAllocations }
  | { mode: 'import' }
  | null;

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/**
 * Bank Transactions — Direct Payments/Receipts with split allocation and
 * per-line VAT, inter-account transfers, statement import (real CSV/OFX/
 * QIF/MT940 parsing), and smart-match suggestions. Route
 * `/banking/transactions` (docs/ROUTES.md, wired by Queen Bee).
 */
export function BankTransactionsPage() {
  const { bankAccounts, isLoading: accountsLoading } = useBankAccounts();
  const { taxRates } = useTaxRates();
  const { accounts: glAccounts } = useGlAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');

  const filterAccountId = selectedAccountId === 'all' ? undefined : selectedAccountId;
  const { transactions, isLoading, error, refetch } = useBankTransactions(filterAccountId);
  const { createDirectTransaction, createTransfer, allocateTransaction, deleteTransaction, importStatementLines, error: mutationError } =
    useBankTransactionMutations({ onSuccess: refetch });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dialog, setDialog] = useState<DialogState>(null);

  const bankAccountsById = useMemo(() => new Map(bankAccounts.map((a) => [a.id, a] as [string, BankAccount])), [bankAccounts]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (needle) {
        const haystack = `${t.description} ${t.reference ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [transactions, search, statusFilter]);

  async function handleDelete(txn: BankTransactionWithAllocations) {
    if (!window.confirm(`Delete "${txn.description}"? This cannot be undone.`)) return;
    await deleteTransaction(txn.id);
  }

  const importTargetAccountId = filterAccountId ?? bankAccounts[0]?.id;

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Bank Transactions</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Direct payments and receipts, inter-account transfers, and bank statement import.
          </p>
        </div>
        <div className="flex flex-wrap gap-sm">
          <Button variant="ghost" onClick={() => setDialog({ mode: 'import' })} disabled={!importTargetAccountId}>
            <Icon name="download" size={16} />
            Import Statement
          </Button>
          <Button variant="primary" onClick={() => setDialog({ mode: 'new' })} disabled={bankAccounts.length === 0}>
            <Icon name="add" size={16} />
            New Transaction
          </Button>
        </div>
      </div>

      <Card className="flex flex-col gap-sm md:flex-row md:items-center">
        <label className="flex flex-1 flex-col gap-xs text-sm">
          <span className="sr-only">Search transactions</span>
          <input
            aria-label="Search transactions"
            className={inputClass}
            placeholder="Search by description or reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by bank account"
          className={inputClass}
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
        >
          <option value="all">All Accounts</option>
          {bankAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          className={inputClass}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="all">All Statuses</option>
          <option value="unreconciled">Unreconciled</option>
          <option value="matched">Matched</option>
          <option value="reconciled">Reconciled</option>
        </select>
      </Card>

      {mutationError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">
          {mutationError.message}
        </p>
      )}

      {(isLoading || accountsLoading) && <Spinner label="Loading bank transactions…" />}

      {!isLoading && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!isLoading && !error && bankAccounts.length === 0 && (
        <EmptyState
          title="No bank accounts yet"
          message="Set up a bank account first, then record transactions against it."
        />
      )}

      {!isLoading && !error && bankAccounts.length > 0 && transactions.length === 0 && (
        <EmptyState
          title="No transactions yet"
          message="Record a direct payment/receipt, a transfer, or import a bank statement."
          action={<Button onClick={() => setDialog({ mode: 'new' })}>New Transaction</Button>}
        />
      )}

      {!isLoading && !error && transactions.length > 0 && filtered.length === 0 && (
        <EmptyState
          title="No matching transactions"
          message="Try a different search term or clear the filters."
          action={
            <Button
              variant="ghost"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
              }}
            >
              Clear filters
            </Button>
          }
        />
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <BankTransactionTable
          transactions={filtered}
          bankAccountsById={bankAccountsById}
          showAccountColumn={selectedAccountId === 'all'}
          onAllocate={(txn) => setDialog({ mode: 'allocate', transaction: txn })}
          onDelete={(txn) => void handleDelete(txn)}
        />
      )}

      {dialog?.mode === 'new' && (
        <Modal title="New Bank Transaction" onClose={() => setDialog(null)} wide>
          <TransactionForm
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
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}

      {dialog?.mode === 'allocate' && (
        <Modal title="Allocate Transaction" onClose={() => setDialog(null)} wide>
          <AllocateTransactionForm
            transaction={dialog.transaction}
            glAccounts={glAccounts}
            taxRates={taxRates}
            onSubmit={async (allocations) => {
              await allocateTransaction(dialog.transaction.id, allocations);
              setDialog(null);
            }}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}

      {dialog?.mode === 'import' && importTargetAccountId && (
        <Modal title="Import Bank Statement" onClose={() => setDialog(null)} wide>
          <StatementImportPanel
            findMatches={(line) => bankTransactionService.findMatchesForLine(importTargetAccountId, line)}
            onImport={async (lines) => {
              await importStatementLines(importTargetAccountId, lines);
              setDialog(null);
            }}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}
    </div>
  );
}
