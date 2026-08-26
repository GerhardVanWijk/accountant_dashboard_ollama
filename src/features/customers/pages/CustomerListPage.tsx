import { useMemo } from 'react';
import { Loader2, Plus, Users } from 'lucide-react';
import type { Customer } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/shadcn/empty';
import { formatCurrency } from '@/lib/app/format';
import { useCustomers } from '../hooks/useCustomers';
import { useCustomerMutations } from '../hooks/useCustomerMutations';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { invoicesToOpenItems } from '../mock-data/openItems';
import { calculateAgingForCustomer, getOverdueTotal } from '../utils/calculateAging';
import { CustomerTable } from '../components/CustomerTable';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';

export interface CustomerListPageProps {
  onView: (customer: Customer) => void;
  onCreate: () => void;
  onEdit: (customer: Customer) => void;
}

/**
 * Customer master directory: search, filter, sort, paginate (all inside
 * the shared v0 DataTable via CustomerTable), and quick row actions.
 * Wired into src/features/sales/pages/CustomersPage.tsx. Re-skinned onto
 * v0's PageHeader/SectionCard shell; the real useCustomers()/
 * useCustomerMutations() hooks are unchanged.
 *
 * The summary SectionCard (M15, docs/... v0 fidelity restoration) restores
 * v0's `app/app/customers/page.tsx` 4-FigureBlock stat row, reproduced
 * label-for-label/grid-for-grid, backed entirely by real data: "Total
 * receivable" is the real `Customer.balance` sum; "Overdue" reuses this
 * feature's own real `calculateAgingForCustomer()`/`getOverdueTotal()`
 * against real posted Invoices (via `useInvoices()` +
 * `invoicesToOpenItems()`, the exact pattern CustomerDetailPage.tsx
 * already established) rather than a naive re-guess; "Active accounts"
 * is the real `status` field. v0's fourth figure ("On hold") has no
 * matching status value in this app's `ActiveStatus` enum
 * (active/inactive only) — the real, honest equivalent already
 * surfaced elsewhere in this exact table is the `creditHold` boolean
 * (see `CreditHoldBadge`/the existing "hold" filter in CustomerTable.tsx),
 * so that's what backs this figure instead of a fabricated status.
 */
export function CustomerListPage({ onView, onCreate, onEdit }: CustomerListPageProps) {
  const { customers, loading, error, refetch } = useCustomers();
  const { invoices } = useInvoices();
  const { inactivateCustomer, activateCustomer } = useCustomerMutations();
  const canCreate = useCanAccess('customer_management', 'create');
  const canUpdate = useCanAccess('customer_management', 'update');

  const summary = useMemo(() => {
    const openItems = invoicesToOpenItems(invoices);
    const totalReceivable = customers.reduce((sum, c) => sum + c.balance, 0);
    const overdue = customers.reduce(
      (sum, c) => sum + getOverdueTotal(calculateAgingForCustomer(c.id, new Date(), openItems)),
      0,
    );
    const activeCount = customers.filter((c) => c.status === 'active').length;
    const onHoldCount = customers.filter((c) => c.creditHold).length;
    return { totalReceivable, overdue, activeCount, onHoldCount };
  }, [customers, invoices]);

  async function handleToggleActive(customer: Customer): Promise<void> {
    if (customer.status === 'active') {
      await inactivateCustomer(customer.id);
    } else {
      await activateCustomer(customer.id);
    }
    refetch();
  }

  return (
    <>
      <PageHeader
        title="Customers"
        description="Search, filter, and manage your accounts-receivable customer master list."
        actions={
          canCreate ? (
            <Button size="sm" onClick={onCreate}>
              <Plus data-icon="inline-start" />
              New customer
            </Button>
          ) : undefined
        }
      />

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <FigureBlock
            label="Total receivable"
            value={formatCurrency(summary.totalReceivable)}
            hint={`Across ${customers.length} account${customers.length === 1 ? '' : 's'}`}
          />
          <FigureBlock
            label="Overdue"
            value={formatCurrency(summary.overdue)}
            hint="Past agreed payment terms"
            tone="negative"
          />
          <FigureBlock
            label="Active accounts"
            value={String(summary.activeCount)}
            hint="Trading normally"
            tone="positive"
          />
          <FigureBlock
            label="On hold"
            value={String(summary.onHoldCount)}
            hint="Blocked from new orders"
            tone={summary.onHoldCount > 0 ? 'warning' : 'default'}
          />
        </div>
      </SectionCard>

      {loading && (
        <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading customers…</p>
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

      {!loading && !error && customers.length === 0 && (
        <SectionCard>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyTitle>No customers yet</EmptyTitle>
              <EmptyDescription>Create your first customer to start tracking sales and receivables.</EmptyDescription>
            </EmptyHeader>
            {canCreate && (
              <EmptyContent>
                <Button size="sm" onClick={onCreate}>
                  <Plus data-icon="inline-start" />
                  New customer
                </Button>
              </EmptyContent>
            )}
          </Empty>
        </SectionCard>
      )}

      {!loading && !error && customers.length > 0 && (
        <SectionCard bodyClassName="p-5">
          <CustomerTable
            customers={customers}
            onView={onView}
            onEdit={canUpdate ? onEdit : undefined}
            onToggleActive={canUpdate ? (customer) => void handleToggleActive(customer) : undefined}
          />
        </SectionCard>
      )}
    </>
  );
}
