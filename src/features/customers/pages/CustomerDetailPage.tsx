import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Customer } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import { cn } from '@/utils/cn';
import { useCustomer } from '../hooks/useCustomer';
import { useCustomerMutations } from '../hooks/useCustomerMutations';
import { calculateAgingForCustomer } from '../utils/calculateAging';
import { calculateFinancialSummary } from '../utils/customerFinancials';
import { getOpenItemsForCustomer } from '../mock-data/openItems';
import { CustomerStatusBadge, CreditHoldBadge } from '../components/CustomerStatusBadge';
import { CustomerSummaryCards } from '../components/CustomerSummaryCards';
import { CustomerAgingBreakdown } from '../components/CustomerAgingBreakdown';

export interface CustomerDetailPageProps {
  customerId: string;
  onBack: () => void;
  onEdit: (customer: Customer) => void;
}

type DetailTab = 'overview' | 'aging' | 'transactions' | 'statements';

const tabs: { id: DetailTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'aging', label: 'Aging' },
  { id: 'transactions', label: 'Transaction History' },
  { id: 'statements', label: 'Statements' },
];

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-md border-b border-border py-sm last:border-b-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm font-medium text-text-primary">{value}</span>
    </div>
  );
}

/**
 * Customer Hub: financial summary cards, aging breakdown, contact/address
 * overview, transaction history (stub — no real invoice data exists yet),
 * and a statements date-range stub. Reached from CustomerListPage via
 * in-page view state (no dedicated route — see CustomersPage.tsx).
 */
