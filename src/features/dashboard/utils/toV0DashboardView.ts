import type { MonthlyFinancials } from './calculateMonthlyFinancials';
import { calculateNetProfit } from './calculateKpis';
import type { FleetAgingBuckets } from '../types/aging.types';
import type { MonthlySeriesPoint } from '@/components/app/dashboard/dashboard-charts';
import type { AgeingBucketView } from '@/components/app/dashboard/ageing-panel';

/**
 * Phase M1 (docs/V0_DASHBOARD_INTEGRATION.md): pure shape-mapping from this
 * app's real dashboard data (src/features/dashboard/hooks/useDashboardData.ts)
 * to the ported v0 dashboard components' view-model shapes. Every value
 * here already exists on the real data or is read from the existing
 * accounting/business-logic layer (calculateKpis.ts's calculateNetProfit)
 * — nothing is computed here, per docs/DO_NOT_BREAK.md.
 */
export function toV0MonthlySeries(months: MonthlyFinancials[]): MonthlySeriesPoint[] {
  return months.map((m) => ({
    month: m.label,
    revenue: m.revenue,
    expenses: m.expenses,
    netResult: calculateNetProfit(m),
    cashIn: m.cashIn,
    cashOut: m.cashOut,
  }));
}

/**
 * FleetAgingBuckets -> the 4-row shape ageing-panel.tsx renders. No
 * invoiceCount field — see ageing-panel.tsx's doc comment for why that
 * v0 detail is genuinely unavailable, not omitted for convenience.
 */
export function toV0AgeingBuckets(fleet: FleetAgingBuckets): AgeingBucketView[] {
  return [
    { bucket: 'Current', amount: fleet.current },
    { bucket: '30 days', amount: fleet.bucket30 },
    { bucket: '60 days', amount: fleet.bucket60 },
    { bucket: '90+ days', amount: fleet.bucket90Plus },
  ];
}
