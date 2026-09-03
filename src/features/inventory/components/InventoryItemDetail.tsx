import { Fragment, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RelatedRecordType, ResolvedSourceDocument } from '@/components/app/record-page';
import type {
  Bill,
  Invoice,
  Product,
  ProductCategory,
  StockBalance,
  StockMovement,
  Supplier,
  TaxRate,
  Warehouse,
} from '@/types';
import { RecordDetailField, RecordDetailSection } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { StatusBadge } from '@/components/app/status-badge';
import { Amount } from '@/components/app/figure';
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

export interface InventoryItemDetailProps {
  product: Product;
  movements: StockMovement[];
  balances: StockBalance[];
  warehouses: Warehouse[];
  categories: ProductCategory[];
  suppliers: Supplier[];
  taxRates: TaxRate[];
  /** True while the tax-rate list is still loading — so a valid id is shown as "…" not "Unknown". */
  taxRatesPending?: boolean;
  invoices?: Invoice[];
  bills?: Bill[];
  customers?: { id: string; name: string }[];
  /** Source-document resolution + accounting trace + preview-overlay callback for the movement ledger. */
  ledgerHelpers?: MovementLedgerHelpers;
}

/**
 * The per-movement accounting trace shown in the expanded ledger panel —
 * journal number/link, the inventory GL account and its contra, the engine
 * posting key and reversal evidence. Built by InventoryItemDetailPage from
 * the loaded documents + journal entries (this component stays presentational).
 */
export interface MovementAccounting {
  journalNumber?: string;
  journalEntryId?: string;
  /** The inventoryPostingEngine idempotency key, e.g. `invoice:<id>:post`. */
  postingKey?: string;
  /** Always the inventory asset account, "1200 Inventory". */
  inventoryAccount: string;
  /** COGS / GRNI / Inventory Adjustment / PPV, depending on the movement type. */
  contraAccount?: string;
  /** One line of plain English on the inventory ↔ contra relationship (COGS/AP/AR). */
  contraRelationship?: string;
  isReversal?: boolean;
}

export interface MovementLedgerHelpers {
  /** Resolve a movement's source into a human doc number + route + preview type. Never returns a UUID. */
  resolveSource?: (m: StockMovement) => ResolvedSourceDocument | undefined;
  /** The accounting trace for a movement's expanded panel. */
  resolveAccounting?: (m: StockMovement) => MovementAccounting | undefined;
  /** Open <RelatedRecordPreview> over the current page instead of navigating away. */
  onOpenPreview?: (type: RelatedRecordType, id: string, title: string) => void;
}

/** Fallback label when the page did not supply a `resolveSource` helper. */
const SOURCE_LABEL: Record<string, string> = {
  invoice: 'Invoice',
  bill: 'Bill',
  credit_note: 'Credit note',
  purchase_order: 'Purchase order',
  stock_adjustment: 'Stock adjustment',
  stock_transfer: 'Stock transfer',
  stock_take: 'Stock take',
  opening_stock_batch: 'Opening stock',
  supplier_return: 'Supplier return',
  reversal: 'Reversal',
};

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

/**
 * Stock movement ledger — one row per movement with the columns needed to
 * tell the whole story (date, movement, qty, warehouse, source, party,
 * unit cost, value, resulting balance), the source document shown as its
 * human number (INV-1061, BILL-2005 …) and linked where a detail route
 * exists. Each row expands to a full evidence panel with the raw ids folded
 * under "Technical details".
 */
