import { useCallback, useEffect, useState } from 'react';
import { customerService } from '@/features/customers/services/customerService';
import { supplierService } from '@/features/suppliers/services/supplierService';
import { productService } from '@/features/inventory/services/productService';
import { stockService } from '@/features/inventory/services/stockService';
import { calculateArAgingForCustomers } from '../utils/calculateArAging';
import { calculateApAgingForSuppliers } from '../utils/calculateApAging';
import { calculateDashboardKpis, type DashboardKpis } from '../utils/calculateKpis';
import { calculateCashFlowSeries, type CashFlowPoint } from '../utils/calculateCashFlow';
import { buildRecentActivity, type ActivityItem } from '../utils/buildRecentActivity';
import { mockMonthlyFinancials, type MonthlyFinancials } from '../mock-data/financials';
import type { FleetAgingBuckets } from '../types/aging.types';

export interface DashboardData {
  kpis: DashboardKpis;
  arAging: FleetAgingBuckets;
  apAging: FleetAgingBuckets;
  inventoryValuation: number;
  activity: ActivityItem[];
  monthlyFinancials: MonthlyFinancials[];
  cashFlowSeries: CashFlowPoint[];
  /** False when there is no real business data at all (no customers, suppliers, products, or activity) — drives the page's empty state. */
  hasAnyData: boolean;
}

export interface UseDashboardDataResult {
  data: DashboardData | null;
  loading: boolean;
  error: Error | null;
  /** Re-runs every fetch — call after data changes elsewhere in the app. */
  refetch: () => void;
}

/**
 * Component -> Hook -> Service chain (docs/ARCHITECTURE.md) for the
 * Executive Dashboard. Fetches real customer/supplier/product data from
 * their own feature services, then routes every derived figure through a
 * dashboard-owned util (never computed inline here or in JSX, per
 * docs/DO_NOT_BREAK.md) — aging aggregation, KPI trends, cash-flow
 * series, and the recent-activity feed.
 */
export function useDashboardData(): UseDashboardDataResult {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      customerService.getCustomers(),
      supplierService.getSuppliers(),
      productService.getProducts(),
      stockService.calculateTotalValuation(),
    ])
      .then(([customers, suppliers, products, inventoryValuation]) => {
        if (cancelled) return;

        const arAging = calculateArAgingForCustomers(customers);
        const apAging = calculateApAgingForSuppliers(suppliers);
        const activity = buildRecentActivity(customers, suppliers, products);

        setData({
          kpis: calculateDashboardKpis(mockMonthlyFinancials),
          arAging,
          apAging,
          inventoryValuation,
          activity,
          monthlyFinancials: mockMonthlyFinancials,
          cashFlowSeries: calculateCashFlowSeries(mockMonthlyFinancials),
          hasAnyData: arAging.total > 0 || apAging.total > 0 || inventoryValuation > 0 || activity.length > 0,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load dashboard data'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { data, loading, error, refetch };
}
