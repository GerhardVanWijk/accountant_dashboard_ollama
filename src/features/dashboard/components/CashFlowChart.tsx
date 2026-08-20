import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CurrencyCode } from '@/types';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/utils/formatCurrency';
import type { CashFlowPoint } from '../utils/calculateCashFlow';

export interface CashFlowChartProps {
  data: CashFlowPoint[];
  currency: CurrencyCode;
}

/**
 * Cumulative Cash Position trajectory (Recharts). `data` is the
 * already-computed output of ../utils/calculateCashFlow.ts — never
 * derived inline here, per docs/DO_NOT_BREAK.md. Colors reference design
 * token CSS custom properties (docs/DESIGN_SYSTEM.md), not hardcoded hex.
 */
export function CashFlowChart({ data, currency }: CashFlowChartProps) {
  return (
    <Card>
      <h3 className="mb-md text-base font-semibold text-text-primary">Cash Flow</h3>
      <div className="w-full overflow-x-auto">
        <div className="h-64 min-w-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="dashboardCashFlowFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-info)" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="var(--color-info)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
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
              <Area
                type="monotone"
                dataKey="cumulativeCash"
                name="Cash Position"
                stroke="var(--color-info)"
                strokeWidth={2}
                fill="url(#dashboardCashFlowFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
