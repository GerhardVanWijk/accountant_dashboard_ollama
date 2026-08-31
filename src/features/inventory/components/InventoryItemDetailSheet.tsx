import { useMemo, useState } from 'react';
import type { Product, ProductCategory, StockBalance, StockMovement, Supplier, TaxRate, Warehouse } from '@/types';
import {
  RecordDetailField,
  RecordDetailSection,
  RecordDetailSheet,
} from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { StatusBadge } from '@/components/app/status-badge';
import { Amount } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/shadcn/tabs';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { getTaxRateLabel, MOVEMENT_TYPE_LABELS } from '../constants';

/** The standard Chart-of-Accounts code + name for each inventory posting role. */
const GENERIC_ACCOUNT: Record<AccountRole, { code: string; name: string }> = {
  inventory: { code: '1200', name: 'Inventory' },
  cogs: { code: '5000', name: 'Cost of Goods Sold' },
  revenue: { code: '4000', name: 'Sales Revenue' },
  adjustment: { code: '5050', name: 'Inventory Adjustments' },
  purchase_price_variance: { code: '5060', name: 'Purchase Price Variance' },
};

export interface InventoryItemDetailSheetProps {
  product: Product | undefined;
  movements: StockMovement[];
  balances: StockBalance[];
  warehouses: Warehouse[];
  categories: ProductCategory[];
  suppliers: Supplier[];
  taxRates: TaxRate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
}

