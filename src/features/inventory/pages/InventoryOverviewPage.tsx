import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDownIcon,
  FileBarChart2Icon,
  Loader2,
  MoreHorizontalIcon,
  PackagePlusIcon,
  UploadIcon,
} from 'lucide-react';
import type { Product } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { formatCurrency } from '@/lib/app/format';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';
import { ImportWizard } from '@/features/import/components/ImportWizard';
import { productImportAdapter, openingStockImportAdapter, stockTakeCountImportAdapter } from '@/features/import/adapters';
import { ExportMenu } from '@/features/export/components/ExportMenu';
import { PrintableReport } from '@/features/export/components/PrintableReport';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { useProducts } from '../hooks/useProducts';
import { useStockAlerts } from '../hooks/useStockAlerts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useStockMovements } from '../hooks/useStockMovements';
import { useStockBalances } from '../hooks/useStockBalances';
import { useProductCategories } from '../hooks/useProductCategories';
import { InventoryTable } from '../components/InventoryTable';
import { InventoryItemDetailSheet } from '../components/InventoryItemDetailSheet';
import { ProductFormModal } from '../components/ProductFormModal';
import { calculateInventoryTotals } from '../utils/calculateInventoryTotals';
import { STOCK_STATE_LABEL, type InventoryRow } from '../utils/buildInventoryRows';
import type { CreateProductDTO, UpdateProductDTO } from '../services/productService';

const INVENTORY_EXPORT_COLUMNS: ExportColumn<InventoryRow>[] = [
  { key: 'sku', header: 'SKU', accessor: (r) => r.product.sku },
  { key: 'name', header: 'Product', accessor: (r) => r.product.name },
  { key: 'category', header: 'Category', accessor: (r) => r.categoryName },
  { key: 'supplier', header: 'Preferred Supplier', accessor: (r) => r.supplierName },
  { key: 'onHand', header: 'On Hand', accessor: (r) => (r.product.trackInventory ? r.onHand : null), align: 'right' },
  { key: 'available', header: 'Available', accessor: (r) => (r.product.trackInventory ? r.available : null), align: 'right' },
  { key: 'committed', header: 'Committed', accessor: (r) => r.committed, align: 'right' },
  { key: 'reorder', header: 'Reorder Level', accessor: (r) => r.reorderLevel ?? null, align: 'right' },
  {
    key: 'avgCost',
    header: 'WAC',
    accessor: (r) => r.avgCost,
    align: 'right',
    formatForPrint: (r) => formatCurrency(r.avgCost),
  },
  {
    key: 'value',
    header: 'Inventory Value',
    accessor: (r) => r.inventoryValue,
    align: 'right',
    formatForPrint: (r) => formatCurrency(r.inventoryValue),
    total: (rows) => rows.reduce((sum, r) => sum + r.inventoryValue, 0),
  },
  {
    key: 'selling',
    header: 'Selling Price',
    accessor: (r) => r.sellingPrice,
    align: 'right',
    formatForPrint: (r) => formatCurrency(r.sellingPrice),
  },
  {
    key: 'margin',
    header: 'Margin %',
    accessor: (r) => r.marginPercent,
    align: 'right',
    formatForPrint: (r) => (r.marginPercent === null ? '—' : `${r.marginPercent.toFixed(1)}%`),
  },
  { key: 'status', header: 'Status', accessor: (r) => (r.product.trackInventory ? STOCK_STATE_LABEL[r.stockState] : r.product.status) },
];

type Dialog =
  | { kind: 'new-item' }
  | { kind: 'edit-item'; product: Product }
  | { kind: 'import' }
  | null;

const RECENT_WINDOW_DAYS = 30;

/**
 * Inventory module home — route `/inventory`. The operational landing page:
 * primary actions, a live summary strip, and the main inventory register.
 * Row click opens the tabbed item detail sheet. Everything is real
 * service/hook data — a figure with nothing behind it shows a correct
 * zero/empty state, never a fabricated number.
 *
 * Inventory ↔ GL reconciliation is deliberately NOT on this page — it is an
 * accounting-control function and lives at
 * `/inventory/reports/inventory-reconciliation` (the full report over the
 * Phase-3 `reconcileInventory()` engine). This page does not import or run
 * that engine.
 *
 * Workflow quick actions: New item opens a real form; every stock workflow
 * (adjustment / transfer / stock take / supplier return / opening stock)
 * links straight to its own draft-then-post register under
 * `/inventory/*` (Phase 5) — this page never wires a shortcut that
 * bypasses those lifecycle/posting services with a direct mutation.
 * Import opens the shared import wizard (Phase 6) with the three
 * Inventory adapters — Products, Opening Stock and Stock Take Counts.
 */
