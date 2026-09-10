import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BanknoteIcon, BoxesIcon, CircleDollarSignIcon, Landmark, Loader2, PercentIcon, Plus, Receipt, ReceiptTextIcon, RotateCw, ScrollText, Settings2, TrendingUpIcon, WalletCardsIcon } from 'lucide-react';

import { ActivityFeed } from '@/components/app/dashboard/activity-feed';
import { AgeingPanel } from '@/components/app/dashboard/ageing-panel';
import { CashFlowChart, GrossMarginChart, PerformanceChart } from '@/components/app/dashboard/dashboard-charts';
import { Amount } from '@/components/app/figure';
import { StatStrip, StatTile } from '@/components/app/stat-tile';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { EnumSelect } from '@/components/app/combobox';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { useEntitlementStore } from '@/features/subscriptions/stores/entitlementStore';
import { formatCurrency } from '@/lib/app/format';
import { useDashboardData } from '../hooks/useDashboardData';
import { calculateDashboardV3Metrics } from '../utils/calculateDashboardV3Metrics';
import { filterMonthlyFinancialsByPeriod, resolveDashboardPeriod, type DashboardPeriodKey } from '../utils/dashboardPeriods';
import { toV0AgeingBuckets, toV0MonthlySeries } from '../utils/toV0DashboardView';

type WidgetId = 'profitability' | 'gross-margin' | 'cash-position' | 'cash-movement' | 'ar-aging' | 'ap-aging' | 'inventory' | 'stock-margin' | 'needs-attention' | 'recent-activity';

const defaultWidgetOrder: WidgetId[] = ['profitability', 'gross-margin', 'cash-position', 'cash-movement', 'ar-aging', 'ap-aging', 'inventory', 'stock-margin', 'needs-attention'];
const optionalWidgets: WidgetId[] = ['recent-activity'];
const layoutKey = 'vertex.dashboard.layout.default';

const quickActions = [
  { label: 'New invoice', href: '/sales/invoices', icon: Plus },
  { label: 'Record expense', href: '/purchases/bills', icon: Receipt },
  { label: 'Reconcile bank', href: '/banking/reconciliation', icon: Landmark },
  { label: 'Post journal', href: '/accounting/journals', icon: ScrollText },
];

function formatPercent(value: number | null): string {
  return value === null ? 'N/A' : `${value.toFixed(1)}%`;
}

function loadLayout(): { order: WidgetId[]; hidden: WidgetId[] } {
  if (typeof localStorage === 'undefined') return { order: defaultWidgetOrder, hidden: optionalWidgets };
  try {
    const parsed = JSON.parse(localStorage.getItem(layoutKey) ?? '{}') as Partial<{ order: WidgetId[]; hidden: WidgetId[] }>;
    return { order: parsed.order ?? defaultWidgetOrder, hidden: parsed.hidden ?? optionalWidgets };
  } catch {
    return { order: defaultWidgetOrder, hidden: optionalWidgets };
  }
}

function WidgetFrame({ children, span = 'half' }: { children: ReactNode; span?: 'full' | 'half' | 'third' }) {
  const className = span === 'full' ? 'lg:col-span-2 xl:col-span-3' : span === 'third' ? 'xl:col-span-1' : 'xl:col-span-1';
  return <div className={className}>{children}</div>;
}