/** The source cell — a human doc number that opens a preview overlay, a link, or plain text. Never a UUID. */
function SourceCell({
  movement,
  src,
  onOpenPreview,
}: {
  movement: StockMovement;
  src: ResolvedSourceDocument | undefined;
  onOpenPreview?: MovementLedgerHelpers['onOpenPreview'];
}) {
  const fallbackLabel = movement.sourceDocumentType ? SOURCE_LABEL[movement.sourceDocumentType] : undefined;
  const primary = src?.number ?? src?.label ?? fallbackLabel;
  if (!primary) return <span className="text-muted-foreground">—</span>;

  const title = src?.number ? `${src.label} ${src.number}` : (src?.label ?? primary);
  const suffix = src?.number && src.label ? <span className="ml-1 text-muted-foreground">· {src.label}</span> : null;

  if (src?.previewType && src.id && onOpenPreview) {
    // Anchor (real href, so middle-click / open-in-new-tab still work) whose
    // normal click opens <RelatedRecordPreview> OVER the page instead of navigating.
    return (
      <>
        <Link
          to={src.path ?? '#'}
          className="font-medium text-brand hover:underline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenPreview(src.previewType!, src.id!, title);
          }}
        >
          {primary}
        </Link>
        {suffix}
      </>
    );
  }
  if (src?.path) {
    return (
      <>
        <Link to={src.path} className="font-medium text-brand hover:underline" onClick={(e) => e.stopPropagation()}>
          {primary}
        </Link>
        {suffix}
      </>
    );
  }
  return (
    <>
      <span className="text-foreground">{primary}</span>
      {suffix}
    </>
  );
}

/**
 * Stock movement ledger — one row per movement with the columns needed to
 * tell the whole story (date, movement, qty, warehouse, source, party,
 * unit cost, value, resulting balance). The source document shows its
 * human number (INV-1061, BILL-2005 …) and — where the type is previewable
 * — opens <RelatedRecordPreview> OVER this page rather than navigating
 * away. Each row expands to a full evidence panel: Movement / Source /
 * Accounting, with the raw ids folded under "Technical details".
 */
