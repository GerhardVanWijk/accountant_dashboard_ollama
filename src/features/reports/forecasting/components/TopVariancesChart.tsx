import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/shadcn/chart';
import { formatCurrency, formatCurrencyCompact } from '@/lib/app/format';
import type { ForecastAccountRow } from '../services';

const config = {
  variance: { label: 'Variance' },
} satisfies ChartConfig;

/**
 * The largest favourable and unfavourable variances (by absolute value),
 * restricted to accounts where "favourable" is a meaningful judgement
 * (revenue/expense — see `isVarianceFavourable`). Green = favourable, red =
 * unfavourable — no other account gets a bar here, since there is no
 * defensible favourable/unfavourable call for asset/liability/equity.
 */
export function TopVariancesChart({ rows, count = 5 }: { rows: ForecastAccountRow[]; count?: number }) {
  const judged = rows.filter((r) => r.favourable !== null && r.variance !== 0);
  const top = judged
    .slice()
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
    .slice(0, count)
    .map((r) => ({ name: `${r.code} ${r.name}`, variance: r.variance, favourable: r.favourable }))
    .reverse(); // largest at the top of a horizontal bar chart

  if (top.length === 0) {
    return <p className="text-sm text-muted-foreground">No variances to show for this range.</p>;
  }

  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <BarChart data={top} layout="vertical" margin={{ left: 4, right: 12, top: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCurrencyCompact(v)} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={160} tick={{ fontSize: 11 }} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />} />
        <Bar dataKey="variance" radius={4}>
          {top.map((entry) => (
            <Cell key={entry.name} fill={entry.favourable ? 'var(--color-text-positive)' : 'var(--color-text-negative)'} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
