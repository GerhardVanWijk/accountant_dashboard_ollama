import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDownIcon, FileBarChart2Icon, Loader2, PackagePlusIcon, UploadIcon } from 'lucide-react';
import type { Product } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { ConfirmDialog } from '@/components/app/form';
import { formatCurrency } from '@/lib/app/format';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useProducts } from '../hooks/useProducts';
import { useStockAlerts } from '../hooks/useStockAlerts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useStockMovements } from '../hooks/useStockMovements';
import { useStockBalances } from '../hooks/useStockBalances';
import { useProductCategories } from '../hooks/useProductCategories';
import { useInventoryReconciliation } from '../hooks/useInventoryReconciliation';
import { InventoryTable } from '../components/InventoryTable';
import { InventoryItemDetailSheet } from '../components/InventoryItemDetailSheet';
import { InventoryReconciliationCard } from '../components/InventoryReconciliationCard';
import { ProductFormModal } from '../components/ProductFormModal';
import { StockAdjustmentFormModal } from '../components/StockAdjustmentFormModal';
import { StockTransferFormModal } from '../components/StockTransferFormModal';
import { calculateInventoryTotals } from '../utils/calculateInventoryTotals';
import type { CreateProductDTO, UpdateProductDTO } from '../services/productService';

type Dialog =
  | { kind: 'new-item' }
  | { kind: 'edit-item'; product: Product }
  | { kind: 'adjust' }
  | { kind: 'transfer' }
  | { kind: 'phase5'; title: string; description: string }
  | null;

const RECENT_WINDOW_DAYS = 30;

/**
 * Inventory module home — route `/inventory`. The full landing page over the
 * Phase-3 accounting engine: primary actions, a live summary strip, the
 * `reconcileInventory()` card, and the main inventory register. Row click
 * opens the tabbed item detail sheet. Everything is real
 * service/hook data — a figure with nothing behind it shows a correct
 * zero/empty state, never a fabricated number.
 *
 * Workflow quick actions: New item and (legacy) Stock adjustment / transfer
 * open real forms; Stock take / Supplier return / Opening stock / Import open
 * a "coming in the workflow phase" notice — Phase 4 never wires a shortcut
 * that bypasses the approved lifecycle/posting services.
 */
