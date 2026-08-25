import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
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
import { formatCurrencyCompact, formatCurrency } from '@/lib/app/format';

/**
 * Ported from accounting-v0-frontend/components/app/dashboard/dashboard-charts.tsx.
 * Only import paths changed (shadcn subfolder). View-model shapes
 * (MonthlySeriesPoint/BreakdownSlice) are defined locally here rather than
 * imported from v0's lib/app/types.ts (never ported — that file covers
 * every v0 module, not just the dashboard); the real data these charts
 * receive is mapped into these exact shapes by
 * src/features/dashboard/utils/toV0DashboardView.ts.
 */
export interface MonthlySeriesPoint {
  month: string;
  revenue: number;
  expenses: number;
  netResult: number;
  cashIn: number;
  cashOut: number;
}

export interface BreakdownSlice {
  label: string;
  amount: number;
}

const performanceConfig = {
  revenue: { label: 'Revenue', color: 'var(--chart-1)' },
  expenses: { label: 'Expenses', color: 'var(--chart-4)' },
  netResult: { label: 'Net result', color: 'var(--chart-2)' },
} satisfies ChartConfig;

const cashConfig = {
  cashIn: { label: 'Cash in', color: 'var(--chart-1)' },
  cashOut: { label: 'Cash out', color: 'var(--chart-4)' },
} satisfies ChartConfig;

/**
 * Revenue vs expenses over the trailing months, with the net result
 * overlaid so the margin trend reads at a glance.
 */
export function PerformanceChart({ data }: { data: MonthlySeriesPoint[] }) {
  const [range, setRange] = useState<'6' | '12'>('12');
  const visible = range === '6' ? data.slice(-6) : data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <ToggleGroup
          value={[range]}
          onValueChange={(value) => {
            const next = value[0];
            if (next === '6' || next === '12') setRange(next);
          }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem
            value="6"
            className="px-3 text-xs aria-pressed:bg-brand aria-pressed:text-brand-foreground"
          >
            6 months
          </ToggleGroupItem>
          <ToggleGroupItem
            value="12"
            className="px-3 text-xs aria-pressed:bg-brand aria-pressed:text-brand-foreground"
          >
            12 months
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <ChartContainer
        config={performanceConfig}
        className="aspect-auto h-[280px] w-full"
      >
        <AreaChart data={visible} margin={{ left: 4, right: 4, top: 8 }}>
          <defs>
            <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--color-revenue)"
                stopOpacity={0.35}
              />
              <stop
                offset="95%"
                stopColor="var(--color-revenue)"
                stopOpacity={0.02}
              />
            </linearGradient>
            <linearGradient id="fillExpenses" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--color-expenses)"
                stopOpacity={0.25}
              />
              <stop
                offset="95%"
                stopColor="var(--color-expenses)"
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            tickFormatter={(value: string) => value.split(' ')[0]}
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
          <Area
            dataKey="revenue"
            type="monotone"
            stroke="var(--color-revenue)"
            strokeWidth={2}
            fill="url(#fillRevenue)"
          />
          <Area
            dataKey="expenses"
            type="monotone"
            stroke="var(--color-expenses)"
            strokeWidth={2}
            fill="url(#fillExpenses)"
          />
          <Line
            dataKey="netResult"
            type="monotone"
            stroke="var(--color-netResult)"
            strokeWidth={2}
            dot={false}
          />
          <ChartLegend content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

/** Cash in against cash out — the movement behind the closing balance. */
export function CashFlowChart({ data }: { data: MonthlySeriesPoint[] }) {
  return (
    <ChartContainer config={cashConfig} className="aspect-auto h-[330px] w-full">
      <BarChart data={data.slice(-6)} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          tickFormatter={(value: string) => value.split(' ')[0]}
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
        <Bar dataKey="cashIn" fill="var(--color-cashIn)" radius={[4, 4, 0, 0]} />
        <Bar
          dataKey="cashOut"
          fill="var(--color-cashOut)"
          radius={[4, 4, 0, 0]}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}

const sliceColors = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--muted-foreground)',
];

/** Composition breakdown (e.g. expense mix) for a period. */
export function BreakdownChart({ data }: { data: BreakdownSlice[] }) {
  const config = data.reduce<ChartConfig>((acc, slice, index) => {
    acc[slice.label] = {
      label: slice.label,
      color: sliceColors[index % sliceColors.length],
    };
    return acc;
  }, {});

  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-[240px]">
      <PieChart>
        <ChartTooltip
          content={
            <ChartTooltipContent
              nameKey="label"
              formatter={(value) => formatCurrency(Number(value))}
            />
          }
        />
        <Pie
          data={data}
          dataKey="amount"
          nameKey="label"
          innerRadius={58}
          outerRadius={92}
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((slice, index) => (
            <Cell
              key={slice.label}
              fill={sliceColors[index % sliceColors.length]}
            />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
