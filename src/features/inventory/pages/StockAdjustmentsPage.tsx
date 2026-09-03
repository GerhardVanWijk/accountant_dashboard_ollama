import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import type { StockAdjustment } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { useLegacyRecordRedirect } from '@/components/app/record-page';
import { formatCurrency } from '@/lib/app/format';
import { useStockAdjustments } from '../hooks/useStockAdjustments';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { ExportMenu } from '@/features/export/components/ExportMenu';
import { PrintableReport } from '@/features/export/components/PrintableReport';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { StockAdjustmentsTable } from '../components/StockAdjustmentsTable';
import { StockAdjustmentDocumentFormModal } from '../components/StockAdjustmentDocumentFormModal';
import type { CreateStockAdjustmentDTO, UpdateStockAdjustmentDTO } from '../services/stockAdjustmentService';

const ADJUSTMENT_EXPORT_COLUMNS: ExportColumn<StockAdjustment>[] = [
  { key: 'number', header: 'Adjustment Number', accessor: (a) => a.adjustmentNumber },
  { key: 'reason', header: 'Reason', accessor: (a) => a.reason },
  { key: 'date', header: 'Adjustment Date', accessor: (a) => new Date(a.adjustmentDate) },
  {
    key: 'effect',
    header: 'Net Cost Effect',
    accessor: (a) => a.totalCostEffect,
    align: 'right',
    total: (rows) => rows.reduce((sum, a) => sum + a.totalCostEffect, 0),
  },
  { key: 'status', header: 'Status', accessor: (a) => a.status },
];

/**
 * Stock Adjustment register — route `/inventory/adjustments`, the list
 * only. A row click navigates to the full-page record at
 * `/inventory/adjustments/:adjustmentId` (StockAdjustmentDetailPage);
 * legacy `?record=<id>` deep links are redirected there. The
 * draft → pending_approval → posted lifecycle and the `AccountingPreview`
 * live on the record page.
 */
export function StockAdjustmentsPage() {
  const navigate = useNavigate();
  useLegacyRecordRedirect('/inventory/adjustments');

  const { adjustments, loading, error, refetch, createAdjustment, deleteAdjustment } = useStockAdjustments();
  const { products, loading: productsLoading } = useProducts();
  const { warehouses, loading: warehousesLoading } = useWarehouses();
  const canCreate = useCanAccess('inventory', 'create');
  const canDelete = useCanAccess('inventory', 'delete');
  const canExport = useCanAccess('inventory', 'export');
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [visibleRows, setVisibleRows] = useState<StockAdjustment[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const handleFormSubmit = async (data: CreateStockAdjustmentDTO | UpdateStockAdjustmentDTO) => {
    const created = await createAdjustment(data as CreateStockAdjustmentDTO);
    setCreating(false);
    navigate(`/inventory/adjustments/${created.id}`);
  };

  const handleDelete = async (adjustment: StockAdjustment) => {
    if (!window.confirm(`Delete draft adjustment "${adjustment.adjustmentNumber}"? This cannot be undone.`)) return;
    setActionError(null);
    try {
      await deleteAdjustment(adjustment.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete the adjustment.');
    }
  };

  const exportDataset: ExportDataset<StockAdjustment> = {
    title: 'Stock Adjustments',
    subtitle: `${visibleRows.length} of ${adjustments.length} adjustments`,
    filters: activeFilters,
    columns: ADJUSTMENT_EXPORT_COLUMNS,
    rows: visibleRows,
    filename: `stock-adjustments-${new Date().toISOString().slice(0, 10)}`,
  };

  const busy = loading || productsLoading || warehousesLoading;
  const draftCount = adjustments.filter((a) => a.status === 'draft' || a.status === 'pending_approval').length;
  const postedThisMonth = adjustments.filter((a) => a.status === 'posted' && a.postedAt?.slice(0, 7) === new Date().toISOString().slice(0, 7));
  const netEffectThisMonth = postedThisMonth.reduce((sum, a) => sum + a.totalCostEffect, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock adjustments"
        description="Write-offs, shrinkage, damage, stock gains and corrections — reviewed and posted before they touch the general ledger."
        actions={
          <>
            <ExportMenu dataset={exportDataset} allowed={canExport} />
            {canCreate && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus data-icon="inline-start" />
                New adjustment
              </Button>
            )}
          </>
        }
      />

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-3">
          <FigureBlock label="Drafts awaiting action" value={String(draftCount)} hint="Draft or pending approval" />
          <FigureBlock label="Posted this month" value={String(postedThisMonth.length)} />
          <FigureBlock label="Net cost effect this month" value={formatCurrency(netEffectThisMonth)} />
        </div>
      </SectionCard>

      {busy && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading stock adjustments…</p>
        </div>
      )}
      {!busy && error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!busy && !error && (
        <SectionCard title="Adjustment register" description="Every stock adjustment, its reason and its effect on inventory value.">
          <StockAdjustmentsTable
            adjustments={adjustments}
            products={products}
            warehouses={warehouses}
            onSelect={(a) => navigate(`/inventory/adjustments/${a.id}`)}
            onDelete={canDelete ? (a) => void handleDelete(a) : undefined}
            onVisibleRowsChange={(rows, filters) => {
              setVisibleRows(rows);
              setActiveFilters(filters);
            }}
          />
        </SectionCard>
      )}

      <PrintableReport dataset={exportDataset} className="hidden print:block" />

      {creating && (
        <StockAdjustmentDocumentFormModal
          products={products}
          warehouses={warehouses}
          onSubmit={handleFormSubmit}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
