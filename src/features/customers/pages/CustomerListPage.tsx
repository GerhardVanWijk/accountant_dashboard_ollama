import { useMemo, useState } from 'react';
import type { Customer } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useCustomers } from '../hooks/useCustomers';
import { useCustomerMutations } from '../hooks/useCustomerMutations';
import { CustomerFilters, type CustomerFiltersState } from '../components/CustomerFilters';
import { CustomerTable } from '../components/CustomerTable';

export interface CustomerListPageProps {
  onView: (customer: Customer) => void;
  onCreate: () => void;
  onEdit: (customer: Customer) => void;
}

const defaultFilters: CustomerFiltersState = { search: '', status: 'all', creditHold: 'all' };

function matchesFilters(customer: Customer, filters: CustomerFiltersState): boolean {
  if (filters.status !== 'all' && customer.status !== filters.status) return false;
  if (filters.creditHold === 'hold' && !customer.creditHold) return false;
  if (filters.creditHold === 'clear' && customer.creditHold) return false;

  if (filters.search.trim()) {
    const needle = filters.search.trim().toLowerCase();
    const haystack = [customer.name, customer.customerNumber, customer.email ?? ''].join(' ').toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

/**
 * Customer master directory: search, filter, sort, paginate, and quick
 * row actions. Wired into src/features/sales/pages/CustomersPage.tsx.
 */
export function CustomerListPage({ onView, onCreate, onEdit }: CustomerListPageProps) {
  const { customers, loading, error, refetch } = useCustomers();
  const { inactivateCustomer, activateCustomer } = useCustomerMutations();
  const [filters, setFilters] = useState<CustomerFiltersState>(defaultFilters);

  const filteredCustomers = useMemo(
    () => customers.filter((customer) => matchesFilters(customer, filters)),
    [customers, filters],
  );

  async function handleToggleActive(customer: Customer): Promise<void> {
    if (customer.status === 'active') {
      await inactivateCustomer(customer.id);
    } else {
      await activateCustomer(customer.id);
    }
    refetch();
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Customer Directory</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Search, filter, and manage your accounts-receivable customer master list.
          </p>
        </div>
        <Button onClick={onCreate}>New Customer</Button>
      </div>

      <Card className="flex flex-col gap-lg">
        <CustomerFilters value={filters} onChange={setFilters} />

        {loading && <Spinner label="Loading customers…" />}

        {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}

        {!loading && !error && customers.length === 0 && (
          <EmptyState
            title="No customers yet"
            message="Create your first customer to start tracking sales and receivables."
            action={<Button onClick={onCreate}>New Customer</Button>}
          />
        )}

        {!loading && !error && customers.length > 0 && filteredCustomers.length === 0 && (
          <EmptyState
            title="No matching customers"
            message="Try a different search term or clear the status/credit filters."
            action={
              <Button variant="ghost" onClick={() => setFilters(defaultFilters)}>
                Clear filters
              </Button>
            }
          />
        )}

        {!loading && !error && filteredCustomers.length > 0 && (
          <CustomerTable
            customers={filteredCustomers}
            onView={onView}
            onEdit={onEdit}
            onToggleActive={(customer) => void handleToggleActive(customer)}
          />
        )}
      </Card>
    </div>
  );
}