export function InventoryOverviewPage() {
  const { products, loading, error, refetch, createProduct, updateProduct } = useProducts();
  const { lowStock, outOfStock } = useStockAlerts();
  const { warehouses } = useWarehouses();
  const { movements, transferStock, adjustStock, recordOpeningStock, refetch: refetchMovements } = useStockMovements();
  const { balances, refetch: refetchBalances } = useStockBalances();
  const { categories } = useProductCategories();
  const { suppliers } = useSuppliers();
  const { taxRates } = useAllTaxRates();
  const reconciliation = useInventoryReconciliation();

  const canCreate = useCanAccess('inventory', 'create');
  const canUpdate = useCanAccess('inventory', 'update');

  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const totals = calculateInventoryTotals(products);
  const trackedInStock = products.filter((p) => p.trackInventory && p.quantityOnHand > 0).length;
  const recentActivity = useMemo(() => {
    const cutoff = Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return movements.filter((m) => new Date(m.movementDate ?? m.createdAt).getTime() >= cutoff).length;
  }, [movements]);

  const selectedProduct = products.find((p) => p.id === selectedId);

  async function afterMutation() {
    await Promise.all([refetch(), refetchMovements(), refetchBalances(), reconciliation.refetch()]);
  }

  async function handleItemSubmit(data: CreateProductDTO | UpdateProductDTO) {
    if (dialog?.kind === 'edit-item') await updateProduct(dialog.product.id, data as UpdateProductDTO);
    else await createProduct(data as CreateProductDTO);
    setDialog(null);
    await refetch();
  }

  const phase5 = (title: string, description: string) => () =>
    setDialog({ kind: 'phase5', title, description });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inventory"
        description="Goods held for sale or consumption — valuation, stock levels and the tools to keep them accurate."
        actions={
          <>
            {canCreate && (
              <Button size="sm" onClick={() => setDialog({ kind: 'new-item' })}>
                <PackagePlusIcon data-icon="inline-start" />
                New item
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={phase5('Import inventory', 'Bulk import of products, opening stock and stock counts arrives with the import framework (Phase 6). It will use the same preview-and-confirm flow as the bank statement importer — nothing posts to the ledger without confirmation.')}
            >
              <UploadIcon data-icon="inline-start" />
              Import
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
                Stock actions
                <ChevronDownIcon data-icon="inline-end" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Movements</DropdownMenuLabel>
                {canUpdate && <DropdownMenuItem onClick={() => setDialog({ kind: 'adjust' })}>Stock adjustment</DropdownMenuItem>}
                {canUpdate && <DropdownMenuItem onClick={() => setDialog({ kind: 'transfer' })}>Stock transfer</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Workflows (Phase 5)</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={phase5('Stock take', 'The stock-take workflow (freeze → count → review → post) arrives in Phase 5. Freezing snapshots expected quantities and the frozen unit cost atomically (migration 0036); posting routes the net variance through the inventory posting engine to 5050 Inventory Adjustments.')}
                >
                  Stock take
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={phase5('Supplier return', 'The supplier-return workflow arrives in Phase 5. Inventory leaves at weighted-average cost; Accounts Payable and input VAT unwind at the supplier credit value; the difference posts to 5060 Purchase Price Variance.')}
                >
                  Supplier return
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={phase5('Opening stock', 'The opening-stock batch workflow arrives in Phase 5. It previews the DR Inventory / CR Opening Balance Equity entry and posts only on explicit confirmation.')}
                >
                  Opening stock
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Link to="/reports" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              <FileBarChart2Icon data-icon="inline-start" />
              Reports
            </Link>
          </>
        }
      />

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          <FigureBlock label="Inventory value" value={formatCurrency(totals.stockValueAtCost)} hint="At weighted-average cost" />
          <FigureBlock
            label="Items in stock"
            value={String(trackedInStock)}
            hint={`${warehouses.length} location${warehouses.length === 1 ? '' : 's'}`}
          />
          <FigureBlock
            label="Low stock"
            value={String(lowStock.length)}
            hint="At or below reorder level"
            tone={lowStock.length > 0 ? 'warning' : 'default'}
          />
          <FigureBlock
            label="Out of stock"
            value={String(outOfStock.length)}
            hint="Nothing on hand"
            tone={outOfStock.length > 0 ? 'negative' : 'default'}
          />
          <FigureBlock
            label="Activity (30 days)"
            value={String(recentActivity)}
            hint="Stock movements recorded"
          />
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(22rem,26rem)]">
        {loading ? (
          <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <p className="text-sm">Loading inventory…</p>
          </div>
        ) : error ? (
          <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <span>{error.message}</span>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <SectionCard title="Inventory register" description="Every item with its stock position, valuation and margin." bodyClassName="p-4 sm:p-5">
            <InventoryTable
              products={products}
              balances={balances}
              categories={categories}
              suppliers={suppliers}
              warehouses={warehouses}
              onSelect={(p) => setSelectedId(p.id)}
            />
          </SectionCard>
        )}

        <InventoryReconciliationCard
          result={reconciliation.result}
          loading={reconciliation.loading}
          error={reconciliation.error}
          onRefresh={() => void reconciliation.refetch()}
        />
      </div>

      <InventoryItemDetailSheet
        product={selectedProduct}
        movements={movements}
        balances={balances}
        warehouses={warehouses}
        categories={categories}
        suppliers={suppliers}
        taxRates={taxRates}
        open={Boolean(selectedId)}
        onOpenChange={(next) => {
          if (!next) setSelectedId(undefined);
        }}
        onEdit={
          selectedProduct && canUpdate
            ? () => {
                const p = selectedProduct;
                setSelectedId(undefined);
                setDialog({ kind: 'edit-item', product: p });
              }
            : undefined
        }
      />

      {(dialog?.kind === 'new-item' || dialog?.kind === 'edit-item') && (
        <ProductFormModal
          product={dialog.kind === 'edit-item' ? dialog.product : undefined}
          onSubmit={handleItemSubmit}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'adjust' && (
        <StockAdjustmentFormModal
          products={products}
          warehouses={warehouses}
          onSubmitAdjustment={async (input) => {
            await adjustStock(input);
            await afterMutation();
            setDialog(null);
          }}
          onSubmitOpening={async (input) => {
            await recordOpeningStock(input);
            await afterMutation();
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'transfer' && (
        <StockTransferFormModal
          products={products}
          warehouses={warehouses}
          onSubmit={async (input) => {
            await transferStock(input);
            await afterMutation();
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}

      <ConfirmDialog
        open={dialog?.kind === 'phase5'}
        onOpenChange={(next) => {
          if (!next) setDialog(null);
        }}
        title={dialog?.kind === 'phase5' ? dialog.title : ''}
        description={dialog?.kind === 'phase5' ? dialog.description : ''}
        confirmLabel="Got it"
        cancelLabel="Close"
        onConfirm={() => setDialog(null)}
      />
    </div>
  );
}
