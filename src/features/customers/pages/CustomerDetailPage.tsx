import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import type { Customer } from '@/types';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/shadcn/tabs';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/shadcn/empty';
import { useCustomer } from '../hooks/useCustomer';
import { useCustomerMutations } from '../hooks/useCustomerMutations';
import { calculateAgingForCustomer } from '../utils/calculateAging';
import { calculateFinancialSummary } from '../utils/customerFinancials';
import { invoicesToOpenItems } from '../mock-data/openItems';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { CustomerStatusBadge, CreditHoldBadge } from '../components/CustomerStatusBadge';

export interface CustomerDetailPageProps {
  customerId: string;
  onBack: () => void;
  onEdit: (customer: Customer) => void;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

const agingBuckets: { key: 'current' | 'days30' | 'days60' | 'days90Plus'; label: string }[] = [
  { key: 'current', label: 'Current' },
  { key: 'days30', label: '1-30 days' },
  { key: 'days60', label: '31-60 days' },
  { key: 'days90Plus', label: '90+ days' },
];

/**
 * Customer Hub: financial summary, aging breakdown, contact/address
 * overview, transaction history (stub — no real invoice data exists yet),
 * and a statements date-range stub. Reached from CustomerListPage via
 * in-page view state (no dedicated route — see CustomersPage.tsx).
 * Re-skinned onto v0's PageHeader/SectionCard/Tabs/FigureBlock; the real
 * aging/financial-summary calculations and mutation hooks are unchanged.
 */
export function CustomerDetailPage({ customerId, onBack, onEdit }: CustomerDetailPageProps) {
  const { customer, loading, error, refetch } = useCustomer(customerId);
  const { inactivateCustomer, activateCustomer, saving } = useCustomerMutations();
  const [statementFrom, setStatementFrom] = useState('');
  const [statementTo, setStatementTo] = useState('');
  const navigate = useNavigate();

  const { invoices } = useInvoices();
  const openItems = useMemo(
    () => (customer ? invoicesToOpenItems(invoices.filter((inv) => inv.customerId === customer.id)) : []),
    [customer, invoices],
  );
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

  if (loading) {
    return (
      <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        <p className="text-sm">Loading customer…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-destructive">{error.message}</p>
        <Button variant="outline" size="sm" onClick={refetch}>
          Try again
        </Button>
      </div>
    );
  }

  if (!customer) {
    return (
      <SectionCard>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Customer not found</EmptyTitle>
            <EmptyDescription>This customer may have been removed.</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" size="sm" onClick={onBack}>
            Back to customers
          </Button>
        </Empty>
      </SectionCard>
    );
  }

  return (
    <>
      <PageHeader
        title={customer.name}
        description={`${customer.customerNumber}${customer.email ? ` · ${customer.email}` : ''}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft data-icon="inline-start" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/sales/invoices')}>
              New invoice
            </Button>
            <Button variant="outline" size="sm" onClick={() => onEdit(customer)}>
              Edit
            </Button>
            <Button
              variant={customer.status === 'active' ? 'destructive' : 'default'}
              size="sm"
              disabled={saving}
              onClick={() => void handleToggleActive()}
            >
              {customer.status === 'active' ? 'Inactivate' : 'Activate'}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <CustomerStatusBadge status={customer.status} />
        {customer.creditHold && <CreditHoldBadge />}
      </div>

      {summary && (
        <section aria-label="Customer financial summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SectionCard bodyClassName="p-5">
            <FigureBlock label="Total outstanding" value={formatCurrency(summary.totalOutstanding, customer.currency)} />
          </SectionCard>
          <SectionCard bodyClassName="p-5">
            <FigureBlock
              label="Overdue balance"
              value={formatCurrency(summary.overdueBalance, customer.currency)}
              tone={summary.overdueBalance > 0 ? 'negative' : 'default'}
            />
          </SectionCard>
          <SectionCard bodyClassName="p-5">
            <FigureBlock
              label="Available credit"
              value={summary.availableCredit === null ? 'No limit set' : formatCurrency(summary.availableCredit, customer.currency)}
              tone={summary.availableCredit !== null && summary.availableCredit < 0 ? 'negative' : 'positive'}
            />
          </SectionCard>
          <SectionCard bodyClassName="p-5">
            <FigureBlock label="YTD sales" value={formatCurrency(summary.ytdSales, customer.currency)} />
          </SectionCard>
        </section>
      )}

      <Tabs defaultValue="overview">
        <TabsList variant="line" className="w-full justify-start border-b border-border">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="aging">Aging</TabsTrigger>
          <TabsTrigger value="transactions">Transaction history</TabsTrigger>
          <TabsTrigger value="statements">Statements</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="Contact details">
              <InfoRow label="Phone" value={customer.phone ?? '—'} />
              <InfoRow label="Email" value={customer.email ?? '—'} />
              <InfoRow
                label="Primary contact"
                value={customer.contacts?.find((c) => c.isPrimary)?.name ?? customer.contacts?.[0]?.name ?? '—'}
              />
              <div className="mt-4 flex flex-col gap-3">
                <h3 className="text-sm font-semibold">Billing address</h3>
                <p className="text-sm text-muted-foreground">
                  {customer.billingAddress
                    ? [customer.billingAddress.line1, customer.billingAddress.line2, customer.billingAddress.city, customer.billingAddress.postalCode, customer.billingAddress.country]
                        .filter(Boolean)
                        .join(', ')
                    : 'No billing address on file.'}
                </p>
                <h3 className="text-sm font-semibold">Shipping address</h3>
                <p className="text-sm text-muted-foreground">
                  {customer.shippingAddress
                    ? [customer.shippingAddress.line1, customer.shippingAddress.line2, customer.shippingAddress.city, customer.shippingAddress.postalCode, customer.shippingAddress.country]
                        .filter(Boolean)
                        .join(', ')
                    : 'Same as billing / none on file.'}
                </p>
              </div>
            </SectionCard>

            <SectionCard title="Financial settings">
              <InfoRow label="Currency" value={customer.currency} />
              <InfoRow label="Payment terms" value={customer.paymentTerms ?? '—'} />
              <InfoRow label="Credit limit" value={typeof customer.creditLimit === 'number' ? formatCurrency(customer.creditLimit, customer.currency) : '—'} />
              <InfoRow label="Default discount" value={typeof customer.defaultDiscountPercent === 'number' ? `${customer.defaultDiscountPercent}%` : '—'} />
              <InfoRow label="Tax/VAT number" value={customer.taxNumber ?? '—'} />
              <InfoRow label="Tax status" value={customer.taxStatus ?? '—'} />
              <InfoRow label="Customer since" value={formatDate(customer.createdAt)} />
              {customer.notes && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold">Notes</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{customer.notes}</p>
                </div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="aging" className="pt-4">
          <SectionCard title="Accounts receivable aging">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {agingBuckets.map(({ key, label }) => (
                <FigureBlock key={key} label={label} value={formatCurrency(aging[key], customer.currency)} />
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="transactions" className="pt-4">
          <SectionCard>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>No transaction history yet</EmptyTitle>
                <EmptyDescription>
                  Invoices, credit notes, and receipts will appear here once posted.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </SectionCard>
        </TabsContent>

        <TabsContent value="statements" className="pt-4">
          <SectionCard title="Remittance & statements">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end gap-4">
                <Field className="w-auto">
                  <FieldLabel htmlFor="statement-from">From</FieldLabel>
                  <Input id="statement-from" type="date" value={statementFrom} onChange={(e) => setStatementFrom(e.target.value)} />
                </Field>
                <Field className="w-auto">
                  <FieldLabel htmlFor="statement-to">To</FieldLabel>
                  <Input id="statement-to" type="date" value={statementTo} onChange={(e) => setStatementTo(e.target.value)} />
                </Field>
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  title="PDF statement export ships once the Sales module provides real invoice data."
                >
                  <FileText data-icon="inline-start" />
                  Export statement (PDF)
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                PDF statement export is not yet available — it will be enabled once the Sales module supplies real
                invoice and receipt records for this date range.
              </p>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </>
  );
}
