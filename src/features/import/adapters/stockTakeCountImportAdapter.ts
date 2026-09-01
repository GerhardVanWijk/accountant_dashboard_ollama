import type { Product, StockTake } from '@/types';
import { productService } from '@/features/inventory/services/productService';
import { stockTakeService, type StockTakeCountInput } from '@/features/inventory/services/stockTakeService';
import type { ImportAdapter, ImportConfirmField, ImportExecuteOptions, ImportExecutionSummary, ImportFieldDef, ImportRowOutcome, ImportRowResult, RowMessage } from '../types';
import { asNumber, asString, requireField } from '../normalize';

export interface StockTakeCountImportRow {
  sku: string;
  lineId: string;
  countedQty: number;
  notes?: string;
}

export interface StockTakeCountImportContext {
  productsBySku: Map<string, Product>;
  countingStockTakes: StockTake[];
  /** Folded in by `applyParams()` once the user picks a target stock take — `normalizeRow` needs it to resolve a SKU to that take's own line. */
  selectedStockTakeId?: string;
}

export const STOCK_TAKE_COUNT_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'sku', label: 'SKU', required: true, type: 'string', aliases: ['Item Code', 'Product Code', 'Stock Code', 'Item Number'] },
  { key: 'countedQty', label: 'Counted Quantity', required: true, type: 'number', aliases: ['Counted Qty', 'Count', 'Qty Counted'] },
  { key: 'notes', label: 'Notes', type: 'string', aliases: ['Reason', 'Comment'] },
];

function normalizeRow(
  raw: Record<string, string | number | boolean | Date | undefined>,
  _rowNumber: number,
  ctx: StockTakeCountImportContext,
): { normalized?: StockTakeCountImportRow; messages: RowMessage[] } {
  const messages: RowMessage[] = [];
  const sku = asString(raw.sku);
  requireField(sku, 'sku', 'SKU', messages);
  const countedQty = asNumber(raw.countedQty);
  requireField(countedQty, 'countedQty', 'Counted Quantity', messages);
  if (countedQty !== undefined && countedQty < 0) {
    messages.push({ field: 'countedQty', message: 'Counted Quantity cannot be negative.', severity: 'error' });
  }

  const stockTake = ctx.countingStockTakes.find((s) => s.id === ctx.selectedStockTakeId);
  if (!stockTake) {
    messages.push({ message: 'Select which stock take these counts belong to before importing.', severity: 'error' });
    return { messages };
  }

  let lineId: string | undefined;
  if (sku) {
    const product = ctx.productsBySku.get(sku.trim().toLowerCase());
    // "Expected Qty and Frozen WAC come from the frozen stock take. The
    // spreadsheet must NOT be able to overwrite them" (spec §12) — the only
    // thing this adapter is allowed to touch on a line is `countedQty`,
    // resolved by matching the SKU to a line ALREADY on the frozen sheet,
    // never by creating or repricing one.
    const line = product ? stockTake.lineItems.find((l) => l.productId === product.id) : undefined;
    if (!product) {
      messages.push({ field: 'sku', message: `SKU "${sku}" was not found.`, severity: 'error' });
    } else if (!line) {
      messages.push({ field: 'sku', message: `SKU "${sku}" is not in this stock take's frozen scope.`, severity: 'error' });
    } else {
      lineId = line.id;
    }
  }

  if (messages.some((m) => m.severity === 'error')) return { messages };

  return { normalized: { sku: sku!, lineId: lineId!, countedQty: countedQty!, notes: asString(raw.notes) }, messages };
}

function detectDuplicates(rows: ImportRowResult<StockTakeCountImportRow>[], _ctx: StockTakeCountImportContext): ImportRowResult<StockTakeCountImportRow>[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    if (!row.normalized || row.severity === 'error') return row;
    const key = row.normalized.lineId;
    if (seen.has(key)) {
      return {
        ...row,
        severity: 'error',
        messages: [...row.messages, { field: 'sku', message: `SKU "${row.normalized.sku}" appears more than once in this file — a count line cannot be set twice in the same import.`, severity: 'error' }],
      };
    }
    seen.add(key);
    return row;
  });
}

async function execute(rows: ImportRowResult<StockTakeCountImportRow>[], ctx: StockTakeCountImportContext, options: ImportExecuteOptions): Promise<ImportExecutionSummary> {
  const outcomes: ImportRowOutcome[] = [];
  const counts: StockTakeCountInput[] = [];
  let errored = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.severity === 'skipped') {
      skipped++;
      outcomes.push({ rowNumber: row.rowNumber, outcome: 'skipped' });
      continue;
    }
    if (row.severity === 'error' || !row.normalized) {
      errored++;
      outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: row.messages.find((m) => m.severity === 'error')?.message ?? 'Invalid row.' });
      continue;
    }
    counts.push({ lineId: row.normalized.lineId, countedQty: row.normalized.countedQty });
    outcomes.push({ rowNumber: row.rowNumber, outcome: 'imported' });
  }

  const stockTakeId = String(options.params.stockTakeId ?? ctx.selectedStockTakeId ?? '');
  if (counts.length > 0 && stockTakeId) {
    await stockTakeService.enterCounts(stockTakeId, counts);
  }

  return { rowsRead: rows.length, imported: counts.length, updated: 0, skipped, errored, rows: outcomes, draftRecordId: stockTakeId || undefined };
}

function confirmFields(ctx: StockTakeCountImportContext): ImportConfirmField[] {
  return [
    {
      key: 'stockTakeId',
      label: 'Stock take',
      required: true,
      helpText: 'Only stock takes currently being counted can receive imported counts.',
      options: ctx.countingStockTakes.map((s) => ({ value: s.id, label: s.stockTakeNumber })),
    },
  ];
}

/**
 * Stock Take count import — writes ONLY `countedQty` onto lines that
 * already exist on an already-frozen (`status: 'counting'`) stock take
 * (Phase 6 spec §12). `expectedQty` and the frozen unit cost are never
 * touched — they were snapshotted atomically when the take was frozen
 * (`stockTakeService.freeze()`, Phase 3C item 6) and this adapter has no
 * path that can write them. A SKU outside the take's scope, or not found
 * at all, is always an ERROR — never silently added to the sheet.
 */
export const stockTakeCountImportAdapter: ImportAdapter<StockTakeCountImportRow, StockTakeCountImportContext> = {
  id: 'inventory-stock-take-counts',
  label: 'Stock Take Counts',
  description: 'Import physical counts into a stock take that has already been frozen for counting.',
  permission: { feature: 'inventory', action: 'import' },
  fields: STOCK_TAKE_COUNT_IMPORT_FIELDS,
  async loadContext() {
    const [products, stockTakes] = await Promise.all([productService.getProducts(), stockTakeService.getStockTakes()]);
    return {
      productsBySku: new Map(products.map((p) => [p.sku.trim().toLowerCase(), p])),
      countingStockTakes: stockTakes.filter((s) => s.status === 'counting'),
    };
  },
  confirmFields,
  applyParams: (ctx, params) => ({ ...ctx, selectedStockTakeId: String(params.stockTakeId ?? '') || undefined }),
  normalizeRow,
  detectDuplicates,
  execute,
};
