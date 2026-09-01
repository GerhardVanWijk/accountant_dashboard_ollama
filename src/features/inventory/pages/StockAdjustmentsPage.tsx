import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import type { StockAdjustment } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency } from '@/lib/app/format';
import { useStockAdjustments } from '../hooks/useStockAdjustments';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { ExportMenu } from '@/features/export/components/ExportMenu';
import { PrintableReport } from '@/features/export/components/PrintableReport';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { StockAdjustmentsTable } from '../components/StockAdjustmentsTable';
import { StockAdjustmentDetailSheet } from '../components/StockAdjustmentDetailSheet';
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

type DialogState = { mode: 'create' } | { mode: 'edit'; adjustment: StockAdjustment } | null;

/**
 * Stock Adjustment register — route `/inventory/adjustments` (Phase 5 §1).
 * Draft → pending_approval → posted lifecycle over `stockAdjustmentService`
 * (migration 0027 / Phase 3 engine), mirroring `AssetRegisterPage`'s
 * shape. `AccountingPreview` (via `StockAdjustmentDetailSheet`) is the
 * only place the resulting journal entry is shown — never recomputed here.
 */
export function StockAdjustmentsPage() {
  const {
    adjustments,
    loading,
    error,
    refetch,
    createAdjustment,
    updateAdjustment,
    deleteAdjustment,
    submitForApproval,
    approve,
    postAdjustment,
    cancelAdjustment,
    reverseAdjustment,
    previewAccountingEffect,
  } = useStockAdjustments();
  const { products, loading: productsLoading } = useProducts();
  const { warehouses, loading: warehousesLoading } = useWarehouses();
  const { accounts } = useAccounts();
  const canCreate = useCanAccess('inventory', 'create');
  const canUpdate = useCanAccess('inventory', 'update');
  const canDelete = useCanAccess('inventory', 'delete');
  const canExport = useCanAccess('inventory', 'export');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [visibleRows, setVisibleRows] = useState<StockAdjustment[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('record') ?? undefined;
  const detailOpen = Boolean(selectedId);
  function openRecord(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('record', id);
      return next;
    });
  }
  function closeRecord() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('record');
      return next;
    });
  }
  const detailAdjustment = adjustments.find((a) => a.id === selectedId);

  const handleFormSubmit = async (data: CreateStockAdjustmentDTO | UpdateStockAdjustmentDTO) => {
    if (dialog?.mode === 'edit') {
      await updateAdjustment(dialog.adjustment.id, data as UpdateStockAdjustmentDTO);
    } else {
      const created = await createAdjustment(data as CreateStockAdjustmentDTO);
      openRecord(created.id);
    }
    setDialog(null);
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
              <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
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
            onSelect={(a) => openRecord(a.id)}
            onDelete={canDelete ? (a) => void handleDelete(a) : undefined}
            onVisibleRowsChange={(rows, filters) => {
              setVisibleRows(rows);
              setActiveFilters(filters);
            }}
          />
        </SectionCard>
      )}

      <StockAdjustmentDetailSheet
        adjustment={detailAdjustment}
        products={products}
        warehouses={warehouses}
        accounts={accounts}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeRecord();
        }}
        canManage={canUpdate}
        onEdit={(a) => setDialog({ mode: 'edit', adjustment: a })}
        onSubmitForApproval={(a) => submitForApproval(a.id).then(() => undefined)}
        onApprove={(a) => approve(a.id).then(() => undefined)}
        onPost={(a) => postAdjustment(a.id).then(() => undefined)}
        onCancel={(a) => cancelAdjustment(a.id).then(() => undefined)}
        onReverse={(a) => reverseAdjustment(a.id, 'Reversed from the stock adjustment register').then(() => undefined)}
        loadPreview={previewAccountingEffect}
      />

      <PrintableReport dataset={exportDataset} className="hidden print:block" />

      {(dialog?.mode === 'create' || dialog?.mode === 'edit') && (
        <StockAdjustmentDocumentFormModal
          adjustment={dialog.mode === 'edit' ? dialog.adjustment : undefined}
          products={products}
          warehouses={warehouses}
          onSubmit={handleFormSubmit}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
