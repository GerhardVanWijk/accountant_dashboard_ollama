import { Link } from 'react-router-dom';
import { ArrowUpRight, Landmark, Loader2, Plus, Receipt, ScrollText } from 'lucide-react';

import { ActivityFeed } from '@/components/app/dashboard/activity-feed';
import { AgeingPanel } from '@/components/app/dashboard/ageing-panel';
import { CashFlowChart, PerformanceChart } from '@/components/app/dashboard/dashboard-charts';
import { Amount, FigureBlock } from '@/components/app/figure';
import { MetricCard } from '@/components/app/metric-card';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { CURRENT_PERIOD_LABEL, formatCurrency } from '@/lib/app/format';
import { useDashboardData } from '../hooks/useDashboardData';
import { toV0AgeingBuckets, toV0MonthlySeries } from '../utils/toV0DashboardView';

const quickActions = [
  { label: 'New invoice', href: '/sales/invoices', icon: Plus },
  { label: 'Record expense', href: '/purchases/bills', icon: Receipt },
  { label: 'Reconcile bank', href: '/banking/reconciliation', icon: Landmark },
  { label: 'Post journal', href: '/accounting/journals', icon: ScrollText },
];

/**
 * Executive Dashboard — the `/` landing route. Phase M1
 * (docs/V0_DASHBOARD_INTEGRATION.md): the ported v0 dashboard design,
 * wired to this app's own existing ../hooks/useDashboardData.ts — the
 * same hook and the same real customer/supplier/product/GL data the
 * previous (pre-v0) DashboardPage used, none of it re-derived here (per
 * docs/DO_NOT_BREAK.md, this page only formats/maps already-computed
 * results). Two v0 panels (expense mix, revenue by customer) have no real
 * data source anywhere in this app yet — see the "not available" blocks
 * below rather than invented figures.
 */
export function DashboardPage() {
  const { data, loading, error, refetch } = useDashboardData();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        <p className="text-sm">Loading dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-destructive">{error.message}</p>
        <Button variant="outline" size="sm" onClick={refetch}>
          Try again
        </Button>
      </div>
    );
  }

  if (!data || !data.hasAnyData) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-medium">Nothing to show yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Add customers, suppliers, or products to see live metrics here.
        </p>
      </div>
    );
  }

  const monthlySeries = toV0MonthlySeries(data.monthlyFinancials);
  const arBuckets = toV0AgeingBuckets(data.arAging);
  const apBuckets = toV0AgeingBuckets(data.apAging);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Financial position for ${CURRENT_PERIOD_LABEL}. All figures in South African rand, excluding VAT unless stated.`}
        actions={
          <>
            {quickActions.slice(0, 2).map((action) => (
              <Button
                key={action.label}
                render={<Link to={action.href} />}
                nativeButton={false}
                variant={action.label === 'New invoice' ? 'default' : 'outline'}
                size="sm"
              >
                <action.icon data-icon="inline-start" />
                {action.label}
              </Button>
            ))}
          </>
        }
      />

      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Revenue"
          formattedValue={formatCurrency(data.kpis.revenue.value)}
          trendPercent={data.kpis.revenue.trendPercent}
          higherIsBetter
        />
        <MetricCard
          label="Expenses"
          formattedValue={formatCurrency(data.kpis.expenses.value)}
          trendPercent={data.kpis.expenses.trendPercent}
          higherIsBetter={false}
        />
        <MetricCard
          label="Net Profit"
          formattedValue={formatCurrency(data.kpis.netProfit.value)}
          trendPercent={data.kpis.netProfit.trendPercent}
          higherIsBetter
        />
        <MetricCard
          label="Cash Position"
          formattedValue={formatCurrency(data.kpis.cashPosition.value)}
          trendPercent={data.kpis.cashPosition.trendPercent}
          higherIsBetter
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Revenue and expenses"
          description="Trailing performance with net result overlaid"
          className="xl:col-span-2"
        >
          <PerformanceChart data={monthlySeries} />
        </SectionCard>

        <SectionCard
          title="Cash position"
          description="Across all bank accounts"
          className="flex flex-col"
        >
          <div className="flex flex-col gap-5">
            <FigureBlock
              label="Net position"
              value={formatCurrency(data.kpis.cashPosition.value)}
              hint="Cumulative from posted bank movements"
              tone="positive"
            />
            <dl className="flex flex-col gap-3 border-t border-border pt-4">
              {[
                {
                  label: 'Received this month',
                  value: data.monthlyFinancials[data.monthlyFinancials.length - 1]?.cashIn ?? 0,
                },
                {
                  label: 'Paid this month',
                  value: -(data.monthlyFinancials[data.monthlyFinancials.length - 1]?.cashOut ?? 0),
                },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4">
                  <dt className="text-sm text-muted-foreground">{row.label}</dt>
                  <dd>
                    <Amount value={row.value} className="text-sm" />
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Quick actions
              </p>
              <div className="flex flex-wrap gap-2">
                {quickActions.map((action) => (
                  <Button
                    key={action.label}
                    render={<Link to={action.href} />}
                    nativeButton={false}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    <action.icon data-icon="inline-start" />
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <section
        aria-label="Secondary indicators"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <MetricCard label="Accounts Receivable" formattedValue={formatCurrency(data.arAging.total)} />
        <MetricCard label="Accounts Payable" formattedValue={formatCurrency(data.apAging.total)} />
        <MetricCard label="Inventory Valuation" formattedValue={formatCurrency(data.inventoryValuation)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Receivables ageing"
          description="What customers owe, by age"
          actions={
            <Button
              render={<Link to="/sales/invoices" />}
              nativeButton={false}
              variant="ghost"
              size="sm"
              className="text-xs"
            >
              View invoices
              <ArrowUpRight data-icon="inline-end" />
            </Button>
          }
        >
          <AgeingPanel buckets={arBuckets} emptyLabel="No outstanding customer invoices." />
        </SectionCard>

        <SectionCard
          title="Payables ageing"
          description="What the business owes suppliers"
          actions={
            <Button
              render={<Link to="/purchases/vendors" />}
              nativeButton={false}
              variant="ghost"
              size="sm"
              className="text-xs"
            >
              View suppliers
              <ArrowUpRight data-icon="inline-end" />
            </Button>
          }
        >
          <AgeingPanel buckets={apBuckets} emptyLabel="No outstanding supplier invoices." />
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Cash movement"
          description="Money in against money out, last six months"
          className="xl:col-span-2"
        >
          <CashFlowChart data={monthlySeries} />
        </SectionCard>

        <SectionCard title="Expense mix" description={`Operating expenses, ${CURRENT_PERIOD_LABEL}`}>
          <p className="py-6 text-center text-sm text-muted-foreground">
            Expense category breakdown isn&apos;t available yet — this app
            doesn&apos;t track expense categories separately from the
            general ledger account.
          </p>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Recent activity"
          description="Latest customer, supplier and product changes"
          className="xl:col-span-2"
          bodyClassName="px-5 py-1"
        >
          <ActivityFeed items={data.activity} />
        </SectionCard>

        <SectionCard title="Revenue by customer" description="Not available yet">
          <p className="py-6 text-center text-sm text-muted-foreground">
            Per-customer revenue breakdown isn&apos;t available yet.
          </p>
        </SectionCard>
      </div>
    </>
  );
}