function MovementLedger({
  movements,
  warehouseName,
  resolveParty,
  helpers,
}: {
  movements: StockMovement[];
  warehouseName: (id: string) => string;
  resolveParty: (m: StockMovement) => string | undefined;
  helpers: MovementLedgerHelpers;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (movements.length === 0) {
    return <p className="text-sm text-muted-foreground">This item has no stock movements.</p>;
  }

  // Resulting balance, computed forwards from the earliest movement so the
  // running total is only shown when it is genuinely derivable (a
  // contiguous, fully-present movement history).
  const chronological = [...movements].sort((a, b) => (a.movementDate ?? a.createdAt).localeCompare(b.movementDate ?? b.createdAt));
  const balanceAfter = new Map<string, number>();
  let running = 0;
  for (const m of chronological) {
    running += m.quantityDelta;
    balanceAfter.set(m.id, running);
  }

  const directionLabel = (m: StockMovement): string | undefined => {
    if (m.type === 'transfer_in') return `Into ${warehouseName(m.warehouseId)}`;
    if (m.type === 'transfer_out') return `Out of ${warehouseName(m.warehouseId)}`;
    return undefined;
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2 text-left">Movement</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="px-3 py-2 text-left">Warehouse</th>
            <th className="px-3 py-2 text-left">Source document</th>
            <th className="px-3 py-2 text-left">Party</th>
            <th className="px-3 py-2 text-right">Unit cost</th>
            <th className="px-3 py-2 text-right">Value</th>
            <th className="px-3 py-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => {
            const isOpen = expanded === m.id;
            const src = helpers.resolveSource?.(m);
            const acc = isOpen ? helpers.resolveAccounting?.(m) : undefined;
            const party = resolveParty(m);
            const bal = balanceAfter.get(m.id);
            return (
              <Fragment key={m.id}>
                <tr
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                  onClick={() => setExpanded(isOpen ? null : m.id)}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
                      {formatDate(m.movementDate ?? m.createdAt)}
                    </span>
                  </td>
                  <td className="px-3 py-2">{MOVEMENT_TYPE_LABELS[m.type]}</td>
                  <td className={cn('figure px-3 py-2 text-right tabular-nums', m.quantityDelta < 0 && 'text-negative')}>
                    {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                  </td>
                  <td className="px-3 py-2">{warehouseName(m.warehouseId)}</td>
                  <td className="px-3 py-2 text-xs">
                    <SourceCell movement={m} src={src} onOpenPreview={helpers.onOpenPreview} />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{party ?? '—'}</td>
                  <td className="figure px-3 py-2 text-right tabular-nums">{m.unitCost != null ? formatCurrency(m.unitCost) : '—'}</td>
                  <td className="figure px-3 py-2 text-right tabular-nums">{m.totalCost != null ? formatCurrency(m.totalCost) : '—'}</td>
                  <td className="figure px-3 py-2 text-right tabular-nums text-muted-foreground">{bal != null ? bal : '—'}</td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-border bg-muted/20 last:border-0">
                    <td colSpan={9} className="px-3 py-3">
                      <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-3">
                        <div>
                          <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Movement</p>
                          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                            <dt className="text-muted-foreground">Type</dt>
                            <dd>{MOVEMENT_TYPE_LABELS[m.type]}</dd>
                            <dt className="text-muted-foreground">Date / time</dt>
                            <dd>{formatDate(m.movementDate ?? m.createdAt)}</dd>
                            <dt className="text-muted-foreground">Quantity</dt>
                            <dd>{m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}</dd>
                            <dt className="text-muted-foreground">Warehouse</dt>
                            <dd>{warehouseName(m.warehouseId)}</dd>
                            {directionLabel(m) ? (
                              <>
                                <dt className="text-muted-foreground">Direction</dt>
                                <dd>{directionLabel(m)}</dd>
                              </>
                            ) : null}
                            <dt className="text-muted-foreground">Historical unit cost</dt>
                            <dd>{m.unitCost != null ? formatCurrency(m.unitCost) : '—'}</dd>
                            <dt className="text-muted-foreground">Movement value</dt>
                            <dd>{m.totalCost != null ? formatCurrency(m.totalCost) : '—'}</dd>
                            {bal != null ? (
                              <>
                                <dt className="text-muted-foreground">Resulting balance</dt>
                                <dd>{bal}</dd>
                              </>
                            ) : null}
                          </dl>
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Source</p>
                          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                            <dt className="text-muted-foreground">Document type</dt>
                            <dd>{src?.label ?? (m.sourceDocumentType ? SOURCE_LABEL[m.sourceDocumentType] : '—')}</dd>
                            <dt className="text-muted-foreground">Document number</dt>
                            <dd>
                              {src && (src.number || src.label) ? (
                                <SourceCell movement={m} src={src} onOpenPreview={helpers.onOpenPreview} />
                              ) : (
                                '—'
                              )}
                            </dd>
                            <dt className="text-muted-foreground">Party</dt>
                            <dd>{party ?? '—'}</dd>
                            {m.notes ? (
                              <>
                                <dt className="text-muted-foreground">Notes</dt>
                                <dd>{m.notes}</dd>
                              </>
                            ) : null}
                          </dl>
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Accounting</p>
                          {acc ? (
                            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                              <dt className="text-muted-foreground">Journal entry</dt>
                              <dd>
                                {acc.journalEntryId ? (
                                  <Link
                                    to={`/accounting/journals?record=${acc.journalEntryId}`}
                                    className="text-brand hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {acc.journalNumber ?? 'View journal entry'}
                                  </Link>
                                ) : (
                                  acc.journalNumber ?? '—'
                                )}
                              </dd>
                              <dt className="text-muted-foreground">Inventory GL</dt>
                              <dd>{acc.inventoryAccount}</dd>
                              {acc.contraAccount ? (
                                <>
                                  <dt className="text-muted-foreground">Contra</dt>
                                  <dd>{acc.contraAccount}</dd>
                                </>
                              ) : null}
                              {acc.contraRelationship ? (
                                <>
                                  <dt className="text-muted-foreground">Relationship</dt>
                                  <dd>{acc.contraRelationship}</dd>
                                </>
                              ) : null}
                              {acc.postingKey ? (
                                <>
                                  <dt className="text-muted-foreground">Posting key</dt>
                                  <dd className="font-mono text-[11px]">{acc.postingKey}</dd>
                                </>
                              ) : null}
                              {acc.isReversal || m.reversalOfMovementId ? (
                                <>
                                  <dt className="text-muted-foreground">Reversal</dt>
                                  <dd>{m.reversalOfMovementId ? 'Reverses an earlier movement' : 'Reversing entry'}</dd>
                                </>
                              ) : null}
                            </dl>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No linked journal entry — this movement type does not post to the general ledger, or the entry is not loaded.
                            </p>
                          )}
                        </div>
                      </div>
                      <details className="mt-3 text-xs">
                        <summary className="cursor-pointer text-muted-foreground">Technical details</summary>
                        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
                          <dt>Movement UUID</dt>
                          <dd>{m.id}</dd>
                          {m.sourceDocumentId ? (
                            <>
                              <dt>Source UUID</dt>
                              <dd>{m.sourceDocumentId}</dd>
                            </>
                          ) : null}
                          {m.sourceDocumentLineId ? (
                            <>
                              <dt>Line UUID</dt>
                              <dd>{m.sourceDocumentLineId}</dd>
                            </>
                          ) : null}
                          {m.reversalOfMovementId ? (
                            <>
                              <dt>Reverses</dt>
                              <dd>{m.reversalOfMovementId}</dd>
                            </>
                          ) : null}
                          {m.createdBy ? (
                            <>
                              <dt>Recorded by</dt>
                              <dd>{m.createdBy}</dd>
                            </>
                          ) : null}
                        </dl>
                      </details>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
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

function AccountRow({ role, product, category }: { role: AccountRole; product: Product; category: ProductCategory | undefined }) {
  return <RecordDetailField label={ROLE_LABEL[role]} value={accountRoleSource(role, product, category)} />;
}

/**
 * The tabbed body of the Inventory Item detail — Overview / Stock /
 * Purchasing / Sales / Transactions / Accounting / Documents / Activity.
 * Rendered by InventoryItemDetailPage inside RecordPageShell (full page
 * width — the Transactions ledger now has real room). Contains no shell
 * chrome of its own.
 */
export function InventoryItemDetail({
  product,
  movements,
  balances,
  warehouses,
  categories,
  suppliers,
  taxRates,
  taxRatesPending,
  invoices = [],
  bills = [],
  customers = [],
  ledgerHelpers = {},
}: InventoryItemDetailProps) {
  const [tab, setTab] = useState('overview');

  const warehouseById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);
  const invoiceById = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);
  const billById = useMemo(() => new Map(bills.map((b) => [b.id, b])), [bills]);
  const category = product.categoryId ? categories.find((c) => c.id === product.categoryId) : undefined;

  const warehouseName = (id: string) => warehouseById.get(id)?.name ?? id;

  function resolveParty(m: StockMovement): string | undefined {
    if (m.sourceDocumentType === 'invoice' || m.sourceDocumentType === 'credit_note') {
      const inv = m.sourceDocumentId ? invoiceById.get(m.sourceDocumentId) : undefined;
      return inv ? customerById.get(inv.customerId) : undefined;
    }
    if (m.sourceDocumentType === 'bill') {
      const bill = m.sourceDocumentId ? billById.get(m.sourceDocumentId) : undefined;
      return bill ? supplierById.get(bill.supplierId) : undefined;
    }
    return undefined;
  }

  const productMovements = useMemo(
    () =>
      movements
        .filter((m) => m.productId === product.id)
        .sort((a, b) => (b.movementDate ?? b.createdAt).localeCompare(a.movementDate ?? a.createdAt)),
    [product, movements],
  );
  const productBalances = useMemo(() => balances.filter((b) => b.productId === product.id), [product, balances]);

  const salesMovements = productMovements.filter((m) => m.type === 'sale' || m.type === 'sales_return');
  const purchaseMovements = productMovements.filter((m) => m.type === 'goods_received' || m.type === 'purchase_return');
  const unitsSold = salesMovements.reduce((s, m) => s + Math.abs(Math.min(m.quantityDelta, 0)), 0);

  const taxLabel = getTaxRateLabel(product.taxRateId, taxRates, { pending: taxRatesPending });

  const TABS: { value: string; label: string; content: React.ReactNode }[] = [
    {
      value: 'overview',
      label: 'Overview',
      content: (
        <RecordDetailSection>
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <RecordDetailField label="Tax rate" value={taxLabel} />
            <RecordDetailField label="Reorder level" value={product.reorderLevel ?? '—'} />
            <RecordDetailField label="Reorder quantity" value={product.reorderQuantity ?? '—'} />
            <RecordDetailField label="Preferred stock level" value={product.preferredStockLevel ?? '—'} />
          </div>
          {product.description && <RecordDetailField label="Description" value={product.description} className="mt-4" />}
          {product.salesDescription && <RecordDetailField label="Sales description" value={product.salesDescription} />}
          {product.purchaseDescription && <RecordDetailField label="Purchase description" value={product.purchaseDescription} />}
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
                  <td className="figure px-3 py-2 text-right tabular-nums">{b.quantityOnHand - b.quantityCommitted + b.quantityOnOrder}</td>
                </tr>
              ))}
            </SubTable>
          )}
          <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
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
              {purchaseMovements.slice(0, 30).map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(m.movementDate ?? m.createdAt)}</td>
                  <td className="px-3 py-2">{MOVEMENT_TYPE_LABELS[m.type]}</td>
                  <td className="figure px-3 py-2 text-right tabular-nums">{m.quantityDelta}</td>
                  <td className="figure px-3 py-2 text-right tabular-nums">{m.unitCost != null ? formatCurrency(m.unitCost) : '—'}</td>
                  <td className="figure px-3 py-2 text-right tabular-nums">{m.totalCost != null ? formatCurrency(m.totalCost) : '—'}</td>
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
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <RecordDetailField label="Selling price" value={<Amount value={product.unitPrice} />} />
            <RecordDetailField label="Units sold" value={unitsSold} />
            <RecordDetailField
              label="Margin"
              value={product.unitPrice > 0 ? `${(((product.unitPrice - product.costPrice) / product.unitPrice) * 100).toFixed(1)}%` : '—'}
            />
            <RecordDetailField label="Margin per unit" value={<Amount value={product.unitPrice - product.costPrice} />} />
          </div>
          {salesMovements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales history yet.</p>
          ) : (
            <SubTable head={['Date', 'Type', 'Qty', 'Ref']}>
              {salesMovements.slice(0, 30).map((m) => (
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
          <p className="mb-3 text-xs text-muted-foreground">
            Every stock event for this item, newest first. Click a row for the full evidence — source document, party and accounting trace.
          </p>
          <MovementLedger
            movements={productMovements}
            warehouseName={warehouseName}
            resolveParty={resolveParty}
            helpers={ledgerHelpers}
          />
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
          <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <AccountRow role="inventory" product={product} category={category} />
            <AccountRow role="cogs" product={product} category={category} />
            <AccountRow role="revenue" product={product} category={category} />
            <AccountRow role="adjustment" product={product} category={category} />
            <AccountRow role="purchase_price_variance" product={product} category={category} />
            <RecordDetailField
              label="VAT"
              value={
                product.taxRateId
                  ? `${taxLabel} → 2100 Output / 2110 Input`
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
            Document attachments arrive with the shared document framework. This item's paper trail is its stock movement
            ledger (Transactions tab) and audit history.
          </p>
        </RecordDetailSection>
      ),
    },
    {
      value: 'audit',
      label: 'Activity',
      content: (
        <RecordAuditHistorySection
          recordType="Product"
          recordId={product.id}
          title="Record activity"
          subtitle="Changes and important actions performed on this item's master data — who changed a price, a cost mapping or the item's configuration, and when. Stock arrivals and issues live in the Transactions tab."
          emptyMessage="No recorded changes to this product's master data yet."
        />
      ),
    },
  ];

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="w-full min-w-0">
      <TabsList variant="line" className="no-scrollbar -mb-px w-full justify-start overflow-x-auto pr-2 pb-px">
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className="flex-none">
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {TABS.map((t) => (
        <TabsContent key={t.value} value={t.value} keepMounted className="min-w-0 pt-5">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
