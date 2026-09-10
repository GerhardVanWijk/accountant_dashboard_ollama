import { useCallback, useMemo, useState } from 'react';
import {
  ArrowLeftRightIcon,
  BoxesIcon,
  ChevronRightIcon,
  CircleDollarSignIcon,
  PackageCheckIcon,
  PercentIcon,
  TagIcon,
  TruckIcon,
  WalletIcon,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  RecordTabs,
  type RecordTab,
  type RelatedRecordType,
  type ResolvedSourceDocument,
} from '@/components/app/record-page';
import type {
  Bill,
  CreditNote,
  Invoice,
  JournalEntry,
  Product,
  ProductCategory,
  StockBalance,
  StockMovement,
  StockTransfer,
  Supplier,
  TaxRate,
  Warehouse,
} from '@/types';
import { quantityAvailable } from '@/types';
import { RecordDetailField, RecordDetailSection } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { StatusBadge } from '@/components/app/status-badge';
import { StatStrip, StatTile, type StatTone } from '@/components/app/stat-tile';
import { SEMANTIC_ICONS } from '@/components/app/semantic-icons';
import { WarehouseReference } from '@/components/app/warehouse-reference';
import { DataTable, type DataTableColumn, type DataTableFilter } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { getTaxRateLabel, MOVEMENT_TYPE_LABELS } from '../constants';
import { applyStockCommitments } from '../utils/applyStockCommitments';
import { commitmentKey } from '../services/stockCommitmentService';
import { getOnOrderForProduct } from '../services/stockOnOrderService';
import { inTransitForProduct } from '../utils/deriveInTransit';
import type { ProductIntegritySummary as IntegritySummary } from '../services/productIntegrity';
import type { MovementAccounting } from '../services/movementAccounting';
import { ProductIntegritySummary } from './ProductIntegritySummary';
import { MovementEvidenceDrawer } from './MovementEvidenceDrawer';
import { hasNoSourceEvidence, type MovementEvidenceContext } from '../utils/movementEvidence';

export type { MovementAccounting } from '../services/movementAccounting';

/** Tab slugs in render order — the `?tab=` whitelist and KPI drill-down targets. */
const TAB_VALUES = ['overview', 'stock', 'purchasing', 'sales', 'transactions', 'accounting', 'documents', 'audit'] as const;

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
  /** Resolves a `credit_note`-sourced movement's customer (its OWN `customerId`, never an invoice lookup — a credit note's `sourceDocumentId` is its own id, not its invoice's). */
  creditNotes?: CreditNote[];
  customers?: { id: string; name: string }[];
  /** Inter-warehouse transfers — used to surface stock dispatched but not yet received (`in_transit`). */
  transfers?: StockTransfer[];
  /** Loaded journal entries, for the Accounting tab's related-entries table. */
  journalEntries?: JournalEntry[];
  /** Resolve an account id to "CODE Name" for the related-journals breakdown. */
  accountLabel?: (id: string) => string;
  /**
   * Derived stock-commitment map (Phase 5A), keyed by
   * `commitmentKey(productId, warehouseId)`. `stock_balances.quantity_committed`
   * is 0 in storage; this hydrates the Stock tab's per-warehouse table and the
   * On hand / Committed / Available summary with the real value. Supplied by
   * `InventoryItemDetailPage` via `useStockCommitments()`.
   */
  commitments?: Map<string, number>;
  /**
   * Derived quantity-on-order map (keyed by `commitmentKey`) from open
   * purchase orders — `stock_balances.quantity_on_order` is 0 in storage.
   * Surfaced as its own figure; deliberately NOT folded into "Available".
   */
  onOrder?: Map<string, number>;
  /**
   * Per-product stock integrity — the slice of `reconcileInventory()`'s
   * findings that name this product (built by the page from the company
   * reconciliation result). Never recomputed here.
   */
  integrity?: { summary: IntegritySummary | null; loading?: boolean; error?: Error | null };
  /** Chart of accounts — lets the Accounting tab resolve each posting role to a
   * real account and link it to the account record (`/accounting/coa?record=`). */
  accounts?: { id: string; code: string; name: string }[];
  /** Source-document resolution + accounting trace + preview-overlay callback for the movement ledger. */
  ledgerHelpers?: MovementLedgerHelpers;
}

export interface MovementLedgerHelpers {
  /** Resolve a movement's source into a human doc number + route + preview type. Never returns a UUID. */
  resolveSource?: (m: StockMovement) => ResolvedSourceDocument | undefined;
  /** The accounting trace for a movement's evidence drawer. */
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
  delivery_note: 'Delivery note',
  return_note: 'Return note',
  reversal: 'Reversal',
};

/**
 * Compact, restrained "record workspace" section for the Overview tab — a
 * hairline border, a small uppercase header, modest padding. Deliberately
 * NOT a dashboard card: it groups a handful of aligned label/value rows the
 * way a structured accounting record reads, and several sit two-up on a
 * desktop column without dominating the page.
 */
function OverviewSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4', className)}>
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** A two-up label/value grid inside an OverviewSection — narrow columns wrap cleanly. */
function OverviewFields({ children }: { children: React.ReactNode }) {
  return <div className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">{children}</div>;
}

/**
 * An Accounting-summary figure that drills into the tab holding its evidence
 * (movements/costing for value & COGS, the sales history for revenue &
 * margin). Never recomputes anything — `value` is passed in already formatted.
 */
function AccountingFigure({
  label,
  value,
  onDrill,
}: {
  label: string;
  value: React.ReactNode;
  onDrill: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onDrill}
      className="group/fig flex min-w-0 flex-col gap-0.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        <ChevronRightIcon className="size-3 opacity-0 transition-opacity group-hover/fig:opacity-100 group-focus-visible/fig:opacity-100" aria-hidden="true" />
      </span>
      <span className="text-sm text-foreground [overflow-wrap:anywhere] group-hover/fig:text-brand">{value}</span>
    </button>
  );
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

interface LedgerRow {
  movement: StockMovement;
  warehouseName: string;
  warehouse?: Warehouse;
  party?: string;
  src?: ResolvedSourceDocument;
  balanceAfter?: number;
  missingEvidence: boolean;
}

/**
 * Stock traceability ledger — one row per movement (date, movement, qty in /
 * qty out, running balance, warehouse, source document, party, unit cost,
 * value). The source document shows its human number and — where previewable
 * — opens <RelatedRecordPreview> over the page. Clicking anywhere else on the
 * row opens the full evidence drawer. Filterable by movement type, direction
 * and "exceptions only" (movements with no source link).
 */
