import { useMemo, useState } from 'react';
import { Loader2, Plus, UploadIcon, Users } from 'lucide-react';
import type { Customer } from '@/types';
import { FigureBlock } from '@/components/app/figure';
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
import { formatCurrency } from '@/lib/app/format';
import { useCustomers } from '../hooks/useCustomers';
import { useCustomerMutations } from '../hooks/useCustomerMutations';
import { CustomerTable } from '../components/CustomerTable';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { ImportWizard } from '@/features/import/components/ImportWizard';
import { customerImportAdapter } from '@/features/import/adapters';
import { ExportMenu } from '@/features/export/components/ExportMenu';
import { PrintableReport } from '@/features/export/components/PrintableReport';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { invoicesToOpenItems } from '../mock-data/openItems';
import { calculateFleetSummary } from '../utils/customerFinancials';

const CUSTOMER_EXPORT_COLUMNS: ExportColumn<Customer>[] = [
  { key: 'code', header: 'Customer Code', accessor: (c) => c.customerNumber },
  { key: 'name', header: 'Name', accessor: (c) => c.name },
  { key: 'email', header: 'Email', accessor: (c) => c.email ?? null },
  { key: 'phone', header: 'Phone', accessor: (c) => c.phone ?? null },
  { key: 'vat', header: 'VAT Number', accessor: (c) => c.taxNumber ?? null },
  { key: 'terms', header: 'Payment Terms', accessor: (c) => c.paymentTerms ?? null },
  {
    key: 'balance',
    header: 'Balance',
    accessor: (c) => c.balance,
    align: 'right',
    formatForPrint: (c) => formatCurrency(c.balance),
    total: (rows) => rows.reduce((sum, c) => sum + c.balance, 0),
  },
  { key: 'status', header: 'Status', accessor: (c) => (c.creditHold ? 'On hold' : c.status) },
];

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
 * Phase 3 fidelity fix: v0's CustomersPage has a 4-tile stat row above the
 * table (total receivable / overdue / active / on-hold) this page was
 * missing entirely. Added back using real data — `Customer.balance` (the
 * same stored field v0 itself sums) and real Invoice data via
 * useInvoices()/invoicesToOpenItems(), the same conversion
 * CustomerDetailPage already uses for its own aging figures — not the
 * mock openItems dataset. "On hold" counts the real `creditHold` flag,
 * since the actual domain has no `'on-hold'` status value.
 */
export function CustomerListPage({ onView, onCreate, onEdit }: CustomerListPageProps) {
  const { customers, loading, error, refetch } = useCustomers();
  const { inactivateCustomer, activateCustomer } = useCustomerMutations();
  const { invoices } = useInvoices();
  const canCreate = useCanAccess('customer_management', 'create');
  const canUpdate = useCanAccess('customer_management', 'update');
  const canImport = useCanAccess('customer_management', 'import');
  const canExport = useCanAccess('customer_management', 'export');
  const [importOpen, setImportOpen] = useState(false);
  const [visibleCustomers, setVisibleCustomers] = useState<Customer[]>(customers);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const openItems = useMemo(() => invoicesToOpenItems(invoices), [invoices]);
  const fleetSummary = useMemo(
    () => calculateFleetSummary(customers, openItems),
    [customers, openItems],
  );

  async function handleToggleActive(customer: Customer): Promise<void> {
    if (customer.status === 'active') {
      await inactivateCustomer(customer.id);
    } else {
      await activateCustomer(customer.id);
    }
    refetch();
  }

  const exportDataset: ExportDataset<Customer> = {
    title: 'Customers',
    subtitle: `${visibleCustomers.length} of ${customers.length} accounts`,
    filters: activeFilters,
    columns: CUSTOMER_EXPORT_COLUMNS,
    rows: visibleCustomers,
    filename: `customers-${new Date().toISOString().slice(0, 10)}`,
  };

  return (
    <>
      <PageHeader
        title="Customers"
        description="Search, filter, and manage your accounts-receivable customer master list."
        actions={
          <>
            <ExportMenu dataset={exportDataset} allowed={canExport} />
            {canImport && (
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                <UploadIcon data-icon="inline-start" />
                Import
              </Button>
            )}
            {canCreate && (
              <Button size="sm" onClick={onCreate}>
                <Plus data-icon="inline-start" />
                New customer
              </Button>
            )}
          </>
        }
      />

      {!loading && !error && (
        <SectionCard>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <FigureBlock
              label="Total receivable"
              value={formatCurrency(fleetSummary.totalReceivable)}
              hint={`Across ${customers.length} accounts`}
            />
            <FigureBlock
              label="Overdue"
              value={formatCurrency(fleetSummary.totalOverdue)}
              hint="Past agreed payment terms"
              tone="negative"
            />
            <FigureBlock
              label="Active accounts"
              value={String(fleetSummary.activeCount)}
              hint="Trading normally"
              tone="positive"
            />
            <FigureBlock
              label="On hold"
              value={String(fleetSummary.onHoldCount)}
              hint="Blocked from new orders"
              tone={fleetSummary.onHoldCount > 0 ? 'warning' : 'default'}
            />
          </div>
        </SectionCard>
      )}

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
            overdueByCustomerId={fleetSummary.overdueByCustomerId}
            onView={onView}
            onEdit={canUpdate ? onEdit : undefined}
            onToggleActive={canUpdate ? (customer) => void handleToggleActive(customer) : undefined}
            onVisibleRowsChange={(rows, filters) => {
              setVisibleCustomers(rows);
              setActiveFilters(filters);
            }}
          />
        </SectionCard>
      )}

      <PrintableReport dataset={exportDataset} className="hidden print:block" />

      {importOpen && (
        <ImportWizard
          adapters={[customerImportAdapter]}
          onClose={() => setImportOpen(false)}
          onImported={() => void refetch()}
        />
      )}
    </>
  );
}
