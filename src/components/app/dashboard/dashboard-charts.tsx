import { useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';

import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/shadcn/chart';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/shadcn/toggle-group';
import { cn } from '@/lib/utils';
import { formatCurrency, formatCurrencyCompact } from '@/lib/app/format';

/**
 * Ported from accounting-v0-frontend/components/app/dashboard/dashboard-charts.tsx,
 * then hardened against the dataviz visual checks (2026-09-07,
 * dashboard-dataviz-hardening):
 *   - one validated, colour-blind-safe series palette (tokens.css --chart-*),
 *     coloured in both light and dark mode;
 *   - solid hairline gridlines (no dashed grid);
 *   - Revenue vs Expenses is the primary comparison; Net result is a
 *     separate diverging bar (positive above / negative below a zero
 *     baseline) rather than a third line at a different magnitude;
 *   - every chart carries a Chart / Table toggle over the *same* already
 *     loaded dataset — no extra fetch;
 *   - the time window is the dashboard's global period; charts hold no
 *     local range control of their own.
 *
 * View-model shapes are defined locally here (not imported from v0's
 * lib/app/types.ts, which was never ported); the real data is mapped into
 * `MonthlySeriesPoint` by src/features/dashboard/utils/toV0DashboardView.ts.
 */
export interface MonthlySeriesPoint {
  /** Short axis label for the month, e.g. "Aug". */
  month: string;
  revenue: number;
  grossProfit?: number;
  grossMarginPercent?: number | null;
  expenses: number;
  netResult: number;
  cashIn: number;
  cashOut: number;
}

type ChartView = 'chart' | 'table';

/** Shared solid hairline grid — recharts' default `#ccc` stroke is recoloured
 *  to `border/50` by the ChartContainer wrapper (see shadcn/chart.tsx). */
function HairlineGrid() {
  return <CartesianGrid vertical={false} />;
}

function ViewToggle({
  view,
  onChange,
}: {
  view: ChartView;
  onChange: (view: ChartView) => void;
}) {
  return (
    <ToggleGroup
      value={[view]}
      onValueChange={(value) => {
        const next = value[0];
        if (next === 'chart' || next === 'table') onChange(next);
      }}
      variant="outline"
      size="sm"
      aria-label="Chart or table view"
    >
      <ToggleGroupItem
        value="chart"
        className="px-3 text-xs aria-pressed:bg-brand aria-pressed:text-brand-foreground"
      >
        Chart
      </ToggleGroupItem>
      <ToggleGroupItem
        value="table"
        className="px-3 text-xs aria-pressed:bg-brand aria-pressed:text-brand-foreground"
      >
        Table
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

/** Chart / Table shell. The table is rendered from the identical dataset the
 *  chart uses — switching views never triggers a fetch. */
function ChartFrame({
  view,
  onView,
  table,
  children,
}: {
  view: ChartView;
  onView: (view: ChartView) => void;
  table: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <ViewToggle view={view} onChange={onView} />
      </div>
      {view === 'chart' ? children : table}
    </div>
  );
}

/** Compact numeric twin of a chart — exact values, keyboard reachable,
 *  usable on a narrow screen. Header cell 0 is the period, the rest are
 *  right-aligned figures. */
function SeriesTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr>
            {head.map((label, index) => (
              <th
                key={label}
                scope="col"
                className={cn(
                  'py-2 pr-3 font-medium text-muted-foreground',
                  index === 0 ? 'text-left' : 'text-right',
                )}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-t border-border">
              {row.map((cell, index) => (
                <td
                  key={`${row[0]}-${index}`}
                  className={cn(
                    'py-1.5 pr-3',
                    index === 0
                      ? 'text-left text-muted-foreground'
                      : 'text-right text-foreground',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const performanceConfig = {
  revenue: { label: 'Revenue', color: 'var(--chart-1)' },
  expenses: { label: 'Expenses', color: 'var(--chart-2)' },
} satisfies ChartConfig;

const netResultConfig = {
  netResult: { label: 'Net result', color: 'var(--series-positive)' },
} satisfies ChartConfig;

/**
 * Primary comparison: Revenue against Expenses, grouped columns over the
 * global period. Net result is shown directly below as its own diverging
 * bar — profit above the zero baseline, loss below — so a derived figure at
 * a different magnitude never rides on the same scale as the two it comes
 * from. No secondary Y axis.
 */
export function PerformanceChart({ data }: { data: MonthlySeriesPoint[] }) {
  const [view, setView] = useState<ChartView>('chart');

  const table = (
    <SeriesTable
      head={['Period', 'Revenue', 'Expenses', 'Net result']}
      rows={data.map((point) => [
        point.month,
        formatCurrency(point.revenue),
        formatCurrency(point.expenses),
        formatCurrency(point.netResult),
      ])}
    />
  );

  return (
    <ChartFrame view={view} onView={setView} table={table}>
      <div className="flex flex-col gap-6">
        <ChartContainer
          config={performanceConfig}
          className="aspect-auto h-[260px] w-full"
        >
          <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }} barGap={2}>
            <HairlineGrid />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={58}
              tickFormatter={(value: number) => formatCurrencyCompact(value)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => formatCurrency(Number(value))}
                />
              }
            />
            <Bar
              dataKey="revenue"
              fill="var(--color-revenue)"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            />
            <Bar
              dataKey="expenses"
              fill="var(--color-expenses)"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        </ChartContainer>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Net result
          </p>
          <ChartContainer
            config={netResultConfig}
            className="aspect-auto h-[132px] w-full"
          >
            <BarChart data={data} margin={{ left: 4, right: 4, top: 4 }}>
              <HairlineGrid />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={58}
                tickFormatter={(value: number) => formatCurrencyCompact(value)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => formatCurrency(Number(value))}
                  />
                }
              />
              {/* The zero baseline is the primary profit/loss cue; colour
                  (green above / red below) only reinforces it. */}
              <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
              <Bar dataKey="netResult" radius={2} maxBarSize={24}>
                {data.map((point) => (
                  <Cell
                    key={point.month}
                    fill={
                      point.netResult >= 0
                        ? 'var(--series-positive)'
                        : 'var(--series-negative)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      </div>
    </ChartFrame>
  );
}

const marginConfig = {
  grossMarginPercent: { label: 'Gross margin %', color: 'var(--chart-1)' },
} satisfies ChartConfig;

/** Gross profit as a percentage of revenue, month by month over the global
 *  period. Only the latest point is direct-labelled; the axis and tooltip
 *  carry the rest. */
export function GrossMarginChart({ data }: { data: MonthlySeriesPoint[] }) {
  const [view, setView] = useState<ChartView>('chart');
  const points = data.filter(
    (point) =>
      point.grossMarginPercent !== null &&
      point.grossMarginPercent !== undefined,
  );
  const latest = points[points.length - 1];

  const table = (
    <SeriesTable
      head={['Period', 'Gross margin %']}
      rows={points.map((point) => [
        point.month,
        `${Number(point.grossMarginPercent).toFixed(1)}%`,
      ])}
    />
  );

  return (
    <ChartFrame view={view} onView={setView} table={table}>
      {points.length > 0 ? (
        <ChartContainer
          config={marginConfig}
          className="aspect-auto h-[240px] w-full"
        >
          <LineChart data={points} margin={{ left: 4, right: 20, top: 12 }}>
            <HairlineGrid />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={48}
              tickFormatter={(value: number) => `${value.toFixed(0)}%`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => `${Number(value).toFixed(1)}%`}
                />
              }
            />
            <Line
              dataKey="grossMarginPercent"
              type="monotone"
              stroke="var(--color-grossMarginPercent)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            {latest ? (
              <ReferenceDot
                x={latest.month}
                y={Number(latest.grossMarginPercent)}
                r={4}
                fill="var(--color-grossMarginPercent)"
                stroke="var(--card)"
                strokeWidth={2}
                label={{
                  value: `${Number(latest.grossMarginPercent).toFixed(1)}%`,
                  position: 'top',
                  fill: 'var(--foreground)',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
            ) : null}
          </LineChart>
        </ChartContainer>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No margin trend for this range.
        </p>
      )}
    </ChartFrame>
  );
}

const cashConfig = {
  cashIn: { label: 'Cash in', color: 'var(--chart-1)' },
  cashOut: { label: 'Cash out', color: 'var(--chart-2)' },
} satisfies ChartConfig;

/** Cash in against cash out — grouped columns over the global period. Bars
 *  are capped so a 3-month window doesn't produce slabs, and a small gap
 *  keeps the pair visually distinct. */
export function CashFlowChart({ data }: { data: MonthlySeriesPoint[] }) {
  const [view, setView] = useState<ChartView>('chart');

  const table = (
    <SeriesTable
      head={['Period', 'Cash in', 'Cash out']}
      rows={data.map((point) => [
        point.month,
        formatCurrency(point.cashIn),
        formatCurrency(point.cashOut),
      ])}
    />
  );

  return (
    <ChartFrame view={view} onView={setView} table={table}>
      <ChartContainer
        config={cashConfig}
        className="aspect-auto h-[240px] w-full"
      >
        <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }} barGap={2}>
          <HairlineGrid />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={58}
            tickFormatter={(value: number) => formatCurrencyCompact(value)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => formatCurrency(Number(value))}
              />
            }
          />
          <Bar
            dataKey="cashIn"
            fill="var(--color-cashIn)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
          />
          <Bar
            dataKey="cashOut"
            fill="var(--color-cashOut)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
          />
          <ChartLegend content={<ChartLegendContent />} />
        </BarChart>
      </ChartContainer>
    </ChartFrame>
  );
}
