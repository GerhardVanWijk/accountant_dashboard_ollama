import { Loader2, Plus, Users } from 'lucide-react';
import type { Customer } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/shadcn/empty';
import { useCustomers } from '../hooks/useCustomers';
import { useCustomerMutations } from '../hooks/useCustomerMutations';
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
 */
export function CustomerListPage({ onView, onCreate, onEdit }: CustomerListPageProps) {
  const { customers, loading, error, refetch } = useCustomers();
  const { inactivateCustomer, activateCustomer } = useCustomerMutations();
  const canCreate = useCanAccess('customer_management', 'create');
  const canUpdate = useCanAccess('customer_management', 'update');

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
