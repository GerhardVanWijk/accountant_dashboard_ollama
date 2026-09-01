import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import type { SupplierReturn } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency } from '@/lib/app/format';
import { useSupplierReturns } from '../hooks/useSupplierReturns';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { ExportMenu } from '@/features/export/components/ExportMenu';
import { PrintableReport } from '@/features/export/components/PrintableReport';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { SupplierReturnsTable } from '../components/SupplierReturnsTable';
import { SupplierReturnDetailSheet } from '../components/SupplierReturnDetailSheet';
import { SupplierReturnDocumentFormModal } from '../components/SupplierReturnDocumentFormModal';
import type { CreateSupplierReturnDTO, UpdateSupplierReturnDTO } from '../services/supplierReturnService';
import type { Supplier } from '@/types';

function buildSupplierReturnExportColumns(suppliers: Supplier[]): ExportColumn<SupplierReturn>[] {
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id;
  return [
    { key: 'number', header: 'Return Number', accessor: (r) => r.returnNumber },
    { key: 'supplier', header: 'Supplier', accessor: (r) => supplierName(r.supplierId) },
    { key: 'reason', header: 'Reason', accessor: (r) => r.reason ?? null },
    { key: 'date', header: 'Return Date', accessor: (r) => new Date(r.returnDate) },
    {
      key: 'total',
      header: 'Total Credit',
      accessor: (r) => r.total,
      align: 'right',
      total: (rows) => rows.reduce((sum, r) => sum + r.total, 0),
    },
    { key: 'status', header: 'Status', accessor: (r) => r.status },
  ];
}

type DialogState = { mode: 'create' } | { mode: 'edit'; supplierReturn: SupplierReturn } | null;

/**
 * Supplier Return register — route `/inventory/supplier-returns` (Phase 5
 * §4). Draft → posted lifecycle over `supplierReturnService`, mirroring
 * `StockAdjustmentsPage`'s shape.
 */
export function SupplierReturnsPage() {
  const {
    supplierReturns,
    loading,
    error,
    refetch,
    createSupplierReturn,
    updateSupplierReturn,
    deleteSupplierReturn,
    postSupplierReturn,
    cancelSupplierReturn,
    previewPostEffect,
  } = useSupplierReturns();
  const { products, loading: productsLoading } = useProducts();
  const { warehouses, loading: warehousesLoading } = useWarehouses();
  const { suppliers, loading: suppliersLoading } = useSuppliers();
  const { taxRates } = useTaxRates();
  const { accounts } = useAccounts();
  const canCreate = useCanAccess('inventory', 'create');
  const canUpdate = useCanAccess('inventory', 'update');
  const canDelete = useCanAccess('inventory', 'delete');
  const canExport = useCanAccess('inventory', 'export');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [visibleRows, setVisibleRows] = useState<SupplierReturn[]>([]);
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
  const detailReturn = supplierReturns.find((r) => r.id === selectedId);

  const handleFormSubmit = async (data: CreateSupplierReturnDTO | UpdateSupplierReturnDTO) => {
    if (dialog?.mode === 'edit') {
      await updateSupplierReturn(dialog.supplierReturn.id, data as UpdateSupplierReturnDTO);
    } else {
      const created = await createSupplierReturn(data as CreateSupplierReturnDTO);
      openRecord(created.id);
    }
    setDialog(null);
  };

  const handleDelete = async (supplierReturn: SupplierReturn) => {
    if (!window.confirm(`Delete draft return "${supplierReturn.returnNumber}"? This cannot be undone.`)) return;
    setActionError(null);
    try {
      await deleteSupplierReturn(supplierReturn.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete the supplier return.');
    }
  };

  const exportDataset: ExportDataset<SupplierReturn> = {
    title: 'Supplier Returns',
    subtitle: `${visibleRows.length} of ${supplierReturns.length} returns`,
    filters: activeFilters,
    columns: buildSupplierReturnExportColumns(suppliers),
    rows: visibleRows,
    filename: `supplier-returns-${new Date().toISOString().slice(0, 10)}`,
  };

  const busy = loading || productsLoading || warehousesLoading || suppliersLoading;
  const draftCount = supplierReturns.filter((r) => r.status === 'draft').length;
  const postedThisMonth = supplierReturns.filter((r) => r.status === 'posted' && r.updatedAt.slice(0, 7) === new Date().toISOString().slice(0, 7));
  const totalCreditThisMonth = postedThisMonth.reduce((sum, r) => sum + r.total, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Supplier returns"
        description="Goods returned to a supplier — stock leaves at carrying cost, the supplier's credit settles Accounts Payable, and the gap posts to Purchase Price Variance."
        actions={
          <>
            <ExportMenu dataset={exportDataset} allowed={canExport} />
            {canCreate && (
              <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
                <Plus data-icon="inline-start" />
                New return
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
          <FigureBlock label="Posted this month" value={String(postedThisMonth.length)} />
          <FigureBlock label="Total credit this month" value={formatCurrency(totalCreditThisMonth)} />
        </div>
      </SectionCard>

      {busy && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading supplier returns…</p>
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
        <SectionCard title="Return register" description="Every return to a supplier and where it stands.">
          <SupplierReturnsTable
            supplierReturns={supplierReturns}
            suppliers={suppliers}
            onSelect={(r) => openRecord(r.id)}
            onDelete={canDelete ? (r) => void handleDelete(r) : undefined}
            onVisibleRowsChange={(rows, filters) => {
              setVisibleRows(rows);
              setActiveFilters(filters);
            }}
          />
        </SectionCard>
      )}

      <SupplierReturnDetailSheet
        supplierReturn={detailReturn}
        products={products}
        warehouses={warehouses}
        suppliers={suppliers}
        accounts={accounts}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeRecord();
        }}
        canManage={canUpdate}
        onEdit={(r) => setDialog({ mode: 'edit', supplierReturn: r })}
        onPost={(r) => postSupplierReturn(r.id).then(() => undefined)}
        onCancel={(r) => cancelSupplierReturn(r.id).then(() => undefined)}
        loadPreview={previewPostEffect}
      />

      <PrintableReport dataset={exportDataset} className="hidden print:block" />

      {(dialog?.mode === 'create' || dialog?.mode === 'edit') && (
        <SupplierReturnDocumentFormModal
          supplierReturn={dialog.mode === 'edit' ? dialog.supplierReturn : undefined}
          products={products}
          warehouses={warehouses}
          suppliers={suppliers}
          taxRates={taxRates}
          onSubmit={handleFormSubmit}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
