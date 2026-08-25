import { useMemo, useState } from 'react';
import { ListTree, Loader2, Plus, Search } from 'lucide-react';
import type { Account } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/shadcn/input-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn/select';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/shadcn/empty';
import { useAccounts } from '../hooks/useAccounts';
import { AccountTable } from '../components/AccountTable';
import { AccountFormModal } from '../components/AccountFormModal';
import { ACCOUNT_TYPES, defaultAccountFilters, type AccountFilters } from '../types/account.types';
import { mapFormValuesToAccountPatch, type AccountFormSchema } from '../utils/accountFormSchema';

type DialogState = { mode: 'create' } | { mode: 'edit'; account: Account } | null;

const TYPE_FILTER_ITEMS = [
  { value: 'all', label: 'All types' },
  ...ACCOUNT_TYPES.map((t) => ({ value: t.value, label: t.label })),
];

const STATUS_FILTER_ITEMS = [
  { value: 'all', label: 'Active and inactive' },
  { value: 'active', label: 'Active only' },
  { value: 'inactive', label: 'Inactive only' },
];

/**
 * Chart of Accounts — route `/accounting/coa` (docs/ROUTES.md). Real
 * useAccounts()/AccountService data, v0 page shell (PageHeader/SectionCard)
 * and controls, hierarchy table unchanged underneath (see AccountTable.tsx).
 * v0's own Chart of Accounts mock additionally shows a per-category balance
 * strip and a "Cost of Sales" category — the real domain has neither (no
 * stored/computed per-account balance, and only the 5 SA-GAAP master types)
 * so both are omitted here rather than invented; see the M3 report.
 */
export function ChartOfAccountsPage() {
  const { accounts, postedAccountIds, loading, error, refetch, createAccount, updateAccount, deleteAccount } =
    useAccounts();
  const [filters, setFilters] = useState<AccountFilters>(defaultAccountFilters);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [submitting, setSubmitting] = useState(false);
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
    setSubmitting(true);
    try {
      if (dialog?.mode === 'edit') {
        await updateAccount(dialog.account.id, mapFormValuesToAccountPatch(values));
      } else {
        await createAccount(mapFormValuesToAccountPatch(values));
      }
      setDialog(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save account.');
    } finally {
      setSubmitting(false);
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
    <>
      <PageHeader
        title="Chart of accounts"
        description="The general ledger's account structure — Assets, Liabilities, Equity, Revenue, and Expenses, in SA GAAP order."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setFormError(null);
              setDialog({ mode: 'create' });
            }}
          >
            <Plus data-icon="inline-start" />
            New account
          </Button>
        }
      />

      <SectionCard bodyClassName="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <InputGroup className="w-full sm:max-w-72">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              value={filters.search}
              placeholder="Search by code or name…"
              aria-label="Search accounts"
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
          </InputGroup>

          <Select
            items={TYPE_FILTER_ITEMS}
            value={filters.type}
            onValueChange={(value) => setFilters((f) => ({ ...f, type: value as AccountFilters['type'] }))}
          >
            <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-40" aria-label="Filter by master type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TYPE_FILTER_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select
            items={STATUS_FILTER_ITEMS}
            value={filters.status}
            onValueChange={(value) => setFilters((f) => ({ ...f, status: value as AccountFilters['status'] }))}
          >
            <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-40" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {STATUS_FILTER_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      {loading && (
        <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading chart of accounts…</p>
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-destructive">{error.message}</p>
          <Button variant="outline" size="sm" onClick={refetch}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && accounts.length === 0 && (
        <SectionCard>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListTree />
              </EmptyMedia>
              <EmptyTitle>No accounts yet</EmptyTitle>
              <EmptyDescription>Add your first ledger account to start building the chart.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
                <Plus data-icon="inline-start" />
                New account
              </Button>
            </EmptyContent>
          </Empty>
        </SectionCard>
      )}

      {!loading && !error && accounts.length > 0 && filtered.length === 0 && (
        <SectionCard>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle>No matching accounts</EmptyTitle>
              <EmptyDescription>Adjust the search or filters to widen the view.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </SectionCard>
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
        <AccountFormModal
          title={dialog.mode === 'edit' ? `Edit ${dialog.account.name}` : 'New account'}
          initialValues={dialog.mode === 'edit' ? dialog.account : undefined}
          accounts={accounts}
          hasPostings={dialog.mode === 'edit' ? postedAccountIds.has(dialog.account.id) : false}
          submitLabel={dialog.mode === 'edit' ? 'Save changes' : 'Create account'}
          submitting={submitting}
          submitError={formError}
          onClose={() => setDialog(null)}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}
