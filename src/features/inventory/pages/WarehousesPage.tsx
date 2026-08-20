import { useState } from 'react';
import type { Warehouse } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useWarehouses } from '../hooks/useWarehouses';
import { useProducts } from '../hooks/useProducts';
import { useStockMovements } from '../hooks/useStockMovements';
import { WarehouseForm } from '../components/WarehouseForm';
import { StockByWarehouseTable } from '../components/StockByWarehouseTable';
import { StockTransferForm } from '../components/StockTransferForm';
import { StockAdjustmentForm } from '../components/StockAdjustmentForm';
import { Modal } from '../components/Modal';
import type { CreateWarehouseDTO, UpdateWarehouseDTO } from '../services/warehouseService';

type DialogState =
  | { mode: 'create-warehouse' }
  | { mode: 'edit-warehouse'; warehouse: Warehouse }
  | { mode: 'transfer' }
  | { mode: 'adjust' }
  | null;

/** Multi-Warehouse Stock — route `/inventory/warehouses` (docs/ROUTES.md). */
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
  const {
    stockLevels,
    loading: movementsLoading,
    error: movementsError,
    transferStock,
    adjustStock,
    recordOpeningStock,
  } = useStockMovements();

  const [dialog, setDialog] = useState<DialogState>(null);

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
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Multi-Warehouse Stock</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Warehouses, stock-by-location, transfers, and adjustments. /inventory/warehouses
          </p>
        </div>
        <div className="flex flex-wrap gap-sm">
          <Button variant="secondary" onClick={() => setDialog({ mode: 'adjust' })}>
            Stock Adjustment
          </Button>
          <Button variant="secondary" onClick={() => setDialog({ mode: 'transfer' })}>
            Stock Transfer
          </Button>
          <Button onClick={() => setDialog({ mode: 'create-warehouse' })}>New Warehouse</Button>
        </div>
      </div>

      {loading && <Spinner label="Loading warehouse data…" />}
      {!loading && error && <ErrorState message={error.message} onRetry={refetchWarehouses} />}

      {!loading && !error && (
        <>
          <Card>
            <h2 className="mb-md flex items-center gap-sm text-base font-semibold text-text-primary">
              <Icon name="warehouses" size={18} />
              Warehouses
            </h2>
            {warehouses.length === 0 ? (
              <EmptyState
                title="No warehouses yet"
                message="Add a warehouse to start allocating stock."
                action={<Button onClick={() => setDialog({ mode: 'create-warehouse' })}>New Warehouse</Button>}
              />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[600px] border-collapse text-left text-sm">
                  <thead className="bg-background">
                    <tr>
                      <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Name</th>
                      <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Code</th>
                      <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Location</th>
                      <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Default</th>
                      <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Status</th>
                      <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary" />
                    </tr>
                  </thead>
                  <tbody>
                    {warehouses.map((w) => (
                      <tr key={w.id} className="border-t border-border hover:bg-background">
                        <td className="whitespace-nowrap px-md py-sm text-text-primary">{w.name}</td>
                        <td className="whitespace-nowrap px-md py-sm text-text-primary">{w.code}</td>
                        <td className="whitespace-nowrap px-md py-sm text-text-primary">
                          {w.address?.city ?? '—'}
                        </td>
                        <td className="whitespace-nowrap px-md py-sm text-text-primary">
                          {w.isDefault ? (
                            <span className="inline-flex items-center rounded-full bg-primary px-sm py-0.5 text-xs font-medium text-on-accent">
                              Default
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="whitespace-nowrap px-md py-sm text-text-primary capitalize">{w.status}</td>
                        <td className="whitespace-nowrap px-md py-sm">
                          <div className="flex justify-end gap-sm">
                            <button
                              type="button"
                              onClick={() => setDialog({ mode: 'edit-warehouse', warehouse: w })}
                              className="rounded-md px-sm py-xs text-xs font-medium text-primary hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteWarehouse(w)}
                              className="rounded-md px-sm py-xs text-xs font-medium text-danger hover:underline"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-md text-base font-semibold text-text-primary">Stock by Warehouse</h2>
            <StockByWarehouseTable products={products} warehouses={warehouses} stockLevels={stockLevels} />
          </Card>
        </>
      )}

      {(dialog?.mode === 'create-warehouse' || dialog?.mode === 'edit-warehouse') && (
        <Modal
          title={dialog.mode === 'edit-warehouse' ? 'Edit Warehouse' : 'New Warehouse'}
          onClose={() => setDialog(null)}
        >
          <WarehouseForm
            warehouse={dialog.mode === 'edit-warehouse' ? dialog.warehouse : undefined}
            onSubmit={handleWarehouseSubmit}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}

      {dialog?.mode === 'transfer' && (
        <Modal title="Stock Transfer" onClose={() => setDialog(null)}>
          <StockTransferForm
            products={products}
            warehouses={warehouses}
            onSubmit={async (input) => {
              await transferStock(input);
              setDialog(null);
            }}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}

      {dialog?.mode === 'adjust' && (
        <Modal title="Stock Adjustment" onClose={() => setDialog(null)}>
          <StockAdjustmentForm
            products={products}
            warehouses={warehouses}
            onSubmitAdjustment={async (input) => {
              await adjustStock(input);
              setDialog(null);
            }}
            onSubmitOpening={async (input) => {
              await recordOpeningStock(input);
              setDialog(null);
            }}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}
    </div>
  );
}
