import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import type { Warehouse } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { useWarehouses } from '../hooks/useWarehouses';
import { useProducts } from '../hooks/useProducts';
import { useStockMovements } from '../hooks/useStockMovements';
import { WarehouseFormModal } from '../components/WarehouseFormModal';
import { WarehousesTable } from '../components/WarehousesTable';
import { StockByWarehouseTable } from '../components/StockByWarehouseTable';
import type { CreateWarehouseDTO, UpdateWarehouseDTO } from '../services/warehouseService';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';

type DialogState = { mode: 'create-warehouse' } | { mode: 'edit-warehouse'; warehouse: Warehouse } | null;

/**
 * Multi-Warehouse Stock — route `/inventory/warehouses`. Real
 * useWarehouses()/useStockMovements() data throughout — all stock
 * quantities come from the stock movement ledger, never computed here.
 * No literal v0 template exists for multi-warehouse stock — re-skinned
 * onto v0's general PageHeader/SectionCard/Dialog language (M8). Stock
 * adjustment/transfer link straight to their own draft-then-post
 * registers under `/inventory/*` (Phase 5) — this page never wires a
 * shortcut that bypasses those lifecycle/posting services with a direct
 * mutation (docs/DO_NOT_BREAK.md § Inventory & Stock).
 */
export function WarehousesPage() {
  const {
    warehouses,
    loading: warehousesLoading,
    error: warehousesError,
    refetch: refetchWarehouses,
    createWarehouse,
    updateWarehouse,
    deleteWarehouse,
  } = useWarehouses();
  const { products, loading: productsLoading, error: productsError } = useProducts();
  const { stockLevels, loading: movementsLoading, error: movementsError } = useStockMovements();

  const [dialog, setDialog] = useState<DialogState>(null);
  const canCreate = useCanAccess('inventory', 'create');
  const canUpdate = useCanAccess('inventory', 'update');
  const canDelete = useCanAccess('inventory', 'delete');

  const loading = warehousesLoading || productsLoading || movementsLoading;
  const error = warehousesError ?? productsError ?? movementsError;

  const handleWarehouseSubmit = async (data: CreateWarehouseDTO | UpdateWarehouseDTO) => {
    if (dialog?.mode === 'edit-warehouse') {
      await updateWarehouse(dialog.warehouse.id, data as UpdateWarehouseDTO);
    } else {
      await createWarehouse(data as CreateWarehouseDTO);
    }
    setDialog(null);
  };

  const handleDeleteWarehouse = async (warehouse: Warehouse) => {
    if (window.confirm(`Delete "${warehouse.name}"? This cannot be undone.`)) {
      await deleteWarehouse(warehouse.id);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Multi-warehouse stock"
        description="Warehouses, stock by location, transfers and adjustments."
        actions={
          canCreate || canUpdate ? (
            <div className="flex flex-wrap items-center gap-2">
              {canUpdate && (
                <>
                  <Link to="/inventory/adjustments" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    Stock adjustment
                  </Link>
                  <Link to="/inventory/transfers" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    Stock transfer
                  </Link>
                </>
              )}
              {canCreate && (
                <Button size="sm" onClick={() => setDialog({ mode: 'create-warehouse' })}>
                  <Plus data-icon="inline-start" />
                  New warehouse
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      {loading && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading warehouse data…</p>
        </div>
      )}
      {!loading && error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetchWarehouses()}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && (
        <>
          <SectionCard title="Warehouses" description="Every stock location and its default/active status.">
            <WarehousesTable
              warehouses={warehouses}
              onEdit={canUpdate ? (warehouse) => setDialog({ mode: 'edit-warehouse', warehouse }) : undefined}
              onDelete={canDelete ? (warehouse) => void handleDeleteWarehouse(warehouse) : undefined}
            />
          </SectionCard>

          <SectionCard title="Stock by warehouse" description="Quantity on hand for every tracked product, per location.">
            <StockByWarehouseTable products={products} warehouses={warehouses} stockLevels={stockLevels} />
          </SectionCard>
        </>
      )}

      {(dialog?.mode === 'create-warehouse' || dialog?.mode === 'edit-warehouse') && (
        <WarehouseFormModal
          warehouse={dialog.mode === 'edit-warehouse' ? dialog.warehouse : undefined}
          onSubmit={handleWarehouseSubmit}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
