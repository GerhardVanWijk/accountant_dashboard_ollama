import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/shadcn/chart';
import { formatCurrency, formatCurrencyCompact } from '@/lib/app/format';
import type { ForecastMonthlyPoint } from '../services';

const config = {
  budget: { label: 'Budget', color: 'var(--chart-1)' },
  forecast: { label: 'Forecast', color: 'var(--chart-2)' },
  actual: { label: 'Actual', color: 'var(--chart-4)' },
} satisfies ChartConfig;

/** Budget vs Forecast vs Actual, one line each, over the selected month range. */
export function ForecastTrendChart({ data, title }: { data: ForecastMonthlyPoint[]; title: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
        <LineChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} />
          <YAxis tickLine={false} axisLine={false} tickMargin={8} width={58} tickFormatter={(v: number) => formatCurrencyCompact(v)} />
          <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />} />
          <Line dataKey="budget" type="monotone" stroke="var(--color-budget)" strokeWidth={2} dot={false} />
          <Line dataKey="forecast" type="monotone" stroke="var(--color-forecast)" strokeWidth={2} strokeDasharray="4 3" dot={false} />
          <Line dataKey="actual" type="monotone" stroke="var(--color-actual)" strokeWidth={2} dot={false} />
          <ChartLegend content={<ChartLegendContent />} />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