export function InventoryOverviewPage() {
  const { products, loading, error, refetch, createProduct, updateProduct } = useProducts();
  const { lowStock, outOfStock } = useStockAlerts();
  const { warehouses } = useWarehouses();
  const { movements } = useStockMovements();
  const { balances } = useStockBalances();
  const { categories } = useProductCategories();
  const { suppliers } = useSuppliers();
  const { taxRates } = useAllTaxRates();

  const canCreate = useCanAccess('inventory', 'create');
  const canUpdate = useCanAccess('inventory', 'update');
  const canImport = useCanAccess('inventory', 'import');
  const canExport = useCanAccess('inventory', 'export');

  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [visibleRows, setVisibleRows] = useState<InventoryRow[]>([]);
  const [activeFilters, setActiveFilters] = useState<{ label: string; value: string }[]>([]);

  const totals = calculateInventoryTotals(products);
  const trackedInStock = products.filter((p) => p.trackInventory && p.quantityOnHand > 0).length;
  const recentActivity = useMemo(() => {
    const cutoff = Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return movements.filter((m) => new Date(m.movementDate ?? m.createdAt).getTime() >= cutoff).length;
  }, [movements]);

  const selectedProduct = products.find((p) => p.id === selectedId);

  async function handleItemSubmit(data: CreateProductDTO | UpdateProductDTO) {
    if (dialog?.kind === 'edit-item') await updateProduct(dialog.product.id, data as UpdateProductDTO);
    else await createProduct(data as CreateProductDTO);
    setDialog(null);
    await refetch();
  }

  const exportDataset: ExportDataset<InventoryRow> = {
    title: 'Inventory Stock on Hand',
    subtitle: `${visibleRows.length} of ${products.length} items`,
    filters: activeFilters,
    columns: INVENTORY_EXPORT_COLUMNS,
    rows: visibleRows,
    filename: `inventory-stock-on-hand-${new Date().toISOString().slice(0, 10)}`,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inventory"
        description="Goods held for sale or consumption — valuation, stock levels and the tools to keep them accurate."
        actions={
          <>
            {/* Primary action — the one green button. */}
            {canCreate && (
              <Button size="sm" onClick={() => setDialog({ kind: 'new-item' })}>
                <PackagePlusIcon data-icon="inline-start" />
                New item
              </Button>
            )}

            {/* Grouped workflows. */}
            {canUpdate && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
                  Stock actions
                  <ChevronDownIcon data-icon="inline-end" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Workflows</DropdownMenuLabel>
                    <DropdownMenuItem render={<Link to="/inventory/adjustments" />}>Stock adjustment</DropdownMenuItem>
                    <DropdownMenuItem render={<Link to="/inventory/transfers" />}>Stock transfer</DropdownMenuItem>
                    <DropdownMenuItem render={<Link to="/inventory/stock-takes" />}>Stock take</DropdownMenuItem>
                    <DropdownMenuItem render={<Link to="/inventory/supplier-returns" />}>Supplier return</DropdownMenuItem>
                    <DropdownMenuItem render={<Link to="/inventory/opening-stock" />}>Opening stock</DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem render={<Link to="/inventory/operations" />}>View all operations</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Utility actions — inline from md up, folded into the overflow menu below it. */}
            {canImport && (
              <Button
                size="sm"
                variant="outline"
                className="hidden md:inline-flex"
                onClick={() => setDialog({ kind: 'import' })}
              >
                <UploadIcon data-icon="inline-start" />
                Import
              </Button>
            )}
            <span className="hidden md:contents">
              <ExportMenu dataset={exportDataset} allowed={canExport} />
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="hidden lg:inline-flex"
              render={<Link to="/inventory/reports" />}
            >
              <FileBarChart2Icon data-icon="inline-start" />
              Reports
            </Button>

            {/* Overflow: everything that isn't shown inline at the current width. */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="sm"
                    variant="outline"
                    className="lg:hidden"
                    aria-label="More inventory actions"
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  {canImport && (
                    <DropdownMenuItem className="md:hidden" onClick={() => setDialog({ kind: 'import' })}>
                      <UploadIcon data-icon="inline-start" />
                      Import items
                    </DropdownMenuItem>
                  )}
                  {canExport && (
                    <DropdownMenuItem className="md:hidden" onClick={() => window.print()}>
                      Print / export
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem render={<Link to="/inventory/reports" />}>
                    <FileBarChart2Icon data-icon="inline-start" />
                    Inventory reports
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <SectionCard bodyClassName="p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
            onVisibleRowsChange={(rows, filters) => {
              setVisibleRows(rows);
              setActiveFilters(filters);
            }}
          />
        </SectionCard>
      )}

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

      <PrintableReport dataset={exportDataset} className="hidden print:block" />

      {dialog?.kind === 'import' && (
        <ImportWizard
          adapters={[productImportAdapter, openingStockImportAdapter, stockTakeCountImportAdapter]}
          onClose={() => setDialog(null)}
          onImported={() => {
            void refetch();
          }}
        />
      )}
    </div>
  );
}
