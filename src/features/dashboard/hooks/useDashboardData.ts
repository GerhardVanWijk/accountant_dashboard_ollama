import { useCallback, useEffect, useState } from 'react';
import { customerService } from '@/features/customers/services/customerService';
import { supplierService } from '@/features/suppliers/services/supplierService';
import { productService } from '@/features/inventory/services/productService';
import { stockService } from '@/features/inventory/services/stockService';
import { invoiceService } from '@/services';
import { billService } from '@/features/purchases/services';
import { journalEntryService, accountService } from '@/features/accounting/services';
import { calculateArAgingForCustomers } from '../utils/calculateArAging';
import { calculateApAgingForSuppliers } from '../utils/calculateApAging';
import { calculateDashboardKpis, type DashboardKpis } from '../utils/calculateKpis';
import { calculateCashFlowSeries, type CashFlowPoint } from '../utils/calculateCashFlow';
import { buildRecentActivity, type ActivityItem } from '../utils/buildRecentActivity';
import { calculateMonthlyFinancials, trailingMonthKeys, type MonthlyFinancials } from '../utils/calculateMonthlyFinancials';
import type { FleetAgingBuckets } from '../types/aging.types';

/**
 * Trailing 12 months. Widened from 6 (M1, docs/V0_DASHBOARD_INTEGRATION.md)
 * so the ported v0 PerformanceChart's real 6/12-month toggle has genuine
 * data behind both options — calculateMonthlyFinancials only sums a wider
 * window of the same already-posted journal entries, no new calculation.
 */
const TRAILING_MONTHS = 12;

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
 * Executive Dashboard. Fetches real customer/supplier/product/GL data from
 * their own feature services, then routes every derived figure through a
 * dashboard-owned util (never computed inline here or in JSX, per
 * docs/DO_NOT_BREAK.md) — aging aggregation, monthly Revenue/Expenses/
 * Cash Flow from posted journal entries (calculateMonthlyFinancials —
 * previously a mock time series, fixed 2026-08-22 per docs/KNOWN_ISSUES.md),
 * KPI trends, cash-flow series, and the recent-activity feed.
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
      invoiceService.getInvoices(),
      billService.getBills(),
      journalEntryService.getEntries(),
      accountService.getAccounts(),
    ])
      .then(([customers, suppliers, products, inventoryValuation, invoices, bills, journalEntries, accounts]) => {
        if (cancelled) return;

        const arAging = calculateArAgingForCustomers(customers, invoices);
        const apAging = calculateApAgingForSuppliers(suppliers, bills);
        const activity = buildRecentActivity(customers, suppliers, products);
        const monthKeys = trailingMonthKeys(new Date(), TRAILING_MONTHS);
        const monthlyFinancials = calculateMonthlyFinancials(journalEntries, accounts, monthKeys);

        setData({
          kpis: calculateDashboardKpis(monthlyFinancials),
          arAging,
          apAging,
          inventoryValuation,
          activity,
          monthlyFinancials,
          cashFlowSeries: calculateCashFlowSeries(monthlyFinancials),
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
