import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency } from '@/lib/app/format';
import { useCustomerAgingReport } from '../hooks/useCustomerAgingReport';
import { AgingReportTable } from '../components/AgingReportTable';
import { filterZeroBalance, sortByTotalDescending, sumAgingBuckets } from '../utils/agingReportUtils';
import { CustomerDetailSheet } from '@/features/customers/components/CustomerDetailSheet';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Customer Aging Report ("Aged Receivables Summary") — route
 * `/reports/customer-aging`. One row per customer with current/30/60/90+
 * buckets, worst debtors first. Reuses the real per-customer aging math
 * (`calculateAgingForCustomer`, via `getCustomerAgingReport()`) already
 * used on the Customer Detail page and Dashboard — this page is the
 * single-screen list view across every customer at once, not a second
 * aging engine. Re-skinned onto v0's PageHeader/SectionCard/FigureBlock
 * (M9).
 */
export function CustomerAgingPage() {
  const navigate = useNavigate();
  const [asOfDate, setAsOfDate] = useState(today());
  const [showAll, setShowAll] = useState(false);
  const { rows, loading, error, refetch } = useCustomerAgingReport(asOfDate);

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCustomerId = searchParams.get('record') ?? undefined;
  const detailOpen = Boolean(selectedCustomerId);
  function openCustomer(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('record', id);
      return next;
    });
  }
  function closeCustomer() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('record');
      return next;
    });
  }

  const visibleRows = useMemo(() => sortByTotalDescending(filterZeroBalance(rows, showAll)), [rows, showAll]);
  const withBalanceCount = useMemo(() => rows.filter((row) => row.buckets.total > 0).length, [rows]);
  const totals = useMemo(() => sumAgingBuckets(visibleRows), [visibleRows]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Customer aging"
        description="Aged Receivables Summary — every customer's outstanding balance by age bucket, worst debtors first."
        actions={
          <Field className="w-40">
            <FieldLabel htmlFor="customerAgingAsOfDate">As of date</FieldLabel>
            <Input id="customerAgingAsOfDate" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </Field>
        }
      />

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <FigureBlock label="Customers with balance" value={String(withBalanceCount)} />
          <FigureBlock label="Total receivable" value={formatCurrency(totals.total)} />
          <FigureBlock label="Current" value={formatCurrency(totals.current)} />
          <FigureBlock label="90+ days overdue" value={formatCurrency(totals.days90Plus)} tone={totals.days90Plus > 0 ? 'negative' : 'default'} />
        </div>
      </SectionCard>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={showAll} onCheckedChange={(value) => setShowAll(value === true)} />
        Show customers with a zero balance
      </label>

      {loading && (
        <div role="status" className="flex min-h-[30vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Computing customer aging…</p>
        </div>
      )}
      {!loading && error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && (
        <SectionCard>
          <AgingReportTable
            rows={visibleRows}
            entityLabel="Customer"
            emptyTitle={showAll ? 'No customers yet' : 'No outstanding customer balances'}
            emptyMessage={showAll ? 'Add a customer to see them listed here.' : 'Every customer is fully paid as of this date — tick "Show customers with a zero balance" to see them anyway.'}
            onSelect={openCustomer}
          />
        </SectionCard>
      )}

      <CustomerDetailSheet
        customerId={selectedCustomerId}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeCustomer();
        }}
        onEdit={(customer) => navigate(`/sales/customers?record=${customer.id}`)}
      />
    </div>
  );
}
