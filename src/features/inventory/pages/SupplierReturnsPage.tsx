import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import type { Supplier, SupplierReturn } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { useLegacyRecordRedirect } from '@/components/app/record-page';
import { formatCurrency } from '@/lib/app/format';
import { useSupplierReturns } from '../hooks/useSupplierReturns';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { ExportMenu } from '@/features/export/components/ExportMenu';
import { PrintableReport } from '@/features/export/components/PrintableReport';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { SupplierReturnsTable } from '../components/SupplierReturnsTable';
import { SupplierReturnDocumentFormModal } from '../components/SupplierReturnDocumentFormModal';
import type { CreateSupplierReturnDTO, UpdateSupplierReturnDTO } from '../services/supplierReturnService';

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

/**
 * Supplier Return register — route `/inventory/supplier-returns`, the list
 * only. A row click navigates to the full-page record at
 * `/inventory/supplier-returns/:supplierReturnId` (SupplierReturnDetailPage);
 * legacy `?record=<id>` deep links are redirected there. Post lives on the
 * record page.
 */
export function SupplierReturnsPage() {
  const navigate = useNavigate();
  useLegacyRecordRedirect('/inventory/supplier-returns');

  const { supplierReturns, loading, error, refetch, createSupplierReturn, deleteSupplierReturn } = useSupplierReturns();
  const { products, loading: productsLoading } = useProducts();
  const { warehouses, loading: warehousesLoading } = useWarehouses();
  const { suppliers, loading: suppliersLoading } = useSuppliers();
  const { taxRates } = useTaxRates();
  const canCreate = useCanAccess('inventory', 'create');
  const canDelete = useCanAccess('inventory', 'delete');
  const canExport = useCanAccess('inventory', 'export');
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [visibleRows, setVisibleRows] = useState<SupplierReturn[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const handleFormSubmit = async (data: CreateSupplierReturnDTO | UpdateSupplierReturnDTO) => {
    const created = await createSupplierReturn(data as CreateSupplierReturnDTO);
    setCreating(false);
    navigate(`/inventory/supplier-returns/${created.id}`);
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
              <Button size="sm" onClick={() => setCreating(true)}>
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
            onSelect={(r) => navigate(`/inventory/supplier-returns/${r.id}`)}
            onDelete={canDelete ? (r) => void handleDelete(r) : undefined}
            onVisibleRowsChange={(rows, filters) => {
              setVisibleRows(rows);
              setActiveFilters(filters);
            }}
          />
        </SectionCard>
      )}

      <PrintableReport dataset={exportDataset} className="hidden print:block" />

      {creating && (
        <SupplierReturnDocumentFormModal
          products={products}
          warehouses={warehouses}
          suppliers={suppliers}
          taxRates={taxRates}
          onSubmit={handleFormSubmit}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
