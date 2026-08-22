import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CurrencyCode } from '@/types';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/utils/formatCurrency';
import type { MonthlyFinancials } from '../utils/calculateMonthlyFinancials';

export interface RevenueExpensesChartProps {
  data: MonthlyFinancials[];
  currency: CurrencyCode;
}

/**
 * Revenue vs Expenses over time (Recharts). Colors reference the design
 * token CSS custom properties (docs/DESIGN_SYSTEM.md) rather than
 * hardcoded hex, so the chart follows dark/light theme changes
 * automatically. The chart lives in its own horizontally-scrollable
 * container so it never forces the page itself to scroll on narrow
 * viewports.
 */
export function RevenueExpensesChart({ data, currency }: RevenueExpensesChartProps) {
  return (
    <Card>
      <h3 className="mb-md text-base font-semibold text-text-primary">Revenue vs Expenses</h3>
      <div className="w-full overflow-x-auto">
        <div className="h-64 min-w-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" stroke="var(--color-text-secondary)" fontSize={12} tickLine={false} />
              <YAxis
                stroke="var(--color-text-secondary)"
                fontSize={12}
                tickLine={false}
                width={72}
                tickFormatter={(value: number) => formatCurrency(value, currency, 'en-US').replace(/\.00$/, '')}
              />
              <Tooltip
                formatter={(value: number) => formatCurrency(value, currency)}
                contentStyle={{
                  backgroundColor: 'var(--color-panel)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'var(--color-text-primary)' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="revenue" name="Revenue" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="var(--color-danger)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
