import { Link } from 'react-router-dom';
import { SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { formatCurrency } from '@/lib/app/format';
import { InventoryReportShell, ReportSummaryCard } from '../../components/reports/InventoryReportShell';
import { useGoodsDeliveredNotInvoicedReconciliation } from '../../hooks/useGoodsDeliveredNotInvoicedReconciliation';
import type { DeliveryLineReconciliationRow } from '../../services/reconcileGoodsDeliveredNotInvoiced';

const fmtQty = (n: number) => n.toLocaleString('en-ZA', { maximumFractionDigits: 3 });

const EXPORT_COLUMNS: ExportColumn<DeliveryLineReconciliationRow>[] = [
  { key: 'deliveryNoteNumber', header: 'Delivery note', accessor: (r) => r.deliveryNoteNumber },
  { key: 'productName', header: 'Product', accessor: (r) => r.productName },
  { key: 'deliveredQty', header: 'Delivered qty', accessor: (r) => r.deliveredQty, align: 'right' },
  { key: 'invoicedQty', header: 'Invoiced qty', accessor: (r) => r.invoicedQty, align: 'right' },
  { key: 'outstandingQty', header: 'Outstanding qty', accessor: (r) => r.outstandingQty, align: 'right' },
  { key: 'frozenUnitCost', header: 'Frozen unit cost', accessor: (r) => r.frozenUnitCost, align: 'right' },
  { key: 'outstandingCost', header: 'Outstanding cost', accessor: (r) => r.outstandingCost, align: 'right' },
];

/**
 * "Goods Delivered Not Invoiced" reconciliation — route
 * `/inventory/reports/goods-delivered-not-invoiced` (Phase 5C, Part 20).
 * A specialist accounting-control report, deliberately NOT on the Inventory
 * Overview page (per the same "specialist reconciliations live under
 * Reports" convention `InventoryReconciliationReportPage` already
 * established) and deliberately SEPARATE from that report's own GL 1200
 * check — 1220 holds cost of goods already delivered, not stock on hand;
 * mixing the two would be accounting-incorrect (Part 19).
 */
export function GoodsDeliveredNotInvoicedReportPage() {
  const { result, loading, error, refetch } = useGoodsDeliveredNotInvoicedReconciliation();
  const canExport = useCanAccess('inventory', 'export');

  const rows = result?.rows ?? [];

  const exportDataset: ExportDataset<DeliveryLineReconciliationRow> = {
    title: 'Goods Delivered Not Invoiced Reconciliation',
    subtitle: result ? (result.isReconciled ? 'Reconciled' : `Difference ${formatCurrency(result.difference)}`) : undefined,
    columns: EXPORT_COLUMNS,
    rows,
    filename: `goods-delivered-not-invoiced-${new Date().toISOString().slice(0, 10)}`,
  };

  return (
    <InventoryReportShell
      title="Goods delivered not invoiced"
      description="Every posted Delivery Note line not yet fully invoiced, valued at its frozen delivery-time cost — must reconcile to GL 1220."
      loading={loading}
      error={error}
      onRetry={refetch}
      canExport={canExport}
      exportDataset={exportDataset}
      summary={
        result && (
          <ReportSummaryCard>
            <FigureBlock label="Outstanding delivered cost" value={formatCurrency(result.totalOutstandingCost)} />
            <FigureBlock label="GL 1220 — Goods Delivered Not Invoiced" value={formatCurrency(result.glBalance)} />
            <FigureBlock label="Difference" value={formatCurrency(result.difference)} />
            <FigureBlock label="Status" value={result.isReconciled ? 'Reconciled' : 'Investigate'} tone={result.isReconciled ? 'positive' : 'negative'} />
          </ReportSummaryCard>
        )
      }
    >
      <SectionCard title="Outstanding delivered lines" description="Delivered quantity minus invoiced quantity, per posted Delivery Note line.">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing outstanding — every posted delivery has been fully invoiced (or no Delivery Notes have posted yet).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="py-2 pr-3 font-medium">Delivery note</th>
                  <th className="py-2 pr-3 font-medium">Product</th>
                  <th className="py-2 pr-3 text-right font-medium">Delivered</th>
                  <th className="py-2 pr-3 text-right font-medium">Invoiced</th>
                  <th className="py-2 pr-3 text-right font-medium">Outstanding qty</th>
                  <th className="py-2 pr-3 text-right font-medium">Frozen unit cost</th>
                  <th className="py-2 text-right font-medium">Outstanding cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.deliveryNoteId}-${r.productId}-${i}`} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3">
                      <Link className="font-medium text-brand hover:underline" to={`/sales/delivery-notes/${r.deliveryNoteId}`}>
                        {r.deliveryNoteNumber}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{r.productName}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(r.deliveredQty)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(r.invoicedQty)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(r.outstandingQty)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(r.frozenUnitCost)}</td>
                    <td className="py-2 text-right tabular-nums">{formatCurrency(r.outstandingCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </InventoryReportShell>
  );
}
