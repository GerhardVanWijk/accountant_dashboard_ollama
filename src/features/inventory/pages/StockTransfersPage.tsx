import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import type { StockTransfer, Warehouse } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency } from '@/lib/app/format';
import { useStockTransfers } from '../hooks/useStockTransfers';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { ExportMenu } from '@/features/export/components/ExportMenu';
import { PrintableReport } from '@/features/export/components/PrintableReport';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { StockTransfersTable } from '../components/StockTransfersTable';
import { StockTransferDetailSheet } from '../components/StockTransferDetailSheet';
import { StockTransferDocumentFormModal } from '../components/StockTransferDocumentFormModal';
import type { CreateStockTransferDTO, UpdateStockTransferDTO } from '../services/stockTransferService';

function buildTransferExportColumns(warehouses: Warehouse[]): ExportColumn<StockTransfer>[] {
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;
  return [
    { key: 'number', header: 'Transfer Number', accessor: (t) => t.transferNumber },
    { key: 'from', header: 'From Warehouse', accessor: (t) => warehouseName(t.fromWarehouseId) },
    { key: 'to', header: 'To Warehouse', accessor: (t) => warehouseName(t.toWarehouseId) },
    { key: 'date', header: 'Transfer Date', accessor: (t) => new Date(t.transferDate) },
    {
      key: 'cost',
      header: 'Total Cost',
      accessor: (t) => t.totalCost,
      align: 'right',
      total: (rows) => rows.reduce((sum, t) => sum + t.totalCost, 0),
    },
    { key: 'status', header: 'Status', accessor: (t) => t.status },
  ];
}

type DialogState = { mode: 'create' } | { mode: 'edit'; transfer: StockTransfer } | null;

/**
 * Stock Transfer register — route `/inventory/transfers` (Phase 5 §2).
 * Draft → in_transit → completed (or draft → completed immediate)
 * lifecycle over `stockTransferService`, mirroring
 * `StockAdjustmentsPage`'s shape.
 */
export function StockTransfersPage() {
  const {
    transfers,
    loading,
    error,
    refetch,
    createTransfer,
    updateTransfer,
    deleteTransfer,
    dispatch,
    receive,
    completeImmediate,
    cancelTransfer,
    previewDispatchEffect,
    previewReceiveEffect,
  } = useStockTransfers();
  const { products, loading: productsLoading } = useProducts();
  const { warehouses, loading: warehousesLoading } = useWarehouses();
  const { accounts } = useAccounts();
  const canCreate = useCanAccess('inventory', 'create');
  const canUpdate = useCanAccess('inventory', 'update');
  const canDelete = useCanAccess('inventory', 'delete');
  const canExport = useCanAccess('inventory', 'export');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [visibleRows, setVisibleRows] = useState<StockTransfer[]>([]);
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
  const detailTransfer = transfers.find((t) => t.id === selectedId);

  const handleFormSubmit = async (data: CreateStockTransferDTO | UpdateStockTransferDTO) => {
    if (dialog?.mode === 'edit') {
      await updateTransfer(dialog.transfer.id, data as UpdateStockTransferDTO);
    } else {
      const created = await createTransfer(data as CreateStockTransferDTO);
      openRecord(created.id);
    }
    setDialog(null);
  };

  const handleDelete = async (transfer: StockTransfer) => {
    if (!window.confirm(`Delete draft transfer "${transfer.transferNumber}"? This cannot be undone.`)) return;
    setActionError(null);
    try {
      await deleteTransfer(transfer.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete the transfer.');
    }
  };

  const exportDataset: ExportDataset<StockTransfer> = {
    title: 'Stock Transfers',
    subtitle: `${visibleRows.length} of ${transfers.length} transfers`,
    filters: activeFilters,
    columns: buildTransferExportColumns(warehouses),
    rows: visibleRows,
    filename: `stock-transfers-${new Date().toISOString().slice(0, 10)}`,
  };

  const busy = loading || productsLoading || warehousesLoading;
  const inTransitCount = transfers.filter((t) => t.status === 'in_transit').length;
  const draftCount = transfers.filter((t) => t.status === 'draft').length;
  const inTransitValue = transfers.filter((t) => t.status === 'in_transit').reduce((sum, t) => sum + t.totalCost, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock transfers"
        description="Move stock between warehouses — dispatch and receive for an in-transit trail, or complete immediately when both legs happen at once."
        actions={
          <>
            <ExportMenu dataset={exportDataset} allowed={canExport} />
            {canCreate && (
              <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
                <Plus data-icon="inline-start" />
                New transfer
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
          <FigureBlock label="Drafts" value={String(draftCount)} />
          <FigureBlock label="In transit" value={String(inTransitCount)} />
          <FigureBlock label="In-transit value" value={formatCurrency(inTransitValue)} hint="At carrying cost" />
        </div>
      </SectionCard>

      {busy && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading stock transfers…</p>
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
        <SectionCard title="Transfer register" description="Every inter-warehouse movement and where it stands.">
          <StockTransfersTable
            transfers={transfers}
            products={products}
            warehouses={warehouses}
            onSelect={(t) => openRecord(t.id)}
            onDelete={canDelete ? (t) => void handleDelete(t) : undefined}
            onVisibleRowsChange={(rows, filters) => {
              setVisibleRows(rows);
              setActiveFilters(filters);
            }}
          />
        </SectionCard>
      )}

      <StockTransferDetailSheet
        transfer={detailTransfer}
        products={products}
        warehouses={warehouses}
        accounts={accounts}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeRecord();
        }}
        canManage={canUpdate}
        onEdit={(t) => setDialog({ mode: 'edit', transfer: t })}
        onDispatch={(t) => dispatch(t.id).then(() => undefined)}
        onReceive={(t) => receive(t.id).then(() => undefined)}
        onCompleteImmediate={(t) => completeImmediate(t.id).then(() => undefined)}
        onCancel={(t) => cancelTransfer(t.id).then(() => undefined)}
        loadDispatchPreview={previewDispatchEffect}
        loadReceivePreview={previewReceiveEffect}
      />

      <PrintableReport dataset={exportDataset} className="hidden print:block" />

      {(dialog?.mode === 'create' || dialog?.mode === 'edit') && (
        <StockTransferDocumentFormModal
          transfer={dialog.mode === 'edit' ? dialog.transfer : undefined}
          products={products}
          warehouses={warehouses}
          onSubmit={handleFormSubmit}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