export function CustomerDetailPage({ customerId, onBack, onEdit }: CustomerDetailPageProps) {
  const { customer, loading, error, refetch } = useCustomer(customerId);
  const { inactivateCustomer, activateCustomer, saving } = useCustomerMutations();
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [statementFrom, setStatementFrom] = useState('');
  const [statementTo, setStatementTo] = useState('');
  const navigate = useNavigate();

  const openItems = useMemo(() => (customer ? getOpenItemsForCustomer(customer.id) : []), [customer]);
  const aging = useMemo(() => calculateAgingForCustomer(customerId, new Date(), openItems), [customerId, openItems]);
  const summary = useMemo(
    () => (customer ? calculateFinancialSummary(customer, new Date(), openItems) : null),
    [customer, openItems],
  );

  async function handleToggleActive(): Promise<void> {
    if (!customer) return;
    if (customer.status === 'active') {
      await inactivateCustomer(customer.id);
    } else {
      await activateCustomer(customer.id);
    }
    refetch();
  }

  if (loading) return <Spinner label="Loading customer…" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!customer) {
    return (
      <EmptyState
        title="Customer not found"
        message="This customer may have been removed."
        action={
          <Button variant="ghost" onClick={onBack}>
            Back to Customer Directory
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm">
        <Button variant="ghost" className="w-fit px-sm py-xs text-sm" onClick={onBack}>
          ← Back to Customer Directory
        </Button>
        <div className="flex flex-col gap-sm sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-sm">
              <h1 className="text-2xl font-semibold text-text-primary">{customer.name}</h1>
              <CustomerStatusBadge status={customer.status} />
              {customer.creditHold && <CreditHoldBadge />}
            </div>
            <p className="mt-xs text-sm text-text-secondary">
              {customer.customerNumber}
              {customer.email ? ` · ${customer.email}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-sm">
            <Button variant="ghost" onClick={() => navigate('/sales/invoices')}>
              New Invoice
            </Button>
            <Button variant="ghost" onClick={() => onEdit(customer)}>
              Edit
            </Button>
            <Button variant={customer.status === 'active' ? 'danger' : 'primary'} disabled={saving} onClick={() => void handleToggleActive()}>
              {customer.status === 'active' ? 'Inactivate' : 'Activate'}
            </Button>
          </div>
        </div>
      </div>

      {summary && <CustomerSummaryCards summary={summary} currency={customer.currency} />}

      <Card className="flex flex-col gap-lg">
        <div role="tablist" aria-label="Customer detail sections" className="flex flex-wrap gap-xs border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'rounded-t-md px-md py-sm text-sm font-medium transition-colors',
                activeTab === tab.id ? 'bg-primary text-on-accent' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
            <div>
              <h3 className="mb-sm text-sm font-semibold text-text-primary">Contact Details</h3>
              <InfoRow label="Phone" value={customer.phone ?? '—'} />
              <InfoRow label="Email" value={customer.email ?? '—'} />
              <InfoRow label="Primary Contact" value={customer.contacts?.find((c) => c.isPrimary)?.name ?? customer.contacts?.[0]?.name ?? '—'} />

              <h3 className="mb-sm mt-lg text-sm font-semibold text-text-primary">Billing Address</h3>
              <p className="text-sm text-text-secondary">
                {customer.billingAddress
                  ? [customer.billingAddress.line1, customer.billingAddress.line2, customer.billingAddress.city, customer.billingAddress.postalCode, customer.billingAddress.country]
                      .filter(Boolean)
                      .join(', ')
                  : 'No billing address on file.'}
              </p>

              <h3 className="mb-sm mt-lg text-sm font-semibold text-text-primary">Shipping Address</h3>
              <p className="text-sm text-text-secondary">
                {customer.shippingAddress
                  ? [customer.shippingAddress.line1, customer.shippingAddress.line2, customer.shippingAddress.city, customer.shippingAddress.postalCode, customer.shippingAddress.country]
                      .filter(Boolean)
                      .join(', ')
                  : 'Same as billing / none on file.'}
              </p>
            </div>

            <div>
              <h3 className="mb-sm text-sm font-semibold text-text-primary">Financial Settings</h3>
              <InfoRow label="Currency" value={customer.currency} />
              <InfoRow label="Payment Terms" value={customer.paymentTerms ?? '—'} />
              <InfoRow label="Credit Limit" value={typeof customer.creditLimit === 'number' ? formatCurrency(customer.creditLimit, customer.currency) : '—'} />
              <InfoRow label="Default Discount" value={typeof customer.defaultDiscountPercent === 'number' ? `${customer.defaultDiscountPercent}%` : '—'} />
              <InfoRow label="Tax/VAT Number" value={customer.taxNumber ?? '—'} />
              <InfoRow label="Tax Status" value={customer.taxStatus ?? '—'} />
              <InfoRow label="Customer Since" value={formatDate(customer.createdAt)} />
              {customer.notes && (
                <>
                  <h3 className="mb-sm mt-lg text-sm font-semibold text-text-primary">Notes</h3>
                  <p className="text-sm text-text-secondary">{customer.notes}</p>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'aging' && <CustomerAgingBreakdown aging={aging} currency={customer.currency} />}

        {activeTab === 'transactions' && (
          <EmptyState
            title="No transaction history yet"
            message="Invoices, credit notes, and receipts will appear here once the Sales module is connected."
          />
        )}

        {activeTab === 'statements' && (
          <div className="flex flex-col gap-md">
            <div className="flex flex-col gap-sm sm:flex-row sm:items-end sm:gap-md">
              <label className="flex flex-col gap-xs text-sm text-text-secondary">
                From
                <input
                  type="date"
                  value={statementFrom}
                  onChange={(e) => setStatementFrom(e.target.value)}
                  className="rounded-md border border-border bg-panel px-sm py-sm text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                />
              </label>
              <label className="flex flex-col gap-xs text-sm text-text-secondary">
                To
                <input
                  type="date"
                  value={statementTo}
                  onChange={(e) => setStatementTo(e.target.value)}
                  className="rounded-md border border-border bg-panel px-sm py-sm text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                />
              </label>
              <Button disabled title="PDF statement export ships once the Sales module provides real invoice data.">
                <Icon name="invoices" size={16} />
                Export Statement (PDF)
              </Button>
            </div>
            <p className="text-sm text-text-muted">
              PDF statement export is not yet available — it will be enabled once the Sales module supplies real
              invoice and receipt records for this date range.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
