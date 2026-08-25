import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import type { BankAccount } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
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
import { formatCurrency } from '@/lib/app/format';
import { useBankAccounts } from '../hooks/useBankAccounts';
import { useBankAccountMutations } from '../hooks/useBankAccountMutations';
import { useGlAccounts } from '../hooks/useGlAccounts';
import { BankAccountTable } from '../components/BankAccountTable';
import { BankAccountFormModal } from '../components/BankAccountFormModal';
import { bankReconciliationService } from '../services';
import { BANK_ACCOUNT_TYPE_LABELS } from '../constants';
import { buildGlAccountCodeMap } from '../utils/glAccountCodeMap';
import type { BankAccountFormSchema } from '../utils/bankAccountFormSchema';

type DialogState = { mode: 'create' } | { mode: 'edit'; account: BankAccount } | null;

const TYPE_FILTER_ITEMS = [
  { value: 'all', label: 'All types' },
  ...Object.entries(BANK_ACCOUNT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const STATUS_FILTER_ITEMS = [
  { value: 'all', label: 'Active and inactive' },
  { value: 'active', label: 'Active only' },
  { value: 'inactive', label: 'Inactive only' },
];

/**
 * Cash & Bank Accounts — route `/banking/accounts`. Real
 * useBankAccounts()/BankAccountService data; v0's own Banking page has no
 * dedicated accounts CRUD screen (it only renders read-only account
 * cards inline), so this page keeps the real, necessary create/edit/
 * deactivate workflow, styled onto v0's account-card visual language.
 */
export function BankAccountsPage() {
  const { bankAccounts, isLoading, error, refetch } = useBankAccounts();
  const { createBankAccount, updateBankAccount, deleteBankAccount } = useBankAccountMutations();
  const { accounts: glAccounts } = useGlAccounts();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | BankAccount['accountType']>('all');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastReconciledDates, setLastReconciledDates] = useState<Map<string, string>>(new Map());

  const glAccountCodes = useMemo(() => buildGlAccountCodeMap(glAccounts), [glAccounts]);

  // Most recent finalized reconciliation per account, via the real
  // bankReconciliationService.getHistory() — not a stored field on
  // BankAccount, and never computed independently here.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      bankAccounts.map(async (a) => {
        const history = await bankReconciliationService.getHistory(a.id);
        return [a.id, history[0]?.finalizedAt] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      setLastReconciledDates(new Map(entries.filter((e): e is [string, string] => Boolean(e[1]))));
    });
    return () => {
      cancelled = true;
    };
  }, [bankAccounts]);

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
    setSubmitting(true);
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
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(account: BankAccount): Promise<void> {
    if (account.status === 'active') {
      await deleteBankAccount(account.id); // deactivates if it has transaction history, else hard-deletes — see BankAccountService.deleteBankAccount
    } else {
      await updateBankAccount(account.id, { status: 'active' });
    }
    refetch();
  }

  return (
    <>
      <PageHeader
        title="Cash & bank accounts"
        description="Bank accounts, petty cash, and credit cards — each linked to a Chart of Accounts GL account."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setFormError(null);
              setDialog({ mode: 'create' });
            }}
          >
            <Plus data-icon="inline-start" />
            New bank account
          </Button>
        }
      />

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-2">
          <FigureBlock
            label="Total active ZAR balance"
            value={formatCurrency(totalBalance)}
            hint={`${bankAccounts.length} account${bankAccounts.length === 1 ? '' : 's'}`}
          />
          <FigureBlock
            label="Active accounts"
            value={String(bankAccounts.filter((a) => a.status === 'active').length)}
            hint="Currently postable"
          />
        </div>
      </SectionCard>

      <SectionCard bodyClassName="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <InputGroup className="w-full sm:max-w-72">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              placeholder="Search by name, bank, or account number…"
              aria-label="Search bank accounts"
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>

          <Select
            items={TYPE_FILTER_ITEMS}
            value={typeFilter}
            onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}
          >
            <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-44" aria-label="Filter by account type">
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
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
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

      {isLoading && (
        <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading bank accounts…</p>
        </div>
      )}

      {!isLoading && error && (
        <div role="alert" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-destructive">{error.message}</p>
          <Button variant="outline" size="sm" onClick={refetch}>
            Try again
          </Button>
        </div>
      )}

      {!isLoading && !error && bankAccounts.length === 0 && (
        <SectionCard>
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No bank accounts yet</EmptyTitle>
              <EmptyDescription>Add your first bank account, petty cash tin, or credit card to start recording transactions.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
                New bank account
              </Button>
            </EmptyContent>
          </Empty>
        </SectionCard>
      )}

      {!isLoading && !error && bankAccounts.length > 0 && filtered.length === 0 && (
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

      {!isLoading && !error && filtered.length > 0 && (
        <BankAccountTable
          accounts={filtered}
          glAccountCodes={glAccountCodes}
          lastReconciledDates={lastReconciledDates}
          onEdit={(account) => {
            setFormError(null);
            setDialog({ mode: 'edit', account });
          }}
          onToggleActive={(account) => void handleToggleActive(account)}
        />
      )}

      {dialog && (
        <BankAccountFormModal
          title={dialog.mode === 'edit' ? `Edit ${dialog.account.name}` : 'New bank account'}
          initialValues={dialog.mode === 'edit' ? dialog.account : undefined}
          glAccounts={glAccounts}
          submitLabel={dialog.mode === 'edit' ? 'Save changes' : 'Create bank account'}
          submitting={submitting}
          submitError={formError}
          onClose={() => setDialog(null)}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}
