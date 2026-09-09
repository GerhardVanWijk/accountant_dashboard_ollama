import { useMemo } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import { SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { formatCurrency } from '@/lib/app/format';
import { cn } from '@/lib/utils';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCreditNotes } from '@/features/sales/hooks/useCreditNotes';
import { useDeliveryNotes } from '@/features/sales/hooks/useDeliveryNotes';
import { useBills } from '@/features/purchases/hooks/useBills';
import { usePurchaseOrders } from '@/features/purchases/hooks/usePurchaseOrders';
import { InventoryReportShell, ReportSummaryCard } from '../../components/reports/InventoryReportShell';
import { useInventoryReconciliation } from '../../hooks/useInventoryReconciliation';
import { useStockAdjustments } from '../../hooks/useStockAdjustments';
import { useStockTransfers } from '../../hooks/useStockTransfers';
import { useStockTakes } from '../../hooks/useStockTakes';
import { useSupplierReturns } from '../../hooks/useSupplierReturns';
import { useOpeningStockBatches } from '../../hooks/useOpeningStockBatches';
import { buildKnownDocumentRefs } from '../../services/knownDocumentRefs';
import type { InventoryReconciliationFinding } from '../../services/reconcileInventory';

const FINDING_EXPORT_COLUMNS: ExportColumn<InventoryReconciliationFinding>[] = [
  { key: 'code', header: 'Check', accessor: (f) => f.code },
  { key: 'severity', header: 'Severity', accessor: (f) => f.severity },
  { key: 'productSku', header: 'SKU', accessor: (f) => f.productSku ?? null },
  { key: 'warehouseId', header: 'Warehouse', accessor: (f) => f.warehouseId ?? null },
  { key: 'expected', header: 'Expected', accessor: (f) => f.expected, align: 'right' },
  { key: 'actual', header: 'Actual', accessor: (f) => f.actual, align: 'right' },
  { key: 'difference', header: 'Difference', accessor: (f) => f.difference, align: 'right' },
  { key: 'toleranceBound', header: 'Tolerance Bound', accessor: (f) => f.toleranceBound ?? null, align: 'right' },
  { key: 'detail', header: 'Detail', accessor: (f) => f.detail },
];

const SEVERITY_STYLE: Record<InventoryReconciliationFinding['severity'], string> = {
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  info: 'border-border bg-muted/40 text-muted-foreground',
};

