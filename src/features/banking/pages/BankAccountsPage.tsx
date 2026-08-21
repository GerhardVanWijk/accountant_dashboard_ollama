import { useMemo, useState } from 'react';
import type { BankAccount } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useBankAccounts } from '../hooks/useBankAccounts';
import { useBankAccountMutations } from '../hooks/useBankAccountMutations';
import { useGlAccounts } from '../hooks/useGlAccounts';
import { BankAccountTable } from '../components/BankAccountTable';
import { BankAccountForm } from '../components/BankAccountForm';
import { Modal } from '../components/Modal';
import { BANK_ACCOUNT_TYPE_LABELS } from '../constants';
import type { BankAccountFormSchema } from '../utils/bankAccountFormSchema';

type DialogState = { mode: 'create' } | { mode: 'edit'; account: BankAccount } | null;
type StatusFilter = 'all' | 'active' | 'inactive';
type TypeFilter = 'all' | BankAccount['accountType'];

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/**
 * Cash & Bank Accounts — setup/list/edit for Current/Savings/Credit Card/
 * Petty Cash/Money Market/Foreign Currency accounts, SA banking metadata,
 * and the required Chart of Accounts GL link. Route `/banking/accounts`
 * (docs/ROUTES.md, wired by Queen Bee — not edited here).
 */
export function BankAccountsPage() {
  const { bankAccounts, isLoading, error, refetch } = useBankAccounts();
  const { createBankAccount, updateBankAccount, deleteBankAccount } = useBankAccountMutations();
  const { accounts: glAccounts } = useGlAccounts();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return bankAccounts.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (typeFilter !== 'all' && a.accountType !== typeFilter) return false;
      if (needle) {
        const haystack = `${a.name} ${a.bankName} ${a.accountNumber}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [bankAccounts, search, statusFilter, typeFilter]);

  const totalBalance = bankAccounts
    .filter((a) => a.status === 'active' && a.currency === 'ZAR')
    .reduce((sum, a) => sum + a.currentBalance, 0);

  async function handleSubmit(values: BankAccountFormSchema): Promise<void> {
    setFormError(null);
    try {
      const payload = {
        name: values.name,
        bankName: values.bankName,
        accountNumber: values.accountNumber,
        accountType: values.accountType,
        branchCode: values.branchCode || undefined,
        swiftCode: values.swiftCode || undefined,
        currency: values.currency.toUpperCase(),
        openingBalance: values.openingBalance,
        glAccountId: values.glAccountId,
        status: values.status,
      };
      if (dialog?.mode === 'edit') {
        await updateBankAccount(dialog.account.id, payload);
      } else {
        await createBankAccount(payload);
      }
      setDialog(null);
      refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save bank account.');
    }
  }

  async function handleToggleActive(account: BankAccount): Promise<void> {
    if (account.status === 'active') {
      await deleteBankAccount(account.id);
    } else {
      await updateBankAccount(account.id, { status: 'active' });
    }
    refetch();
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Cash &amp; Bank Accounts</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Bank accounts, petty cash, and credit cards — each linked to a Chart of Accounts GL account.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setFormError(null);
            setDialog({ mode: 'create' });
          }}
        >
          <Icon name="add" size={16} />
          New Bank Account
        </Button>
      </div>

      <Card className="flex flex-wrap items-center gap-sm">
        <div className="text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">{bankAccounts.length}</span> account
          {bankAccounts.length === 1 ? '' : 's'} · Total active ZAR balance:{' '}
          <span className="font-semibold text-text-primary tabular-nums">
            {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(totalBalance)}
          </span>
        </div>
      </Card>

      <Card className="flex flex-col gap-sm md:flex-row md:items-center">
        <label className="flex flex-1 flex-col gap-xs text-sm">
          <span className="sr-only">Search bank accounts</span>
          <input
            aria-label="Search bank accounts"
            className={inputClass}
            placeholder="Search by name, bank, or account number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by account type"
          className={inputClass}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
        >
          <option value="all">All Types</option>
          {Object.entries(BANK_ACCOUNT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
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
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </Card>

      {isLoading && <Spinner label="Loading bank accounts…" />}

      {!isLoading && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!isLoading && !error && bankAccounts.length === 0 && (
        <EmptyState
          title="No bank accounts yet"
          message="Add your first bank account, petty cash tin, or credit card to start recording transactions."
          action={<Button onClick={() => setDialog({ mode: 'create' })}>New Bank Account</Button>}
        />
      )}

      {!isLoading && !error && bankAccounts.length > 0 && filtered.length === 0 && (
        <EmptyState
          title="No matching accounts"
          message="Try a different search term or clear the filters."
          action={
            <Button
              variant="ghost"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
                setTypeFilter('all');
              }}
            >
              Clear filters
            </Button>
          }
        />
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <BankAccountTable
          accounts={filtered}
          onEdit={(account) => {
            setFormError(null);
            setDialog({ mode: 'edit', account });
          }}
          onToggleActive={(account) => void handleToggleActive(account)}
        />
      )}

      {dialog && (
        <Modal
          title={dialog.mode === 'edit' ? `Edit ${dialog.account.name}` : 'New Bank Account'}
          onClose={() => setDialog(null)}
        >
          {formError && (
            <p role="alert" className="mb-md rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">
              {formError}
            </p>
          )}
          <BankAccountForm
            initialValues={dialog.mode === 'edit' ? dialog.account : undefined}
            glAccounts={glAccounts}
            submitLabel={dialog.mode === 'edit' ? 'Save Changes' : 'Create Bank Account'}
            onCancel={() => setDialog(null)}
            onSubmit={handleSubmit}
          />
        </Modal>
      )}
    </div>
  );
}