function TraceabilityLedger({
  movements,
  warehouseName,
  resolveWarehouse,
  resolveParty,
  helpers,
  onSelect,
}: {
  movements: StockMovement[];
  warehouseName: (id: string) => string;
  resolveWarehouse: (id: string) => Warehouse | undefined;
  resolveParty: (m: StockMovement) => string | undefined;
  helpers: MovementLedgerHelpers;
  onSelect: (m: StockMovement, balanceAfter?: number) => void;
}) {
  const rows = useMemo<LedgerRow[]>(() => {
    // Running balance forward from the earliest movement, so it is only shown
    // when genuinely derivable (a contiguous, fully-present history).
    const chronological = [...movements].sort((a, b) =>
      (a.movementDate ?? a.createdAt).localeCompare(b.movementDate ?? b.createdAt),
    );
    const balanceAfter = new Map<string, number>();
    let running = 0;
    for (const m of chronological) {
      running += m.quantityDelta;
      balanceAfter.set(m.id, running);
    }
    return movements.map((m) => ({
      movement: m,
      warehouseName: warehouseName(m.warehouseId),
      warehouse: resolveWarehouse(m.warehouseId),
      party: resolveParty(m),
      src: helpers.resolveSource?.(m),
      balanceAfter: balanceAfter.get(m.id),
      missingEvidence: hasNoSourceEvidence(m),
    }));
  }, [movements, warehouseName, resolveWarehouse, resolveParty, helpers]);

  if (movements.length === 0) {
    return <p className="text-sm text-muted-foreground">This item has no stock movements.</p>;
  }

  const columns: DataTableColumn<LedgerRow>[] = [
    {
      key: 'date',
      header: 'Date',
      cell: (r) => <span className="whitespace-nowrap">{formatDate(r.movement.movementDate ?? r.movement.createdAt)}</span>,
      sortValue: (r) => r.movement.movementDate ?? r.movement.createdAt,
    },
    {
      key: 'movement',
      header: 'Movement',
      cell: (r) => {
        const whRef = r.warehouse?.code?.trim() || r.warehouseName;
        const dir =
          r.movement.type === 'transfer_in'
            ? `→ ${whRef}`
            : r.movement.type === 'transfer_out'
              ? `${whRef} →`
              : undefined;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5">
              {MOVEMENT_TYPE_LABELS[r.movement.type]}
              {r.missingEvidence && (
                <span
                  className="rounded border border-status-warning-outline bg-status-warning-surface/50 px-1 py-px text-[0.65rem] font-medium text-status-warning"
                  title="No source document link"
                >
                  no source
                </span>
              )}
              {(r.movement.reversalOfMovementId || r.movement.type === 'correction') && (
                <span
                  className="rounded border border-border bg-muted px-1 py-px text-[0.65rem] text-muted-foreground"
                  title="Reverses an earlier movement"
                >
                  reversal
                </span>
              )}
            </span>
            {dir && <span className="text-xs text-muted-foreground">{dir}</span>}
          </div>
        );
      },
      sortValue: (r) => r.movement.type,
    },
    {
      key: 'in',
      header: 'Qty in',
      align: 'right',
      cell: (r) => (r.movement.quantityDelta > 0 ? <span className="figure tabular-nums text-status-positive">+{r.movement.quantityDelta}</span> : <span className="text-muted-foreground">—</span>),
      sortValue: (r) => (r.movement.quantityDelta > 0 ? r.movement.quantityDelta : 0),
    },
    {
      key: 'out',
      header: 'Qty out',
      align: 'right',
      cell: (r) => (r.movement.quantityDelta < 0 ? <span className="figure tabular-nums text-status-negative">{r.movement.quantityDelta}</span> : <span className="text-muted-foreground">—</span>),
      sortValue: (r) => (r.movement.quantityDelta < 0 ? -r.movement.quantityDelta : 0),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      cell: (r) => <span className="figure tabular-nums text-muted-foreground">{r.balanceAfter ?? '—'}</span>,
      sortValue: (r) => r.balanceAfter ?? 0,
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      cell: (r) => <WarehouseReference warehouse={r.warehouse} fallback={r.warehouseName} />,
      sortValue: (r) => r.warehouse?.code ?? r.warehouseName,
      hideBelowLg: true,
    },
    {
      key: 'source',
      header: 'Source document',
      cell: (r) => <SourceCell movement={r.movement} src={r.src} onOpenPreview={helpers.onOpenPreview} />,
      sortValue: (r) => r.src?.number ?? r.src?.label ?? '',
    },
    {
      key: 'party',
      header: 'Party',
      cell: (r) => <span className="text-muted-foreground">{r.party ?? '—'}</span>,
      sortValue: (r) => r.party ?? '',
      hideBelowLg: true,
    },
    {
      key: 'unitCost',
      header: 'Unit cost',
      align: 'right',
      cell: (r) => (r.movement.unitCost != null ? <span className="figure tabular-nums">{formatCurrency(r.movement.unitCost)}</span> : <span className="text-muted-foreground">—</span>),
      sortValue: (r) => r.movement.unitCost ?? -1,
      hideBelowXl: true,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      cell: (r) => (r.movement.totalCost != null ? <span className="figure tabular-nums">{formatCurrency(r.movement.totalCost)}</span> : <span className="text-muted-foreground">—</span>),
      sortValue: (r) => r.movement.totalCost ?? -1,
    },
  ];

  const filters: DataTableFilter<LedgerRow>[] = [
    {
      key: 'type',
      label: 'All movement types',
      options: [...new Set(movements.map((m) => m.type))].map((t) => ({ value: t, label: MOVEMENT_TYPE_LABELS[t] })),
      match: (r, value) => r.movement.type === value,
    },
    {
      key: 'direction',
      label: 'Any direction',
      options: [
        { value: 'in', label: 'Stock in' },
        { value: 'out', label: 'Stock out' },
      ],
      match: (r, value) => (value === 'in' ? r.movement.quantityDelta > 0 : r.movement.quantityDelta < 0),
    },
    {
      key: 'exceptions',
      label: 'All movements',
      options: [{ value: 'missing', label: 'Exceptions only (no source link)' }],
      match: (r) => r.missingEvidence,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowKey={(r) => r.movement.id}
      searchable={(r) => `${MOVEMENT_TYPE_LABELS[r.movement.type]} ${r.src?.number ?? ''} ${r.party ?? ''} ${r.warehouseName} ${r.movement.reference ?? ''}`}
      searchPlaceholder="Search movement, document, party"
      filters={filters}
      initialSortKey="date"
      initialSortDirection="desc"
      pageSize={15}
      onRowClick={(r) => onSelect(r.movement, r.balanceAfter)}
      getRowAriaLabel={(r) => `Open evidence for ${MOVEMENT_TYPE_LABELS[r.movement.type]} on ${formatDate(r.movement.movementDate ?? r.movement.createdAt)}`}
      emptyTitle="No stock movements"
      emptyDescription="Movements appear here as documents post and stock actions are recorded."
    />
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

interface ResolvedRoleAccount {
  /** Real account id when it can be resolved (override / category default / a chart account matching the standard code). */
  id?: string;
  /** "CODE Name" when known, else the standard code+name. */
  label: string;
  /** Where the account comes from — shown as a small caption. */
  source: string;
}

function resolveRoleAccount(
  role: AccountRole,
  product: Product,
  category: ProductCategory | undefined,
  accountByCode: Map<string, { id: string; code: string; name: string }>,
  accountById: Map<string, { id: string; code: string; name: string }>,
): ResolvedRoleAccount {
  const generic = GENERIC_ACCOUNT[role];
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
  const labelFor = (id: string | undefined, fallback: string) => {
    const acc = id ? accountById.get(id) : undefined;
    return acc ? `${acc.code} ${acc.name}` : fallback;
  };
  const genericFallback = `${generic.code} ${generic.name}`;
  if (productOverride[role]) {
    return { id: productOverride[role], label: labelFor(productOverride[role], genericFallback), source: 'Product-specific override' };
  }
  if (categoryMapping[role]) {
    return { id: categoryMapping[role], label: labelFor(categoryMapping[role], genericFallback), source: `Category default${category ? ` — ${category.name}` : ''}` };
  }
  const standard = accountByCode.get(generic.code);
  return { id: standard?.id, label: genericFallback, source: 'Standard account' };
}

function AccountRow({
  role,
  product,
  category,
  accountByCode,
  accountById,
  accountHref,
}: {
  role: AccountRole;
  product: Product;
  category: ProductCategory | undefined;
  accountByCode: Map<string, { id: string; code: string; name: string }>;
  accountById: Map<string, { id: string; code: string; name: string }>;
  accountHref: (id: string | undefined) => string | undefined;
}) {
  const resolved = resolveRoleAccount(role, product, category, accountByCode, accountById);
  const href = accountHref(resolved.id);
  return (
    <RecordDetailField
      label={ROLE_LABEL[role]}
      value={
        <span className="flex min-w-0 flex-col gap-0.5">
          {href ? (
            <Link to={href} className="font-medium text-brand hover:underline [overflow-wrap:anywhere]">
              {resolved.label}
            </Link>
          ) : (
            <span className="[overflow-wrap:anywhere]">{resolved.label}</span>
          )}
          <span className="text-xs text-muted-foreground">{resolved.source}</span>
        </span>
      }
    />
  );
}

/**
 * The tabbed body of the Inventory Item detail — a KPI hero strip over
 * Overview / Stock / Purchasing / Sales / Traceability / Accounting /
 * Documents / Activity. Rendered by InventoryItemDetailPage inside
 * RecordPageShell (full page width). Contains no shell chrome of its own.
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
  creditNotes = [],
  customers = [],
  transfers = [],
  journalEntries = [],
  commitments,
  onOrder,
  integrity,
  accounts = [],
  accountLabel,
  ledgerHelpers = {},
}: InventoryItemDetailProps) {
  const [drawer, setDrawer] = useState<MovementEvidenceContext | null>(null);
  const accountByCode = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  /** `/accounting/coa?record=<id>` — the account record sheet, when the id is real. */
  const accountHref = (id: string | undefined) => (id && accountById.has(id) ? `/accounting/coa?record=${id}` : undefined);

  // The tab strip is the shared `RecordTabs` primitive — it owns the active
  // tab and mirrors it to `?tab=`. KPI tiles and Accounting-summary figures
  // deep-link into a tab by writing that same param; RecordTabs picks it up.
  const [, setSearchParams] = useSearchParams();
  const goToTab = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === TAB_VALUES[0]) params.delete('tab');
          else params.set('tab', next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const warehouseById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);
  const invoiceById = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);
  const billById = useMemo(() => new Map(bills.map((b) => [b.id, b])), [bills]);
  const creditNoteById = useMemo(() => new Map(creditNotes.map((c) => [c.id, c])), [creditNotes]);
  const journalById = useMemo(() => new Map(journalEntries.map((e) => [e.id, e])), [journalEntries]);
  const category = product.categoryId ? categories.find((c) => c.id === product.categoryId) : undefined;

  const warehouseName = (id: string) => warehouseById.get(id)?.name ?? id;

  function resolveParty(m: StockMovement): string | undefined {
    if (m.sourceDocumentType === 'invoice') {
      const inv = m.sourceDocumentId ? invoiceById.get(m.sourceDocumentId) : undefined;
      return inv ? customerById.get(inv.customerId) : undefined;
    }
    if (m.sourceDocumentType === 'credit_note') {
      const cn = m.sourceDocumentId ? creditNoteById.get(m.sourceDocumentId) : undefined;
      return cn ? customerById.get(cn.customerId) : undefined;
    }
    if (m.sourceDocumentType === 'bill') {
      const bill = m.sourceDocumentId ? billById.get(m.sourceDocumentId) : undefined;
      return bill ? supplierById.get(bill.supplierId) : undefined;
    }
    return undefined;
  }

  /** Status of the movement's source document, where the document is loaded. */
  function movementStatus(m: StockMovement): string | undefined {
    if (!m.sourceDocumentId) return undefined;
    if (m.sourceDocumentType === 'invoice') return invoiceById.get(m.sourceDocumentId)?.status;
    if (m.sourceDocumentType === 'bill') return billById.get(m.sourceDocumentId)?.status;
    if (m.sourceDocumentType === 'credit_note') return creditNoteById.get(m.sourceDocumentId)?.status;
    return undefined;
  }

  /**
   * Revenue behind a sales-side movement, from the authoritative document
   * line (`source_document_line_id`), falling back to a product match on the
   * document. `null` for a delivery-note issue (no invoice line yet).
   */
  function salesRevenueForMovement(m: StockMovement): number | null {
    const pickLine = (lines: { id: string; productId?: string; lineTotal?: number }[] | undefined) => {
      if (!lines) return undefined;
      if (m.sourceDocumentLineId) return lines.find((l) => l.id === m.sourceDocumentLineId);
      return lines.find((l) => l.productId === product.id);
    };
    if (m.sourceDocumentType === 'invoice' && m.sourceDocumentId) {
      const line = pickLine(invoiceById.get(m.sourceDocumentId)?.lineItems);
      return line?.lineTotal ?? null;
    }
    if (m.sourceDocumentType === 'credit_note' && m.sourceDocumentId) {
      const line = pickLine(creditNoteById.get(m.sourceDocumentId)?.lineItems);
      return line?.lineTotal != null ? -line.lineTotal : null;
    }
    return null;
  }

  const productMovements = useMemo(
    () =>
      movements
        .filter((m) => m.productId === product.id)
        .sort((a, b) => (b.movementDate ?? b.createdAt).localeCompare(a.movementDate ?? a.createdAt)),
    [product, movements],
  );

  const productBalances = useMemo(
    () =>
      applyStockCommitments(
        balances.filter((b) => b.productId === product.id),
        commitments ?? new Map<string, number>(),
      ).filter((b) => b.productId === product.id),
    [product, balances, commitments],
  );
  const productCommitted = useMemo(
    () => productBalances.reduce((sum, b) => sum + b.quantityCommitted, 0),
    [productBalances],
  );
  const productOnOrder = useMemo(
    () => (onOrder ? getOnOrderForProduct(onOrder, product.id) : 0),
    [onOrder, product.id],
  );
  const onOrderAtWarehouse = (warehouseId: string) => onOrder?.get(commitmentKey(product.id, warehouseId)) ?? 0;

  const inTransit = useMemo(() => inTransitForProduct(transfers, product.id), [transfers, product.id]);

  const salesMovements = productMovements.filter(
    (m) => m.type === 'sale' || m.type === 'sales_return' || m.type === 'delivery',
  );
  const purchaseMovements = productMovements.filter(
    (m) => m.type === 'goods_received' || m.type === 'purchase_return',
  );
  const unitsSold = salesMovements.reduce((s, m) => s + Math.abs(Math.min(m.quantityDelta, 0)), 0);

  // COGS to date — signed by direction so a sales return nets back out.
  const cogsToDate = salesMovements.reduce((s, m) => {
    const value = m.totalCost ?? 0;
    return s + (m.quantityDelta < 0 ? value : -value);
  }, 0);
  // Sales revenue to date — from authoritative invoice line items for this product.
  const revenueToDate = useMemo(
    () =>
      invoices.reduce(
        (s, inv) =>
          s +
          (inv.lineItems ?? [])
            .filter((l) => l.productId === product.id)
            .reduce((ls, l) => ls + (l.lineTotal ?? 0), 0),
        0,
      ),
    [invoices, product.id],
  );
  const grossProfitToDate = revenueToDate - cogsToDate;

  const totalPurchasedQty = purchaseMovements.reduce((s, m) => s + Math.max(m.quantityDelta, 0), 0);

  const stockValue = product.trackInventory ? product.quantityOnHand * product.costPrice : 0;
  const available = product.trackInventory
    ? quantityAvailable({
        quantityOnHand: product.quantityOnHand,
        quantityCommitted: productCommitted,
        quantityOnOrder: 0,
      })
    : 0;
  const marginPct = product.unitPrice > 0 ? ((product.unitPrice - product.costPrice) / product.unitPrice) * 100 : null;

  const taxLabel = getTaxRateLabel(product.taxRateId, taxRates, { pending: taxRatesPending });

  // Related journal entries for the Accounting tab — deduped from every
  // movement's resolved accounting trace.
  const relatedJournals = useMemo(() => {
    const seen = new Set<string>();
    const out: { id?: string; number?: string; entry?: JournalEntry }[] = [];
    for (const m of productMovements) {
      const acc = ledgerHelpers.resolveAccounting?.(m);
      const key = acc?.journalEntryId ?? acc?.journalNumber;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: acc?.journalEntryId,
        number: acc?.journalNumber,
        entry: acc?.journalEntryId ? journalById.get(acc.journalEntryId) : undefined,
      });
    }
    return out;
  }, [productMovements, ledgerHelpers, journalById]);

  // Related source documents for the Documents tab — one row per distinct
  // source document behind this product's movements.
  // One row per distinct source document behind this product's movements,
  // with the net quantity and value across that document's movements.
  const relatedDocuments = (() => {
    const seen = new Map<string, { src: ResolvedSourceDocument; date: string; qty: number; value: number; party?: string; status?: string }>();
    for (const m of productMovements) {
      const src = ledgerHelpers.resolveSource?.(m);
      if (!src || (!src.number && !src.label)) continue;
      const key = src.id ?? src.number ?? src.label;
      const existing = seen.get(key);
      if (existing) {
        existing.qty += m.quantityDelta;
        existing.value += m.totalCost ?? 0;
        continue;
      }
      seen.set(key, {
        src,
        date: m.movementDate ?? m.createdAt,
        qty: m.quantityDelta,
        value: m.totalCost ?? 0,
        party: resolveParty(m),
        status: movementStatus(m),
      });
    }
    return [...seen.values()];
  })();

  function openMovement(m: StockMovement, balanceAfter?: number) {
    const src = ledgerHelpers.resolveSource?.(m);
    const acc = ledgerHelpers.resolveAccounting?.(m);
    let counterpartWarehouseName: string | undefined;
    if ((m.type === 'transfer_in' || m.type === 'transfer_out') && m.sourceDocumentId) {
      const t = transfers.find((tr) => tr.id === m.sourceDocumentId);
      if (t) {
        counterpartWarehouseName = warehouseName(
          m.type === 'transfer_out' ? t.toWarehouseId : t.fromWarehouseId,
        );
      }
    }
    setDrawer({
      movement: m,
      source: src,
      accounting: acc,
      party: resolveParty(m),
      warehouseName: warehouseName(m.warehouseId),
      counterpartWarehouseName,
      runningQuantity: balanceAfter,
      currentWac: product.costPrice,
      missingEvidence: hasNoSourceEvidence(m),
    });
  }

  /** Each KPI drills into the tab that holds the evidence behind the figure. */
  const kpiTiles: { label: string; value: string; hint?: string; tone: StatTone; icon: typeof BoxesIcon; tab?: string }[] =
    product.trackInventory
      ? [
          {
            label: 'On hand',
            value: String(product.quantityOnHand),
            tone: product.quantityOnHand < 0 ? 'negative' : 'default',
            icon: BoxesIcon,
            tab: 'stock',
          },
          {
            label: 'Available',
            value: String(available),
            hint: 'On hand − committed',
            tone: available <= 0 ? 'warning' : 'default',
            icon: PackageCheckIcon,
            tab: 'stock',
          },
          {
            label: 'Committed',
            value: String(productCommitted),
            hint: 'Confirmed sales orders',
            tone: productCommitted > 0 ? 'info' : 'default',
            icon: TagIcon,
            tab: 'sales',
          },
          {
            label: 'In transit',
            value: String(inTransit.totalQuantity),
            hint: inTransit.legs.length > 0 ? `${inTransit.legs.length} transfer${inTransit.legs.length === 1 ? '' : 's'}` : 'Between warehouses',
            tone: inTransit.totalQuantity > 0 ? 'info' : 'default',
            icon: TruckIcon,
            tab: 'stock',
          },
          {
            label: 'On order',
            value: String(productOnOrder),
            hint: 'Open purchase orders',
            tone: 'default',
            icon: ArrowLeftRightIcon,
            tab: 'purchasing',
          },
          {
            label: 'Stock value',
            value: formatCurrency(stockValue),
            hint: 'At current WAC',
            tone: 'default',
            icon: WalletIcon,
            tab: 'accounting',
          },
          { label: 'WAC', value: formatCurrency(product.costPrice), tone: 'default', icon: CircleDollarSignIcon, tab: 'transactions' },
          {
            label: 'Gross margin',
            value: marginPct === null ? '—' : `${marginPct.toFixed(1)}%`,
            hint: `Sells at ${formatCurrency(product.unitPrice)}`,
            tone: 'default',
            icon: PercentIcon,
            tab: 'sales',
          },
        ]
      : [
          { label: 'Selling price', value: formatCurrency(product.unitPrice), tone: 'default', icon: CircleDollarSignIcon },
          { label: 'Cost', value: formatCurrency(product.costPrice), tone: 'default', icon: WalletIcon },
          {
            label: 'Gross margin',
            value: marginPct === null ? '—' : `${marginPct.toFixed(1)}%`,
            tone: 'default',
            icon: PercentIcon,
          },
        ];

  const TABS: { value: string; label: string; content: React.ReactNode }[] = [
    {
      value: 'overview',
      label: 'Overview',
      content: (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
            {/* LEFT — the master record */}
            <div className="flex min-w-0 flex-col gap-4">
              <OverviewSection title="Product details">
                <OverviewFields>
                  <RecordDetailField label="SKU" value={product.sku} />
                  <RecordDetailField label="Barcode" value={product.barcode ?? '—'} />
                  <RecordDetailField label="Item name" value={product.name} />
                  <RecordDetailField label="Type" value={product.type === 'service' ? 'Service' : 'Good'} />
                  <RecordDetailField label="Category" value={category?.name ?? product.category ?? '—'} />
                  <RecordDetailField label="Unit of measure" value={product.uom ?? '—'} />
                  <RecordDetailField label="Stock tracking" value={product.trackInventory ? 'Tracked' : 'Not tracked'} />
                  <RecordDetailField label="Active state" value={<StatusBadge status={product.status} />} />
                  <RecordDetailField label="Valuation method" value={product.valuationMethod === 'fifo' ? 'FIFO' : 'Weighted average'} />
                </OverviewFields>
                {product.description && <RecordDetailField label="Description" value={product.description} className="mt-1" />}
              </OverviewSection>

              <OverviewSection title="Commercial">
                <OverviewFields>
                  <RecordDetailField label="Selling price" value={<Amount value={product.unitPrice} />} />
                  <RecordDetailField label="Current WAC" value={<Amount value={product.costPrice} />} />
                  <RecordDetailField label="Margin per unit" value={<Amount value={product.unitPrice - product.costPrice} />} />
                  <RecordDetailField label="Margin %" value={marginPct === null ? '—' : `${marginPct.toFixed(1)}%`} />
                  <RecordDetailField label="Tax treatment" value={taxLabel} />
                </OverviewFields>
              </OverviewSection>
            </div>

            {/* RIGHT — the stock/supply position */}
            <div className="flex min-w-0 flex-col gap-4">
              {product.trackInventory && (
                <OverviewSection title="Stock position">
                  <OverviewFields>
                    <RecordDetailField label="On hand" value={product.quantityOnHand} />
                    <RecordDetailField label="Available" value={available} />
                    <RecordDetailField label="Committed" value={productCommitted} />
                    <RecordDetailField label="On order" value={productOnOrder} />
                    <RecordDetailField label="In transit" value={inTransit.totalQuantity} />
                    <RecordDetailField label="Reorder level" value={product.reorderLevel ?? '—'} />
                    <RecordDetailField label="Preferred stock level" value={product.preferredStockLevel ?? '—'} />
                    <RecordDetailField label="Stock value" value={<Amount value={stockValue} />} />
                  </OverviewFields>
                </OverviewSection>
              )}

              {product.trackInventory && (
                <OverviewSection title="Warehouse position">
                  {productBalances.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No stock recorded at any warehouse yet.</p>
                  ) : (
                    <SubTable head={['Warehouse', 'On hand', 'Committed', 'Available', 'Value']}>
                      {productBalances.map((b) => (
                        <tr key={b.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2"><WarehouseReference id={b.warehouseId} warehouses={warehouses} /></td>
                          <td className="figure px-3 py-2 text-right tabular-nums">{b.quantityOnHand}</td>
                          <td className="figure px-3 py-2 text-right tabular-nums text-muted-foreground">{b.quantityCommitted}</td>
                          <td className="figure px-3 py-2 text-right tabular-nums">{b.quantityOnHand - b.quantityCommitted + b.quantityOnOrder}</td>
                          <td className="figure px-3 py-2 text-right tabular-nums">{formatCurrency(b.quantityOnHand * product.costPrice)}</td>
                        </tr>
                      ))}
                    </SubTable>
                  )}
                </OverviewSection>
              )}

              <OverviewSection title="Supply">
                <OverviewFields>
                  <RecordDetailField
                    label="Preferred supplier"
                    value={product.preferredSupplierId ? supplierById.get(product.preferredSupplierId) ?? '—' : '—'}
                  />
                  <RecordDetailField label="Supplier item code" value={product.supplierItemCode ?? '—'} />
                  <RecordDetailField
                    label="Last purchase"
                    value={purchaseMovements[0] ? formatDate(purchaseMovements[0].movementDate ?? purchaseMovements[0].createdAt) : '—'}
                  />
                  <RecordDetailField
                    label="Last purchase cost"
                    value={purchaseMovements[0]?.unitCost != null ? formatCurrency(purchaseMovements[0].unitCost) : '—'}
                  />
                </OverviewFields>
              </OverviewSection>
            </div>
          </div>

          {product.trackInventory && (
            <OverviewSection title="Stock integrity">
              <ProductIntegritySummary
                summary={integrity?.summary ?? null}
                loading={integrity?.loading}
                error={integrity?.error ?? null}
                warehouseName={warehouseName}
              />
            </OverviewSection>
          )}
        </div>
      ),
    },
    {
      value: 'stock',
      label: 'Stock',
      content: !product.trackInventory ? (
        <RecordDetailSection title="Stock">
          <p className="text-sm text-muted-foreground">This item is not stock-tracked.</p>
        </RecordDetailSection>
      ) : (
        <div className="flex flex-col gap-6">
          <RecordDetailSection title="Total stock position">
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <RecordDetailField label="On hand" value={product.quantityOnHand} />
              <RecordDetailField label="Committed" value={productCommitted} />
              <RecordDetailField label="Available" value={available} />
              <RecordDetailField label="On order" value={productOnOrder} />
              <RecordDetailField label="In transit" value={inTransit.totalQuantity} />
              <RecordDetailField label="Stock value" value={<Amount value={stockValue} />} />
            </div>
          </RecordDetailSection>

          <RecordDetailSection title="Warehouse balances">
            {productBalances.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stock recorded at any warehouse yet.</p>
            ) : (
              <>
              <SubTable head={['Warehouse', 'On hand', 'Committed', 'On order', 'Available', 'Reorder level', 'Value']}>
                {productBalances.map((b) => {
                  const wh = warehouseById.get(b.warehouseId);
                  const avail = b.quantityOnHand - b.quantityCommitted;
                  const onO = onOrderAtWarehouse(b.warehouseId);
                  return (
                    <tr key={b.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2"><WarehouseReference warehouse={wh} /></td>
                      <td className="figure px-3 py-2 text-right tabular-nums">{b.quantityOnHand}</td>
                      <td className="figure px-3 py-2 text-right tabular-nums text-muted-foreground">{b.quantityCommitted}</td>
                      <td className="figure px-3 py-2 text-right tabular-nums text-muted-foreground">{onO}</td>
                      <td className={cn('figure px-3 py-2 text-right tabular-nums', avail < 0 && 'text-status-negative')}>{avail}</td>
                      <td className="figure px-3 py-2 text-right tabular-nums text-muted-foreground">{product.reorderLevel ?? '—'}</td>
                      <td className="figure px-3 py-2 text-right tabular-nums">{formatCurrency(b.quantityOnHand * product.costPrice)}</td>
                    </tr>
                  );
                })}
              </SubTable>
              <p className="mt-2 text-xs text-muted-foreground">
                Available is on hand − committed. On order (inbound on open purchase orders) is shown for
                visibility and is not added into Available.
              </p>
              </>
            )}
          </RecordDetailSection>

          {inTransit.legs.length > 0 && (
            <RecordDetailSection title="Transfers in progress">
              <p className="mb-2 text-xs text-muted-foreground">
                Stock dispatched from one warehouse and not yet received at the other. The quantity is out of
                the sending warehouse's on-hand and shown here until the receiving warehouse confirms it.
              </p>
              <SubTable head={['Transfer', 'From', 'To', 'In transit', 'Value', 'Dispatched']}>
                {inTransit.legs.map((leg) => (
                  <tr key={leg.transferId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <Link to={`/inventory/transfers/${leg.transferId}`} className="font-medium text-brand hover:underline">
                        {leg.transferNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right"><WarehouseReference id={leg.fromWarehouseId} warehouses={warehouses} /></td>
                    <td className="px-3 py-2 text-right"><WarehouseReference id={leg.toWarehouseId} warehouses={warehouses} /></td>
                    <td className="figure px-3 py-2 text-right tabular-nums">{leg.quantity}</td>
                    <td className="figure px-3 py-2 text-right tabular-nums">{formatCurrency(leg.value)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatDate(leg.transferDate)}</td>
                  </tr>
                ))}
              </SubTable>
            </RecordDetailSection>
          )}
        </div>
      ),
    },
    {
      value: 'purchasing',
      label: 'Purchasing',
      content: (
        <div className="flex flex-col gap-6">
          <RecordDetailSection title="Purchasing summary">
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <RecordDetailField
                label="Preferred supplier"
                value={product.preferredSupplierId ? supplierById.get(product.preferredSupplierId) ?? '—' : '—'}
              />
              <RecordDetailField label="Supplier item code" value={product.supplierItemCode ?? '—'} />
              <RecordDetailField label="Current WAC" value={<Amount value={product.costPrice} />} />
              <RecordDetailField
                label="Last purchase cost"
                value={purchaseMovements[0]?.unitCost != null ? formatCurrency(purchaseMovements[0].unitCost) : '—'}
              />
              <RecordDetailField label="Total purchased" value={totalPurchasedQty} />
              <RecordDetailField
                label="Last received"
                value={purchaseMovements[0] ? formatDate(purchaseMovements[0].movementDate ?? purchaseMovements[0].createdAt) : '—'}
              />
            </div>
          </RecordDetailSection>

          <RecordDetailSection title="Purchase history">
            {purchaseMovements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No purchase history yet.</p>
            ) : (
              <SubTable head={['Date', 'Document', 'Supplier', 'Type', 'Qty', 'Unit cost', 'Total', 'Warehouse', 'Status']}>
                {purchaseMovements.slice(0, 50).map((m) => (
                  <tr
                    key={m.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                    onClick={() => openMovement(m)}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(m.movementDate ?? m.createdAt)}</td>
                    <td className="px-3 py-2 text-right text-xs">
                      <SourceCell movement={m} src={ledgerHelpers.resolveSource?.(m)} onOpenPreview={ledgerHelpers.onOpenPreview} />
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">{resolveParty(m) ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{MOVEMENT_TYPE_LABELS[m.type]}</td>
                    <td className="figure px-3 py-2 text-right tabular-nums">{m.quantityDelta}</td>
                    <td className="figure px-3 py-2 text-right tabular-nums">{m.unitCost != null ? formatCurrency(m.unitCost) : '—'}</td>
                    <td className="figure px-3 py-2 text-right tabular-nums">{m.totalCost != null ? formatCurrency(m.totalCost) : '—'}</td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground"><WarehouseReference id={m.warehouseId} warehouses={warehouses} /></td>
                    <td className="px-3 py-2 text-right">{movementStatus(m) ? <StatusBadge status={movementStatus(m)!} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
              </SubTable>
            )}
          </RecordDetailSection>
        </div>
      ),
    },
    {
      value: 'sales',
      label: 'Sales',
      content: (
        <div className="flex flex-col gap-6">
          <RecordDetailSection title="Sales summary">
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <RecordDetailField label="Selling price" value={<Amount value={product.unitPrice} />} />
              <RecordDetailField label="Current WAC" value={<Amount value={product.costPrice} />} />
              <RecordDetailField label="Gross profit / unit" value={<Amount value={product.unitPrice - product.costPrice} />} />
              <RecordDetailField label="Gross margin %" value={marginPct === null ? '—' : `${marginPct.toFixed(1)}%`} />
              <RecordDetailField label="Units sold" value={unitsSold} />
              <RecordDetailField label="Sales revenue" value={<Amount value={revenueToDate} />} />
              <RecordDetailField label="COGS" value={<Amount value={cogsToDate} />} />
              <RecordDetailField label="Gross profit" value={<Amount value={grossProfitToDate} />} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Revenue is the sum of this item's posted invoice lines; COGS is the sum of its sale / delivery
              stock-movement values (returns netted out).
            </p>
          </RecordDetailSection>

          <RecordDetailSection title="Sales history">
            {salesMovements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales history yet.</p>
            ) : (
              <SubTable head={['Date', 'Document', 'Customer', 'Type', 'Qty', 'Revenue', 'COGS', 'Gross profit', 'Warehouse', 'Status']}>
                {salesMovements.slice(0, 50).map((m) => {
                  const revenue = salesRevenueForMovement(m);
                  const cogs = m.quantityDelta < 0 ? (m.totalCost ?? 0) : -(m.totalCost ?? 0);
                  const gp = revenue != null ? revenue - cogs : null;
                  return (
                  <tr
                    key={m.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                    onClick={() => openMovement(m)}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(m.movementDate ?? m.createdAt)}</td>
                    <td className="px-3 py-2 text-right text-xs">
                      <SourceCell movement={m} src={ledgerHelpers.resolveSource?.(m)} onOpenPreview={ledgerHelpers.onOpenPreview} />
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">{resolveParty(m) ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{MOVEMENT_TYPE_LABELS[m.type]}</td>
                    <td className="figure px-3 py-2 text-right tabular-nums">{m.quantityDelta}</td>
                    <td className="figure px-3 py-2 text-right tabular-nums">{revenue != null ? formatCurrency(revenue) : '—'}</td>
                    <td className="figure px-3 py-2 text-right tabular-nums">{m.totalCost != null ? formatCurrency(cogs) : '—'}</td>
                    <td className="figure px-3 py-2 text-right tabular-nums">{gp != null ? formatCurrency(gp) : '—'}</td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground"><WarehouseReference id={m.warehouseId} warehouses={warehouses} /></td>
                    <td className="px-3 py-2 text-right">{movementStatus(m) ? <StatusBadge status={movementStatus(m)!} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                  </tr>
                  );
                })}
              </SubTable>
            )}
          </RecordDetailSection>
        </div>
      ),
    },
    {
      value: 'transactions',
      label: 'Traceability',
      content: (
        <RecordDetailSection title="Stock movement ledger">
          <p className="mb-3 text-xs text-muted-foreground">
            Every stock event for this item. Click a row for the full evidence — source document, party,
            cost and the accounting trace.
          </p>
          <TraceabilityLedger
            movements={productMovements}
            warehouseName={warehouseName}
            resolveWarehouse={(id) => warehouseById.get(id)}
            resolveParty={resolveParty}
            helpers={ledgerHelpers}
            onSelect={openMovement}
          />
        </RecordDetailSection>
      ),
    },
    {
      value: 'accounting',
      label: 'Accounting',
      content: (
        <div className="flex flex-col gap-6">
          <RecordDetailSection title="Account mapping">
            <p className="text-xs text-muted-foreground">
              How this item posts. Resolution order: product override → category default → standard account.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              <AccountRow role="inventory" product={product} category={category} accountByCode={accountByCode} accountById={accountById} accountHref={accountHref} />
              <AccountRow role="cogs" product={product} category={category} accountByCode={accountByCode} accountById={accountById} accountHref={accountHref} />
              <AccountRow role="revenue" product={product} category={category} accountByCode={accountByCode} accountById={accountById} accountHref={accountHref} />
              <AccountRow role="adjustment" product={product} category={category} accountByCode={accountByCode} accountById={accountById} accountHref={accountHref} />
              <AccountRow role="purchase_price_variance" product={product} category={category} accountByCode={accountByCode} accountById={accountById} accountHref={accountHref} />
              <RecordDetailField
                label="VAT"
                value={
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    {product.taxRateId ? <span>{taxLabel}</span> : <span>No tax rate</span>}
                    <span className="text-muted-foreground">→</span>
                    {(['2100', '2110'] as const).map((code, i) => {
                      const acc = accountByCode.get(code);
                      const href = accountHref(acc?.id);
                      const text = `${code} ${i === 0 ? 'Output' : 'Input'}`;
                      return href ? (
                        <Link key={code} to={href} className="font-medium text-brand hover:underline">{text}</Link>
                      ) : (
                        <span key={code}>{text}</span>
                      );
                    })}
                  </span>
                }
              />
            </div>
          </RecordDetailSection>

          {product.trackInventory && (
            <RecordDetailSection title="Accounting summary">
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <AccountingFigure label="Inventory value" value={<Amount value={stockValue} />} onDrill={() => goToTab('transactions')} />
                <AccountingFigure label="COGS to date" value={<Amount value={cogsToDate} />} onDrill={() => goToTab('transactions')} />
                <AccountingFigure label="Sales revenue to date" value={<Amount value={revenueToDate} />} onDrill={() => goToTab('sales')} />
                <AccountingFigure label="Gross profit" value={<Amount value={grossProfitToDate} />} onDrill={() => goToTab('sales')} />
                <AccountingFigure
                  label="Gross margin"
                  value={revenueToDate > 0 ? `${((grossProfitToDate / revenueToDate) * 100).toFixed(1)}%` : '—'}
                  onDrill={() => goToTab('sales')}
                />
              </div>
            </RecordDetailSection>
          )}

          <RecordDetailSection title="Related journal entries">
            {relatedJournals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No general-ledger entries are linked to this item's stock movements yet.
              </p>
            ) : (
              <SubTable head={['Journal', 'Date', 'Source', 'Account', 'Debit', 'Credit']}>
                {relatedJournals.slice(0, 40).flatMap((j, i) => {
                  const lines = j.entry?.lines ?? [];
                  const jeCell = j.id ? (
                    <Link to={`/accounting/journals?record=${j.id}`} className="font-medium text-brand hover:underline">
                      {j.number ?? j.entry?.entryNumber ?? 'View'}
                    </Link>
                  ) : (
                    j.number ?? '—'
                  );
                  if (lines.length === 0) {
                    return [
                      <tr key={j.id ?? j.number ?? i} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">{jeCell}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{j.entry ? formatDate(j.entry.date) : '—'}</td>
                        <td className="px-3 py-2 text-right">{j.entry?.source ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground" colSpan={3}>{j.entry?.memo ?? 'Lines not loaded'}</td>
                      </tr>,
                    ];
                  }
                  return lines.map((line, li) => (
                    <tr key={`${j.id ?? i}-${line.id ?? li}`} className={cn('border-b border-border last:border-0', li > 0 && 'bg-muted/10')}>
                      <td className="px-3 py-2">{li === 0 ? jeCell : ''}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{li === 0 && j.entry ? formatDate(j.entry.date) : ''}</td>
                      <td className="px-3 py-2 text-right">{li === 0 ? j.entry?.source ?? '—' : ''}</td>
                      <td className="px-3 py-2 text-right text-xs">
                        {accountHref(line.accountId) ? (
                          <Link to={accountHref(line.accountId) as string} className="font-medium text-brand hover:underline">
                            {accountLabel ? accountLabel(line.accountId) : line.accountId}
                          </Link>
                        ) : accountLabel ? (
                          accountLabel(line.accountId)
                        ) : (
                          line.accountId
                        )}
                      </td>
                      <td className="figure px-3 py-2 text-right tabular-nums">{line.debit ? formatCurrency(line.debit) : ''}</td>
                      <td className="figure px-3 py-2 text-right tabular-nums">{line.credit ? formatCurrency(line.credit) : ''}</td>
                    </tr>
                  ));
                })}
              </SubTable>
            )}
          </RecordDetailSection>
        </div>
      ),
    },
    {
      value: 'documents',
      label: 'Documents',
      content: (
        <div className="flex flex-col gap-6">
          <RecordDetailSection title="Related documents">
            {relatedDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No source documents are linked to this item's stock movements yet.
              </p>
            ) : (
              <SubTable head={['Type', 'Document', 'Date', 'Party', 'Qty', 'Value', 'Status']}>
                {relatedDocuments.slice(0, 60).map((d, i) => (
                  <tr key={d.src.id ?? d.src.number ?? i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{d.src.label}</td>
                    <td className="px-3 py-2 text-right text-xs">
                      {d.src.path ? (
                        <Link to={d.src.path} className="font-medium text-brand hover:underline">
                          {d.src.number ?? d.src.label}
                        </Link>
                      ) : (
                        d.src.number ?? '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatDate(d.date)}</td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">{d.party ?? '—'}</td>
                    <td className="figure px-3 py-2 text-right tabular-nums">{d.qty > 0 ? `+${d.qty}` : d.qty}</td>
                    <td className="figure px-3 py-2 text-right tabular-nums">{d.value ? formatCurrency(Math.abs(d.value)) : '—'}</td>
                    <td className="px-3 py-2 text-right">{d.status ? <StatusBadge status={d.status} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
              </SubTable>
            )}
          </RecordDetailSection>

          <RecordDetailSection title="Attachments">
            <p className="text-sm text-muted-foreground">
              File attachments for a product arrive with the shared document framework. Until then, this
              item's paper trail is the related documents above and its full movement history in the
              Traceability tab.
            </p>
          </RecordDetailSection>
        </div>
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
          subtitle="Changes and important actions performed on this item's master data — who changed a price, a cost mapping or the item's configuration, and when. Stock arrivals and issues live in the Traceability tab."
          emptyMessage="No recorded changes to this product's master data yet."
        />
      ),
    },
  ];

  const tabCounts: Record<string, number> = {
    stock: productBalances.length,
    purchasing: purchaseMovements.length,
    sales: salesMovements.length,
    transactions: productMovements.length,
    accounting: relatedJournals.length,
    documents: relatedDocuments.length,
  };

  const tabIcons: Record<string, (typeof SEMANTIC_ICONS)[keyof typeof SEMANTIC_ICONS]> = {
    overview: SEMANTIC_ICONS.overview,
    stock: SEMANTIC_ICONS.stock,
    purchasing: SEMANTIC_ICONS.purchasing,
    sales: SEMANTIC_ICONS.sales,
    transactions: SEMANTIC_ICONS.traceability,
    accounting: SEMANTIC_ICONS.accounting,
    documents: SEMANTIC_ICONS.documents,
    audit: SEMANTIC_ICONS.activity,
  };

  const tabHints: Record<string, (n: number) => string | undefined> = {
    stock: (n) => `${n} warehouse ${n === 1 ? 'balance' : 'balances'}`,
    purchasing: (n) => `${n} purchase ${n === 1 ? 'movement' : 'movements'}`,
    sales: (n) => `${n} sales ${n === 1 ? 'movement' : 'movements'}`,
    transactions: (n) => `${n} stock ${n === 1 ? 'movement' : 'movements'} / evidence records`,
    accounting: (n) => `${n} linked journal ${n === 1 ? 'entry' : 'entries'}`,
    documents: (n) => `${n} related ${n === 1 ? 'document' : 'documents'}`,
  };

  const recordTabs: RecordTab[] = TABS.map((t) => ({
    value: t.value,
    label: t.label,
    icon: tabIcons[t.value],
    count: tabCounts[t.value],
    hint: tabHints[t.value]?.(tabCounts[t.value] ?? 0),
    content: t.content,
  }));

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <StatStrip columns={kpiTiles.length >= 6 ? 8 : 3}>
        {kpiTiles.map((t) => (
          <StatTile
            key={t.label}
            icon={t.icon}
            label={t.label}
            value={t.value}
            hint={t.hint}
            tone={t.tone}
            variant="micro"
            onActivate={t.tab ? () => goToTab(t.tab as string) : undefined}
            activateLabel={t.tab ? `View ${t.label} — opens the ${t.tab} tab` : undefined}
          />
        ))}
      </StatStrip>

      <RecordTabs urlParam="tab" ariaLabel="Product sections" tabs={recordTabs} />

      <MovementEvidenceDrawer context={drawer} open={drawer != null} onClose={() => setDrawer(null)} />
    </div>
  );
}