export function DashboardPage() {
  const { data, loading, error, refetch, lastUpdated } = useDashboardData();
  const [periodKey, setPeriodKey] = useState<DashboardPeriodKey>('12m');
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState(loadLayout);
  const canInventory = useCanAccess('inventory', 'read');
  const entitlements = useEntitlementStore((s) => s.entitlements);
  const hasInventoryEntitlement = entitlements.size === 0 || entitlements.has('inventory');

  useEffect(() => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(layoutKey, JSON.stringify(layout));
  }, [layout]);

  const period = useMemo(() => resolveDashboardPeriod(periodKey), [periodKey]);
  const visibleMonths = useMemo(() => filterMonthlyFinancialsByPeriod(data?.monthlyFinancials ?? [], period), [data?.monthlyFinancials, period]);
  const metrics = useMemo(() => calculateDashboardV3Metrics(visibleMonths), [visibleMonths]);

  if (loading) {
    return <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground"><Loader2 className="size-5 animate-spin" aria-hidden="true" /><p className="text-sm">Loading dashboard...</p></div>;
  }
  if (error) {
    return <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center"><p className="text-sm text-destructive">{error.message}</p><Button variant="outline" size="sm" onClick={refetch}>Try again</Button></div>;
  }
  if (!data || !data.hasAnyData) {
    return <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center"><p className="text-sm font-medium">Nothing to show yet</p><p className="max-w-sm text-sm text-muted-foreground">Add customers, suppliers, or products to see live metrics here.</p></div>;
  }

  const monthlySeries = toV0MonthlySeries(visibleMonths);
  const fullMonthlySeries = toV0MonthlySeries(data.monthlyFinancials);
  const arBuckets = toV0AgeingBuckets(data.arAging);
  const apBuckets = toV0AgeingBuckets(data.apAging);
  const inventoryAllowed = canInventory && hasInventoryEntitlement;
  const available = new Set<WidgetId>(['profitability', 'gross-margin', 'cash-position', 'cash-movement', 'ar-aging', 'ap-aging', 'needs-attention', ...(inventoryAllowed ? (['inventory', 'stock-margin'] as WidgetId[]) : []), ...(data.activity.length ? (['recent-activity'] as WidgetId[]) : [])]);
  const ordered = [...layout.order, ...defaultWidgetOrder, ...optionalWidgets].filter((id, index, all) => all.indexOf(id) === index);
  const visibleWidgets = ordered.filter((id) => available.has(id) && !layout.hidden.includes(id));
  const attentionRows = [
    data.arAging.bucket90Plus > 0 ? { label: '90+ day receivables', value: data.arAging.bucket90Plus, href: '/sales/invoices' } : null,
    data.apAging.bucket90Plus > 0 ? { label: '90+ day payables', value: data.apAging.bucket90Plus, href: '/purchases/bills' } : null,
  ].filter(Boolean) as { label: string; value: number; href: string }[];

  function move(id: WidgetId, direction: -1 | 1) {
    setLayout((current) => {
      const currentOrder = [...current.order, ...defaultWidgetOrder, ...optionalWidgets].filter((w, index, all) => all.indexOf(w) === index);
      const from = currentOrder.indexOf(id);
      const to = Math.max(0, Math.min(currentOrder.length - 1, from + direction));
      currentOrder.splice(from, 1);
      currentOrder.splice(to, 0, id);
      return { ...current, order: currentOrder };
    });
  }

  function toggle(id: WidgetId, checked: boolean) {
    setLayout((current) => ({ ...current, hidden: checked ? current.hidden.filter((w) => w !== id) : [...new Set([...current.hidden, id])] }));
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Flow metrics for ${period.startDate} to ${period.endDate}; point-in-time figures are as at ${period.endDate}.`}
        actions={<><EnumSelect aria-label="Dashboard period" value={periodKey} onValueChange={(value) => setPeriodKey(value as DashboardPeriodKey)} className="w-40" options={[{ value: '3m', label: '3 months' }, { value: '6m', label: '6 months' }, { value: '12m', label: '12 months' }, { value: 'financial-year', label: 'Financial year' }, { value: 'ytd', label: 'YTD' }]} /><Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}><Settings2 data-icon="inline-start" />Customize dashboard</Button><Button variant="outline" size="sm" onClick={refetch}><RotateCw data-icon="inline-start" />Refresh</Button></>}
      />
      <p className="text-xs text-muted-foreground">Last updated {lastUpdated ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'after refresh'}.</p>

      {editing ? (
        <SectionCard title="Dashboard widgets" description="Show, hide, and reorder visual widgets. Financial data is never stored here.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...defaultWidgetOrder, ...optionalWidgets].map((id) => (
              <div key={id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <label className="flex items-center gap-2 text-sm capitalize"><Checkbox checked={!layout.hidden.includes(id)} onCheckedChange={(checked) => toggle(id, checked === true)} />{id.replace(/-/g, ' ')}</label>
                <div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => move(id, -1)}>Up</Button><Button variant="ghost" size="sm" onClick={() => move(id, 1)}>Down</Button></div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setLayout({ order: defaultWidgetOrder, hidden: optionalWidgets })}>Reset to default</Button><Button size="sm" onClick={() => setEditing(false)}>Save layout</Button></div>
        </SectionCard>
      ) : null}

      <section aria-label="Key figures">
        <StatStrip columns={6}>
          <StatTile variant="compact" icon={ReceiptTextIcon} label="Revenue" value={formatCurrency(metrics.revenue)} trendPercent={data.kpis.revenue.trendPercent} hint="Flow for selected period" />
          <StatTile variant="compact" icon={TrendingUpIcon} label="Gross Profit" value={formatCurrency(metrics.grossProfit)} hint="Revenue less posted COGS" />
          <StatTile variant="compact" icon={WalletCardsIcon} label="Net Profit" value={formatCurrency(metrics.netProfit)} hint="After operating expenses" />
          <StatTile variant="compact" icon={BanknoteIcon} label="Cash Position" value={formatCurrency(data.kpis.cashPosition.value)} hint={`As at ${period.endDate}`} />
          <StatTile variant="compact" icon={PercentIcon} label="Gross Margin %" value={formatPercent(metrics.grossMarginPercent)} hint="Gross profit ÷ revenue" />
          <StatTile variant="compact" icon={PercentIcon} label="Net Margin %" value={formatPercent(metrics.netMarginPercent)} hint="Net profit ÷ revenue" />
        </StatStrip>
      </section>

      <div className="grid auto-rows-min gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {visibleWidgets.map((id) => {
          if (id === 'profitability') return <WidgetFrame key={id} span="full"><SectionCard title="Profitability trend" description="Revenue, gross profit, and net result"><PerformanceChart data={monthlySeries} /></SectionCard></WidgetFrame>;
          if (id === 'gross-margin') return <WidgetFrame key={id}><SectionCard title="Gross margin trend" description="Chart filter is local"><GrossMarginChart data={fullMonthlySeries} /></SectionCard></WidgetFrame>;
          if (id === 'cash-position') return <WidgetFrame key={id}><SectionCard title="Cash position" description={`As at ${period.endDate}`}><StatTile icon={BanknoteIcon} label="Net position" value={formatCurrency(data.kpis.cashPosition.value)} hint="Cumulative from posted bank movements" /><dl className="mt-5 flex flex-col gap-3 border-t border-border pt-4"><div className="flex justify-between gap-4"><dt className="text-sm text-muted-foreground">Cash in</dt><dd><Amount value={visibleMonths.reduce((s, m) => s + m.cashIn, 0)} className="text-sm" /></dd></div><div className="flex justify-between gap-4"><dt className="text-sm text-muted-foreground">Cash out</dt><dd><Amount value={-visibleMonths.reduce((s, m) => s + m.cashOut, 0)} className="text-sm" /></dd></div></dl></SectionCard></WidgetFrame>;
          if (id === 'cash-movement') return <WidgetFrame key={id}><SectionCard title="Cash movement" description="Cash in against cash out"><CashFlowChart data={fullMonthlySeries} /></SectionCard></WidgetFrame>;
          if (id === 'ar-aging') return <WidgetFrame key={id}><SectionCard title="Receivables ageing" description={`As at ${period.endDate}`} actions={<Button render={<Link to="/sales/invoices" />} nativeButton={false} variant="ghost" size="sm" className="text-xs">View invoices<ArrowUpRight data-icon="inline-end" /></Button>}><AgeingPanel buckets={arBuckets} emptyLabel="No outstanding customer invoices." /></SectionCard></WidgetFrame>;
          if (id === 'ap-aging') return <WidgetFrame key={id}><SectionCard title="Payables ageing" description={`As at ${period.endDate}`} actions={<Button render={<Link to="/purchases/vendors" />} nativeButton={false} variant="ghost" size="sm" className="text-xs">View suppliers<ArrowUpRight data-icon="inline-end" /></Button>}><AgeingPanel buckets={apBuckets} emptyLabel="No outstanding supplier invoices." /></SectionCard></WidgetFrame>;
          if (id === 'inventory') return <WidgetFrame key={id} span="third"><StatTile icon={BoxesIcon} label="Inventory Valuation" value={formatCurrency(data.inventoryValuation)} hint={`As at ${period.endDate}`} className="h-full" /></WidgetFrame>;
          if (id === 'stock-margin') return <WidgetFrame key={id}><SectionCard title="Realized stock margin" description="Posted sales less historical COGS"><StatStrip columns={2}><StatTile variant="compact" icon={PercentIcon} label="Margin" value={formatPercent(metrics.realizedStockMarginPercent)} hint="Not markup" /><StatTile variant="compact" icon={TrendingUpIcon} label="Gross profit" value={formatCurrency(metrics.grossProfit)} /><StatTile variant="compact" icon={ReceiptTextIcon} label="Net product sales" value={formatCurrency(metrics.revenue)} /><StatTile variant="compact" icon={CircleDollarSignIcon} label="Historical COGS" value={formatCurrency(metrics.cogs)} /></StatStrip><Button render={<Link to="/inventory/reports/margin-analysis" />} nativeButton={false} variant="ghost" size="sm" className="mt-4 text-xs">View theoretical margin<ArrowUpRight data-icon="inline-end" /></Button></SectionCard></WidgetFrame>;
          if (id === 'needs-attention') return <WidgetFrame key={id}><SectionCard title="Needs attention" description="Only actionable exceptions">{attentionRows.length ? <div className="flex flex-col divide-y divide-border">{attentionRows.map((row) => <Link key={row.label} to={row.href} className="flex items-center justify-between gap-4 py-3 text-sm"><span>{row.label}</span><Amount value={row.value} /></Link>)}</div> : <p className="py-4 text-sm text-muted-foreground">No overdue receivables or payables.</p>}</SectionCard></WidgetFrame>;
          if (id === 'recent-activity') return <WidgetFrame key={id}><SectionCard title="Recent activity" description="Compact operational changes" bodyClassName="px-5 py-1"><ActivityFeed items={data.activity.slice(0, 4)} /></SectionCard></WidgetFrame>;
          return null;
        })}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-5">
        {quickActions.map((action) => <Button key={action.label} render={<Link to={action.href} />} nativeButton={false} variant="outline" size="sm" className="text-xs"><action.icon data-icon="inline-start" />{action.label}</Button>)}
      </div>
    </>
  );
}