function SectionBlock({ title, findings }: { title: string; findings: InventoryReconciliationFinding[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {findings.length === 0 ? (
        <p className="text-xs text-muted-foreground">No findings for this check.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {findings.map((f, i) => (
            <li key={`${f.code}-${i}`} className={cn('flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs', SEVERITY_STYLE[f.severity])}>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <AlertTriangleIcon className="size-3.5 shrink-0" aria-hidden="true" />
                {f.code.replace(/_/g, ' ')}
                {f.productSku ? ` — ${f.productSku}` : ''}
              </span>
              <span className="leading-relaxed opacity-90">{f.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Inventory Reconciliation report — route `/inventory/reports/reconciliation`
 * (spec §11). A full report surface over `reconcileInventory()`, sectioned
 * exactly per the spec (A Quantity Control, B Compatibility, C Valuation, D
 * Transit, E Total Control, F Evidence, G Rounding) — not merely the
 * Overview page's green/red card, though it reuses the SAME engine result
 * (`useInventoryReconciliation()`), never reproducing the math (spec: "Do
 * not reproduce reconciliation math in the page").
 *
 * Section F (movement source-evidence completeness) runs against the set of
 * references that resolve to a real posted document, built here from the
 * loaded invoices / bills / credit notes / adjustments / transfers / stock
 * takes / supplier returns / opening-stock batches / delivery notes.
 */
export function InventoryReconciliationReportPage() {
  const { invoices } = useInvoices();
  const { bills } = useBills();
  const { creditNotes } = useCreditNotes();
  const { purchaseOrders } = usePurchaseOrders();
  const { adjustments } = useStockAdjustments();
  const { transfers } = useStockTransfers();
  const { stockTakes } = useStockTakes();
  const { supplierReturns } = useSupplierReturns();
  const { batches } = useOpeningStockBatches();
  const { deliveryNotes } = useDeliveryNotes();

  const knownDocumentRefs = useMemo(
    () =>
      buildKnownDocumentRefs({
        invoices,
        bills,
        creditNotes,
        purchaseOrders,
        adjustments,
        transfers,
        stockTakes,
        supplierReturns,
        openingStockBatches: batches,
        deliveryNotes,
      }),
    [invoices, bills, creditNotes, purchaseOrders, adjustments, transfers, stockTakes, supplierReturns, batches, deliveryNotes],
  );

  const { result, loading, error, refetch } = useInventoryReconciliation({ knownDocumentRefs });
  const canExport = useCanAccess('inventory', 'export');

  const findings = result?.findings ?? [];
  const quantityFindings = findings.filter((f) => f.code === 'balance_cache_drift' || f.code === 'negative_stock');
  const compatibilityFindings = findings.filter((f) => f.code === 'product_quantity_drift');
  const valuationFindings = findings.filter((f) => f.code === 'subledger_vs_gl');
  const transitFindings = findings.filter((f) => f.code === 'in_transit_vs_gl' || f.code === 'orphan_in_transit' || f.code === 'duplicate_transfer_receipt');
  const totalControlFindings = findings.filter((f) => f.code === 'total_inventory_vs_gl');
  const evidenceFindings = findings.filter((f) => f.code === 'movement_missing_source');
  const roundingFindings = findings.filter((f) => f.toleranceBound !== undefined);

  const exportDataset: ExportDataset<InventoryReconciliationFinding> = {
    title: 'Inventory Reconciliation Report',
    subtitle: result ? (result.isReconciled ? 'Reconciled' : `${findings.filter((f) => f.severity === 'error').length} error finding(s)`) : undefined,
    columns: FINDING_EXPORT_COLUMNS,
    rows: findings,
    filename: `inventory-reconciliation-report-${new Date().toISOString().slice(0, 10)}`,
  };

  return (
    <InventoryReportShell
      title="Inventory reconciliation report"
      description="Subledger, movement ledger and general-ledger control-account reconciliation — every check, every finding, in full."
      loading={loading}
      error={error}
      onRetry={refetch}
      canExport={canExport}
      exportDataset={exportDataset}
      summary={
        result && (
          <ReportSummaryCard>
            <FigureBlock label="Inventory subledger" value={formatCurrency(result.subledgerValuation)} />
            <FigureBlock label="Inventory Asset GL — 1200" value={formatCurrency(result.inventoryGlBalance)} />
            <FigureBlock label="Total control difference" value={formatCurrency(result.totalInventoryVsGl)} />
            <FigureBlock label="Status" value={result.isReconciled ? 'Reconciled' : 'Investigate'} tone={result.isReconciled ? 'positive' : 'negative'} />
          </ReportSummaryCard>
        )
      }
    >
      {result && (
        <>
          <SectionCard title="A. Quantity control" description="Movement ledger vs stock_balances, per product/warehouse.">
            <SectionBlock title="Balance cache drift / negative stock" findings={quantityFindings} />
          </SectionCard>

          <SectionCard title="B. Compatibility" description="stock_balances vs products.quantity_on_hand.">
            <SectionBlock title="Product quantity drift" findings={compatibilityFindings} />
          </SectionCard>

          <SectionCard title="C. Valuation" description="On-hand inventory subledger vs GL 1200 (Inventory Asset).">
            <div className="mb-3 flex flex-col gap-1 text-sm">
              <span>On-hand inventory: <Amount value={result.subledgerValuation} /></span>
              <span>GL 1200: <Amount value={result.inventoryGlBalance} /></span>
              <span className="font-medium">Difference: <Amount value={result.subledgerVsGl} /></span>
            </div>
            <SectionBlock title="Findings" findings={valuationFindings} />
          </SectionCard>

          <SectionCard title="D. Transit" description="Inventory in transit vs GL 1210 (Inventory in Transit).">
            <div className="mb-3 flex flex-col gap-1 text-sm">
              <span>Inventory in transit: <Amount value={result.inTransitValuation} /></span>
              <span>GL 1210: <Amount value={result.inTransitGlBalance} /></span>
              <span className="font-medium">Difference: <Amount value={result.inTransitVsGl} /></span>
            </div>
            <SectionBlock title="Findings" findings={transitFindings} />
          </SectionCard>

          <SectionCard title="E. Total control" description="Inventory + transit vs GL 1200 + 1210.">
            <div className="mb-3 text-sm font-medium">
              Total control difference: <Amount value={result.totalInventoryVsGl} />
            </div>
            <SectionBlock title="Findings" findings={totalControlFindings} />
          </SectionCard>

          <SectionCard title="F. Evidence" description="Movement source-document completeness — every movement traced to a real document, its own reversal, or a legitimate opening balance.">
            {evidenceFindings.length === 0 ? (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Every stock movement resolves to a source document, its own reversal, or a legitimate opening
                balance.
              </p>
            ) : (
              <SectionBlock title="Movements without valid source evidence" findings={evidenceFindings} />
            )}
          </SectionCard>

          <SectionCard title="G. Rounding" description="Actual difference vs the allowed theoretical rounding bound.">
            {roundingFindings.length === 0 ? (
              <p className="text-xs text-muted-foreground">No rounding-band findings — every checked figure ties out exactly.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {roundingFindings.map((f, i) => (
                  <li key={`${f.code}-${i}`} className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2 text-xs">
                    <span className="font-medium">{f.code.replace(/_/g, ' ')}</span>
                    <span className="figure tabular-nums text-muted-foreground">
                      difference {formatCurrency(f.difference)} · allowed bound ±{formatCurrency(f.toleranceBound ?? 0)} ·{' '}
                      {Math.abs(f.difference) <= (f.toleranceBound ?? 0) ? 'within bound (rounding residual)' : 'EXCEEDS bound — investigate'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </InventoryReportShell>
  );
}
