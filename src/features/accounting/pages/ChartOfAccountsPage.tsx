import { useMemo, useState } from 'react';
import type { Account } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useAccounts } from '../hooks/useAccounts';
import { AccountTable } from '../components/AccountTable';
import { AccountForm } from '../components/AccountForm';
import { Modal } from '../components/Modal';
import { ACCOUNT_TYPES, defaultAccountFilters, type AccountFilters } from '../types/account.types';
import { mapFormValuesToAccountPatch, type AccountFormSchema } from '../utils/accountFormSchema';

type DialogState = { mode: 'create' } | { mode: 'edit'; account: Account } | null;

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** Chart of Accounts — route `/accounting/coa` (docs/ROUTES.md). */
export function ChartOfAccountsPage() {
  const { accounts, postedAccountIds, loading, error, refetch, createAccount, updateAccount, deleteAccount } =
    useAccounts();
  const [filters, setFilters] = useState<AccountFilters>(defaultAccountFilters);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return accounts.filter((account) => {
      if (search) {
        const haystack = `${account.code} ${account.name}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (filters.type !== 'all' && account.type !== filters.type) return false;
      if (filters.status === 'active' && !account.isActive) return false;
      if (filters.status === 'inactive' && account.isActive) return false;
      return true;
    });
  }, [accounts, filters]);

  async function handleSubmit(values: AccountFormSchema): Promise<void> {
    setFormError(null);
    try {
      if (dialog?.mode === 'edit') {
        await updateAccount(dialog.account.id, mapFormValuesToAccountPatch(values));
      } else {
        await createAccount(mapFormValuesToAccountPatch(values));
      }
      setDialog(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save account.');
    }
  }

  async function handleToggleActive(account: Account): Promise<void> {
    if (account.isActive) {
      await deleteAccount(account.id); // deactivates if posted, else hard-deletes — see AccountService.deleteAccount
    } else {
      await updateAccount(account.id, { isActive: true });
    }
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Chart of Accounts</h1>
          <p className="mt-xs text-sm text-text-secondary">
            The general ledger's account structure — Assets, Liabilities, Equity, Revenue, and Expenses.
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
          New Account
        </Button>
      </div>

      <Card className="flex flex-col gap-sm md:flex-row md:items-center">
        <label className="flex flex-1 flex-col gap-xs text-sm">
          <span className="sr-only">Search accounts</span>
          <input
            aria-label="Search accounts"
            className={inputClass}
            placeholder="Search by code or name…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </label>
        <select
          aria-label="Filter by master type"
          className={inputClass}
          value={filters.type}
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as AccountFilters['type'] }))}
        >
          <option value="all">All Types</option>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          className={inputClass}
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as AccountFilters['status'] }))}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </Card>

      {loading && <Spinner label="Loading chart of accounts…" />}

      {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!loading && !error && accounts.length === 0 && (
        <EmptyState
          title="No accounts yet"
          message="Add your first ledger account to start building the chart."
          action={
            <Button variant="primary" onClick={() => setDialog({ mode: 'create' })}>
              New Account
            </Button>
          }
        />
      )}

      {!loading && !error && accounts.length > 0 && filtered.length === 0 && (
        <EmptyState title="No matching accounts" message="Try adjusting your search or filters." />
      )}

      {!loading && !error && filtered.length > 0 && (
        <AccountTable
          accounts={filtered}
          postedAccountIds={postedAccountIds}
          onEdit={(account) => {
            setFormError(null);
            setDialog({ mode: 'edit', account });
          }}
          onToggleActive={(account) => {
            void handleToggleActive(account);
          }}
        />
      )}

      {dialog && (
        <Modal title={dialog.mode === 'edit' ? `Edit ${dialog.account.name}` : 'New Account'} onClose={() => setDialog(null)}>
          {formError && (
            <p role="alert" className="mb-md rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">
              {formError}
            </p>
          )}
          <AccountForm
            initialValues={dialog.mode === 'edit' ? dialog.account : undefined}
            accounts={accounts}
            hasPostings={dialog.mode === 'edit' ? postedAccountIds.has(dialog.account.id) : false}
            submitLabel={dialog.mode === 'edit' ? 'Save Changes' : 'Create Account'}
            onCancel={() => setDialog(null)}
            onSubmit={handleSubmit}
          />
        </Modal>
      )}
    </div>
  );
}