function SubTable({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {head.map((h, i) => (
              <th
                key={h}
                className={cn(
                  'px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase',
                  i === 0 ? 'text-left' : 'text-right',
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

type AccountRole = 'inventory' | 'cogs' | 'revenue' | 'adjustment' | 'purchase_price_variance';

const ROLE_LABEL: Record<AccountRole, string> = {
  inventory: 'Inventory Asset',
  cogs: 'Cost of Goods Sold',
  revenue: 'Sales Revenue',
  adjustment: 'Inventory Adjustment',
  purchase_price_variance: 'Purchase Price Variance',
};

function accountRoleSource(role: AccountRole, product: Product, category: ProductCategory | undefined): string {
  const productOverride: Partial<Record<AccountRole, string | undefined>> = {
    inventory: product.inventoryAccountId,
    cogs: product.cogsAccountId,
    revenue: product.salesAccountId,
  };
  const categoryMapping: Partial<Record<AccountRole, string | undefined>> = {
    inventory: category?.inventoryAccountId,
    cogs: category?.cogsAccountId,
    revenue: category?.revenueAccountId,
    adjustment: category?.adjustmentAccountId,
  };
  const generic = GENERIC_ACCOUNT[role];
  if (productOverride[role]) return 'Product-specific account override';
  if (categoryMapping[role]) return `Category default (${category?.name})`;
  return `Standard — ${generic.code} ${generic.name}`;
}

function AccountRow({
  role,
  product,
  category,
}: {
  role: AccountRole;
  product: Product;
  category: ProductCategory | undefined;
}) {
  return <RecordDetailField label={ROLE_LABEL[role]} value={accountRoleSource(role, product, category)} />;
}

export function InventoryItemDetailSheet({
  product,
  movements,
  balances,
  warehouses,
  categories,
  suppliers,
  taxRates,
  open,
  onOpenChange,
  onEdit,
}: InventoryItemDetailSheetProps) {
  const [tab, setTab] = useState('overview');

  const warehouseById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const category = product?.categoryId ? categories.find((c) => c.id === product.categoryId) : undefined;

  const productMovements = useMemo(
    () =>
      product
        ? movements
            .filter((m) => m.productId === product.id)
            .sort((a, b) => (b.movementDate ?? b.createdAt).localeCompare(a.movementDate ?? a.createdAt))
        : [],
    [product, movements],
  );
  const productBalances = useMemo(
    () => (product ? balances.filter((b) => b.productId === product.id) : []),
    [product, balances],
  );

  const salesMovements = productMovements.filter((m) => m.type === 'sale' || m.type === 'sales_return');
  const purchaseMovements = productMovements.filter((m) => m.type === 'goods_received' || m.type === 'purchase_return');
  const unitsSold = salesMovements.reduce((s, m) => s + Math.abs(Math.min(m.quantityDelta, 0)), 0);

  const state = product ? 'ready' : 'not-found';

  const TABS: { value: string; label: string; content: React.ReactNode }[] = product
    ? [
        {
          value: 'overview',
          label: 'Overview',
          content: (
            <RecordDetailSection>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <RecordDetailField label="SKU" value={product.sku} />
                <RecordDetailField label="Barcode" value={product.barcode ?? '—'} />
                <RecordDetailField label="Item name" value={product.name} />
                <RecordDetailField label="Type" value={product.type === 'service' ? 'Service' : 'Good'} />
                <RecordDetailField label="Category" value={category?.name ?? product.category ?? '—'} />
                <RecordDetailField label="Unit of measure" value={product.uom ?? '—'} />
                <RecordDetailField label="Stock tracking" value={product.trackInventory ? 'Tracked' : 'Not tracked'} />
                <RecordDetailField label="Active state" value={<StatusBadge status={product.status} />} />
                <RecordDetailField label="Selling price" value={<Amount value={product.unitPrice} />} />
                <RecordDetailField label="Cost / WAC" value={<Amount value={product.costPrice} />} />
                <RecordDetailField label="Valuation method" value={product.valuationMethod === 'fifo' ? 'FIFO' : 'Weighted average'} />
                <RecordDetailField label="Tax rate" value={getTaxRateLabel(product.taxRateId, taxRates)} />
                <RecordDetailField label="Reorder level" value={product.reorderLevel ?? '—'} />
                <RecordDetailField label="Reorder quantity" value={product.reorderQuantity ?? '—'} />
                <RecordDetailField label="Preferred stock level" value={product.preferredStockLevel ?? '—'} />
              </div>
              {product.description && (
                <RecordDetailField label="Description" value={product.description} className="mt-3" />
              )}
              {product.salesDescription && <RecordDetailField label="Sales description" value={product.salesDescription} />}
              {product.purchaseDescription && (
                <RecordDetailField label="Purchase description" value={product.purchaseDescription} />
              )}
            </RecordDetailSection>
          ),
        },
        {
          value: 'stock',
          label: 'Stock',
          content: (
            <RecordDetailSection title="Quantity by warehouse">
              {!product.trackInventory ? (
                <p className="text-sm text-muted-foreground">This item is not stock-tracked.</p>
              ) : productBalances.length === 0 ? (
                <p className="text-sm text-muted-foreground">No stock recorded at any warehouse yet.</p>
              ) : (
                <SubTable head={['Warehouse', 'On hand', 'Committed', 'On order', 'Available']}>
                  {productBalances.map((b) => (
                    <tr key={b.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">{warehouseById.get(b.warehouseId)?.name ?? b.warehouseId}</td>
                      <td className="figure px-3 py-2 text-right tabular-nums">{b.quantityOnHand}</td>
                      <td className="figure px-3 py-2 text-right tabular-nums text-muted-foreground">{b.quantityCommitted}</td>
                      <td className="figure px-3 py-2 text-right tabular-nums text-muted-foreground">{b.quantityOnOrder}</td>
                      <td className="figure px-3 py-2 text-right tabular-nums">
                        {b.quantityOnHand - b.quantityCommitted + b.quantityOnOrder}
                      </td>
                    </tr>
                  ))}
                </SubTable>
              )}
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                <RecordDetailField label="Company on hand" value={product.quantityOnHand} />
                <RecordDetailField label="Reorder level" value={product.reorderLevel ?? '—'} />
                <RecordDetailField label="Current WAC" value={<Amount value={product.costPrice} />} />
                <RecordDetailField
                  label="Stock value"
                  value={<Amount value={product.trackInventory ? product.quantityOnHand * product.costPrice : 0} />}
                />
              </div>
            </RecordDetailSection>
          ),
        },
        {
          value: 'purchasing',
          label: 'Purchasing',
          content: (
            <RecordDetailSection title="Purchasing">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <RecordDetailField
                  label="Preferred supplier"
                  value={product.preferredSupplierId ? supplierById.get(product.preferredSupplierId) ?? '—' : '—'}
                />
                <RecordDetailField label="Supplier item code" value={product.supplierItemCode ?? '—'} />
              </div>
              {purchaseMovements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No purchase history yet.</p>
              ) : (
                <SubTable head={['Date', 'Type', 'Qty', 'Unit cost', 'Value']}>
                  {purchaseMovements.slice(0, 20).map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(m.movementDate ?? m.createdAt)}</td>
                      <td className="px-3 py-2">{MOVEMENT_TYPE_LABELS[m.type]}</td>
                      <td className="figure px-3 py-2 text-right tabular-nums">{m.quantityDelta}</td>
                      <td className="figure px-3 py-2 text-right tabular-nums">
                        {m.unitCost != null ? formatCurrency(m.unitCost) : '—'}
                      </td>
                      <td className="figure px-3 py-2 text-right tabular-nums">
                        {m.totalCost != null ? formatCurrency(m.totalCost) : '—'}
                      </td>
                    </tr>
                  ))}
                </SubTable>
              )}
            </RecordDetailSection>
          ),
        },
        {
          value: 'sales',
          label: 'Sales',
          content: (
            <RecordDetailSection title="Sales">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <RecordDetailField label="Selling price" value={<Amount value={product.unitPrice} />} />
                <RecordDetailField label="Units sold" value={unitsSold} />
                <RecordDetailField
                  label="Margin"
                  value={
                    product.unitPrice > 0
                      ? `${(((product.unitPrice - product.costPrice) / product.unitPrice) * 100).toFixed(1)}%`
                      : '—'
                  }
                />
                <RecordDetailField
                  label="Margin per unit"
                  value={<Amount value={product.unitPrice - product.costPrice} />}
                />
              </div>
              {salesMovements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales history yet.</p>
              ) : (
                <SubTable head={['Date', 'Type', 'Qty', 'Ref']}>
                  {salesMovements.slice(0, 20).map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(m.movementDate ?? m.createdAt)}</td>
                      <td className="px-3 py-2">{MOVEMENT_TYPE_LABELS[m.type]}</td>
                      <td className="figure px-3 py-2 text-right tabular-nums">{m.quantityDelta}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">{m.reference ?? '—'}</td>
                    </tr>
                  ))}
                </SubTable>
              )}
            </RecordDetailSection>
          ),
        },
        {
          value: 'transactions',
          label: 'Transactions',
          content: (
            <RecordDetailSection title="Stock movement ledger">
              {productMovements.length === 0 ? (
                <p className="text-sm text-muted-foreground">This item has no stock movements.</p>
              ) : (
                <SubTable head={['Date', 'Type', 'Qty', 'Unit cost', 'Value', 'Source']}>
                  {productMovements.map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(m.movementDate ?? m.createdAt)}</td>
                      <td className="px-3 py-2">
                        {MOVEMENT_TYPE_LABELS[m.type]}
                        {m.reversalOfMovementId && (
                          <span className="ml-1 text-xs text-muted-foreground">(reverses {m.reversalOfMovementId.slice(0, 8)})</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          'figure px-3 py-2 text-right tabular-nums',
                          m.quantityDelta < 0 && 'text-negative',
                        )}
                      >
                        {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                      </td>
                      <td className="figure px-3 py-2 text-right tabular-nums">
                        {m.unitCost != null ? formatCurrency(m.unitCost) : '—'}
                      </td>
                      <td className="figure px-3 py-2 text-right tabular-nums">
                        {m.totalCost != null ? formatCurrency(m.totalCost) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                        {m.sourceDocumentType ?? m.reference ?? '—'}
                      </td>
                    </tr>
                  ))}
                </SubTable>
              )}
            </RecordDetailSection>
          ),
        },
        {
          value: 'accounting',
          label: 'Accounting',
          content: (
            <RecordDetailSection title="General ledger mapping">
              <p className="text-xs text-muted-foreground">
                How this item posts. Resolution order: product override → category default → standard account.
              </p>
              <div className="mt-2 flex flex-col gap-3">
                <AccountRow role="inventory" product={product} category={category} />
                <AccountRow role="cogs" product={product} category={category} />
                <AccountRow role="revenue" product={product} category={category} />
                <AccountRow role="adjustment" product={product} category={category} />
                <AccountRow role="purchase_price_variance" product={product} category={category} />
                <RecordDetailField
                  label="VAT"
                  value={
                    product.taxRateId
                      ? `${getTaxRateLabel(product.taxRateId, taxRates)} → 2100 Output / 2110 Input`
                      : 'No tax rate — 2100 Output / 2110 Input on the document'
                  }
                />
              </div>
            </RecordDetailSection>
          ),
        },
        {
          value: 'documents',
          label: 'Documents',
          content: (
            <RecordDetailSection title="Documents">
              <p className="text-sm text-muted-foreground">
                Document attachments arrive with the shared document framework. This item's paper trail is its
                stock movement ledger (Transactions tab) and audit history.
              </p>
            </RecordDetailSection>
          ),
        },
        {
          value: 'audit',
          label: 'Audit',
          content: <RecordAuditHistorySection recordType="Product" recordId={product.id} />,
        },
      ]
    : [];

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={product ? `${product.sku} — ${product.name}` : 'Item'}
      titleAdornment={product ? <StatusBadge status={product.status} /> : undefined}
      state={state}
      notFoundMessage="This item could not be found — it may have been deleted."
      className="sm:max-w-2xl"
      actions={
        product && onEdit ? (
          <Button size="sm" onClick={onEdit}>
            Edit item
          </Button>
        ) : undefined
      }
    >
      {product && (
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="w-full">
          <TabsList variant="line" className="w-full justify-start overflow-x-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((t) => (
            <TabsContent key={t.value} value={t.value} keepMounted className="pt-4">
              {t.content}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </RecordDetailSheet>
  );
}
