import { format } from 'date-fns';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LowStockAlertWidget } from '@/features/inventory/components/LowStockAlertWidget';
import { DASHBOARD_CURRENCY } from '../constants';
import { useDashboardData } from '../hooks/useDashboardData';
import { getGreeting } from '../utils/getGreeting';
import { KpiCard } from '../components/KpiCard';
import { RevenueExpensesChart } from '../components/RevenueExpensesChart';
import { CashFlowChart } from '../components/CashFlowChart';
import { AgingSummaryWidget } from '../components/AgingSummaryWidget';
import { RecentActivityFeed } from '../components/RecentActivityFeed';

/**
 * Executive Dashboard — the `/` landing route. Assembles KPI cards,
 * Revenue vs Expenses / Cash Flow charts, AR/AP aging widgets, stock
 * status, and a recent-activity feed. All data comes from
 * ../hooks/useDashboardData.ts; this page only renders loading/error/
 * empty/data states (docs/ARCHITECTURE.md § Component State) — it never
 * computes a financial total itself (docs/DO_NOT_BREAK.md).
 */
export function DashboardPage() {
  const { data, loading, error, refetch } = useDashboardData();

  return (
    <div className="flex flex-col gap-lg">
      <header>
        <h1 className="text-2xl font-semibold text-text-primary">{getGreeting()}</h1>
        <p className="mt-xs text-sm text-text-secondary">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
      </header>

      {loading && <Spinner label="Loading dashboard…" />}

      {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!loading && !error && data && !data.hasAnyData && (
        <EmptyState
          title="Nothing to show yet"
          message="Add customers, suppliers, or products to see live metrics here."
        />
      )}

      {!loading && !error && data && data.hasAnyData && (
        <>
          <section className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Revenue"
              value={data.kpis.revenue.value}
              trendPercent={data.kpis.revenue.trendPercent}
              currency={DASHBOARD_CURRENCY}
            />
            <KpiCard
              label="Expenses"
              value={data.kpis.expenses.value}
              trendPercent={data.kpis.expenses.trendPercent}
              currency={DASHBOARD_CURRENCY}
              positiveIsGood={false}
            />
            <KpiCard
              label="Net Profit"
              value={data.kpis.netProfit.value}
              trendPercent={data.kpis.netProfit.trendPercent}
              currency={DASHBOARD_CURRENCY}
            />
            <KpiCard
              label="Cash Position"
              value={data.kpis.cashPosition.value}
              trendPercent={data.kpis.cashPosition.trendPercent}
              currency={DASHBOARD_CURRENCY}
            />
          </section>

          <section className="grid grid-cols-1 gap-md lg:grid-cols-2">
            <RevenueExpensesChart data={data.monthlyFinancials} currency={DASHBOARD_CURRENCY} />
            <CashFlowChart data={data.cashFlowSeries} currency={DASHBOARD_CURRENCY} />
          </section>

          <section className="grid grid-cols-1 gap-md md:grid-cols-2 xl:grid-cols-4">
            <AgingSummaryWidget
              title="Accounts Receivable"
              icon="customers"
              buckets={data.arAging}
              currency={DASHBOARD_CURRENCY}
            />
            <AgingSummaryWidget
              title="Accounts Payable"
              icon="suppliers"
              buckets={data.apAging}
              currency={DASHBOARD_CURRENCY}
            />
            <KpiCard label="Inventory Valuation" value={data.inventoryValuation} currency={DASHBOARD_CURRENCY} />
            <LowStockAlertWidget />
          </section>

          <RecentActivityFeed items={data.activity} />
        </>
      )}
    </div>
  );
}
