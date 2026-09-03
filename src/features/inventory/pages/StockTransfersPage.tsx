import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import type { StockTransfer, Warehouse } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { useLegacyRecordRedirect } from '@/components/app/record-page';
import { formatCurrency } from '@/lib/app/format';
import { useStockTransfers } from '../hooks/useStockTransfers';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { ExportMenu } from '@/features/export/components/ExportMenu';
import { PrintableReport } from '@/features/export/components/PrintableReport';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { StockTransfersTable } from '../components/StockTransfersTable';
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

/**
 * Stock Transfer register — route `/inventory/transfers`, the list only. A
 * row click navigates to the full-page record at
 * `/inventory/transfers/:transferId` (StockTransferDetailPage); legacy
 * `?record=<id>` deep links are redirected there. Dispatch / receive /
 * complete live on the record page.
 */
export function StockTransfersPage() {
  const navigate = useNavigate();
  useLegacyRecordRedirect('/inventory/transfers');

  const { transfers, loading, error, refetch, createTransfer, deleteTransfer } = useStockTransfers();
  const { products, loading: productsLoading } = useProducts();
  const { warehouses, loading: warehousesLoading } = useWarehouses();
  const canCreate = useCanAccess('inventory', 'create');
  const canDelete = useCanAccess('inventory', 'delete');
  const canExport = useCanAccess('inventory', 'export');
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [visibleRows, setVisibleRows] = useState<StockTransfer[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const handleFormSubmit = async (data: CreateStockTransferDTO | UpdateStockTransferDTO) => {
    const created = await createTransfer(data as CreateStockTransferDTO);
    setCreating(false);
    navigate(`/inventory/transfers/${created.id}`);
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
              <Button size="sm" onClick={() => setCreating(true)}>
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
            onSelect={(t) => navigate(`/inventory/transfers/${t.id}`)}
            onDelete={canDelete ? (t) => void handleDelete(t) : undefined}
            onVisibleRowsChange={(rows, filters) => {
              setVisibleRows(rows);
              setActiveFilters(filters);
            }}
          />
        </SectionCard>
      )}

      <PrintableReport dataset={exportDataset} className="hidden print:block" />

      {creating && (
        <StockTransferDocumentFormModal
          products={products}
          warehouses={warehouses}
          onSubmit={handleFormSubmit}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
