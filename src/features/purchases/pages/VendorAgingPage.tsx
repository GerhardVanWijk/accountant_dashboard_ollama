import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/shadcn/empty';
import { formatCurrency } from '@/lib/app/format';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useBills } from '../hooks';
import { calculateAllVendorAging, type VendorAgingRow } from '../utils/calculateVendorAging';

type SortKey = 'supplier' | 'total';

/**
 * Vendor Aging report — route `/purchases/aging`. Real Bill data (via
 * useBills) bucketed by `calculateAllVendorAging()` into Current/1-30/
 * 31-60/90+ days overdue, one row per supplier with an outstanding
 * balance — the same aging function unchanged from before the port.
 * Re-skinned onto v0's PageHeader/SectionCard (M8); no aging math lives
 * in this component.
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

  function SortIcon({ active }: { active: boolean }) {
    if (!active) return null;
    const Icon = sortDesc ? ArrowDown : ArrowUp;
    return <Icon className="inline size-3.5" aria-hidden="true" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Vendor Aging" description="Outstanding supplier balances bucketed by how overdue they are." />

      {isLoading && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <span className="text-sm">Loading vendor aging…</span>
        </div>
      )}
      {!isLoading && error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}

      {!isLoading && !error && (
        <>
          <SectionCard>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <FigureBlock label="Suppliers with balance" value={String(sortedRows.length)} />
              <FigureBlock label="Total payable" value={formatCurrency(totals.total)} />
              <FigureBlock label="Current" value={formatCurrency(totals.current)} />
              <FigureBlock label="90+ days overdue" value={formatCurrency(totals.days90Plus)} tone={totals.days90Plus > 0 ? 'negative' : 'default'} />
            </div>
          </SectionCard>

          <SectionCard>
            {sortedRows.length === 0 ? (
              <Empty>
                <EmptyTitle>No outstanding supplier balances</EmptyTitle>
                <EmptyDescription>Every posted bill has been paid in full.</EmptyDescription>
              </Empty>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">
                        <button type="button" onClick={() => toggleSort('supplier')} className="inline-flex items-center gap-1 hover:text-foreground">
                          Supplier <SortIcon active={sortKey === 'supplier'} />
                        </button>
                      </th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Current</th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">1-30 Days</th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">31-60 Days</th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">90+ Days</th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">
                        <button type="button" onClick={() => toggleSort('total')} className="inline-flex items-center gap-1 hover:text-foreground">
                          Total <SortIcon active={sortKey === 'total'} />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row: VendorAgingRow) => (
                      <tr key={row.supplierId} className="border-t border-border">
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium">{suppliersMap[row.supplierId] || row.supplierId}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <Amount value={row.buckets.current} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <Amount value={row.buckets.days30} className={row.buckets.days30 > 0 ? 'text-warning' : undefined} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <Amount value={row.buckets.days60} className={row.buckets.days60 > 0 ? 'text-warning' : undefined} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <Amount value={row.buckets.days90Plus} className={row.buckets.days90Plus > 0 ? 'text-destructive' : undefined} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">
                          <Amount value={row.buckets.total} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="whitespace-nowrap px-4 py-2.5">Total</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <Amount value={totals.current} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <Amount value={totals.days30} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <Amount value={totals.days60} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <Amount value={totals.days90Plus} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <Amount value={totals.total} />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
