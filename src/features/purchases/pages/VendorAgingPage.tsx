import { useMemo, useState } from 'react';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { formatCurrency } from '@/utils/formatFinancial';
import { useBills } from '../hooks';
import { calculateAllVendorAging, type VendorAgingRow } from '../utils/calculateVendorAging';

type SortKey = 'supplier' | 'total';

/**
 * Vendor Aging report: real Bill data (via useBills) bucketed by
 * calculateAllVendorAging() into Current / 1-30 / 31-60 / 90+ days overdue,
 * one row per supplier with an outstanding balance. Supplier names come
 * from the Suppliers module's own useSuppliers() hook — the same data
 * source src/features/suppliers already uses — rather than a second
 * supplier lookup being invented here. This supersedes Suppliers' own
 * (temporary, mock) per-supplier aging card on SupplierDetailPage now that
 * real Bill records with due dates exist (see docs/KNOWN_ISSUES.md).
 */
export function VendorAgingPage() {
  const { bills, isLoading, error } = useBills();
  const { suppliers } = useSuppliers();
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDesc, setSortDesc] = useState(true);

  const suppliersMap = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);

  const rows = useMemo(() => calculateAllVendorAging(bills), [bills]);

  const sortedRows = useMemo(() => {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sortKey === 'supplier') {
        const nameA = suppliersMap[a.supplierId] || a.supplierId;
        const nameB = suppliersMap[b.supplierId] || b.supplierId;
        const comparison = nameA.localeCompare(nameB);
        return sortDesc ? -comparison : comparison;
      }
      const comparison = a.buckets.total - b.buckets.total;
      return sortDesc ? -comparison : comparison;
    });
    return sorted;
  }, [rows, sortKey, sortDesc, suppliersMap]);

  const totals = sortedRows.reduce(
    (acc, row) => ({
      current: acc.current + row.buckets.current,
      days30: acc.days30 + row.buckets.days30,
      days60: acc.days60 + row.buckets.days60,
      days90Plus: acc.days90Plus + row.buckets.days90Plus,
      total: acc.total + row.buckets.total,
    }),
    { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 },
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc(!sortDesc);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center text-text-muted">Loading vendor aging...</div>;
  }

  if (error) {
    return <div className="p-8 text-danger">{error.message}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Vendor Aging</h1>
      </div>

      {/* Header Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Suppliers with Balance</div>
          <div className="text-2xl font-semibold">{sortedRows.length}</div>
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Total Payable</div>
          <FinancialNumber value={totals.total} format={formatCurrency} className="text-2xl font-semibold" />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">Current</div>
          <FinancialNumber
            value={totals.current}
            format={formatCurrency}
            className="text-2xl font-semibold"
            showFlash={false}
          />
        </div>
        <div className="bg-panel p-4 rounded-lg border border-border">
          <div className="text-xs text-text-muted mb-2">90+ Days Overdue</div>
          <FinancialNumber
            value={totals.days90Plus}
            format={formatCurrency}
            className="text-2xl font-semibold text-negative"
            showFlash={false}
          />
        </div>
      </div>

      {sortedRows.length === 0 ? (
        <div className="p-8 text-center text-text-muted bg-panel rounded-lg border border-border">
          No outstanding supplier balances
        </div>
      ) : (
        <div className="bg-panel rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[2fr_120px_120px_120px_120px_120px] gap-3 px-4 py-3 bg-primary/10 border-b border-border font-semibold text-sm sticky top-0 tabular-nums">
            <FinancialTableCell type="label">
              <button onClick={() => toggleSort('supplier')} className="hover:text-primary">
                Supplier {sortKey === 'supplier' && (sortDesc ? '↓' : '↑')}
              </button>
            </FinancialTableCell>
            <FinancialTableCell type="number">Current</FinancialTableCell>
            <FinancialTableCell type="number">1-30 Days</FinancialTableCell>
            <FinancialTableCell type="number">31-60 Days</FinancialTableCell>
            <FinancialTableCell type="number">90+ Days</FinancialTableCell>
            <FinancialTableCell type="number">
              <button onClick={() => toggleSort('total')} className="hover:text-primary">
                Total {sortKey === 'total' && (sortDesc ? '↓' : '↑')}
              </button>
            </FinancialTableCell>
          </div>

          {sortedRows.map((row: VendorAgingRow) => (
            <div
              key={row.supplierId}
              className="grid grid-cols-[2fr_120px_120px_120px_120px_120px] gap-3 px-4 py-3 border-b border-border/50 tabular-nums"
            >
              <FinancialTableCell type="label" className="font-medium">
                {suppliersMap[row.supplierId] || row.supplierId}
              </FinancialTableCell>
              <FinancialTableCell type="number">
                <FinancialNumber value={row.buckets.current} format={formatCurrency} showFlash={false} />
              </FinancialTableCell>
              <FinancialTableCell type="number">
                <FinancialNumber
                  value={row.buckets.days30}
                  format={formatCurrency}
                  showFlash={false}
                  className={row.buckets.days30 > 0 ? 'text-warning-financial' : undefined}
                />
              </FinancialTableCell>
              <FinancialTableCell type="number">
                <FinancialNumber
                  value={row.buckets.days60}
                  format={formatCurrency}
                  showFlash={false}
                  className={row.buckets.days60 > 0 ? 'text-warning-financial' : undefined}
                />
              </FinancialTableCell>
              <FinancialTableCell type="number">
                <FinancialNumber
                  value={row.buckets.days90Plus}
                  format={formatCurrency}
                  showFlash={false}
                  className={row.buckets.days90Plus > 0 ? 'text-negative' : undefined}
                />
              </FinancialTableCell>
              <FinancialTableCell type="number" className="font-semibold">
                <FinancialNumber value={row.buckets.total} format={formatCurrency} showFlash={false} />
              </FinancialTableCell>
            </div>
          ))}

          {/* Totals */}
          <div className="grid grid-cols-[2fr_120px_120px_120px_120px_120px] gap-3 px-4 py-3 bg-background border-t-2 border-border font-bold tabular-nums">
            <div className="px-2 py-2 text-sm text-left">TOTAL</div>
            <div className="px-2 py-2 text-sm text-right">
              <FinancialNumber value={totals.current} format={formatCurrency} />
            </div>
            <div className="px-2 py-2 text-sm text-right">
              <FinancialNumber value={totals.days30} format={formatCurrency} />
            </div>
            <div className="px-2 py-2 text-sm text-right">
              <FinancialNumber value={totals.days60} format={formatCurrency} />
            </div>
            <div className="px-2 py-2 text-sm text-right">
              <FinancialNumber value={totals.days90Plus} format={formatCurrency} />
            </div>
            <div className="px-2 py-2 text-sm text-right">
              <FinancialNumber value={totals.total} format={formatCurrency} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
