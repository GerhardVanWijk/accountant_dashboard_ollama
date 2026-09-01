import type { NewOpeningStockLine, Product, Warehouse } from '@/types';
import { openingStockBatchService } from '@/features/inventory/services/openingStockBatchService';
import { productService } from '@/features/inventory/services/productService';
import { warehouseService } from '@/features/inventory/services/warehouseService';
import type { ImportAdapter, ImportExecuteOptions, ImportExecutionSummary, ImportFieldDef, ImportRowOutcome, ImportRowResult, RowMessage } from '../types';
import { asNumber, asString, requireField } from '../normalize';

export interface OpeningStockImportRow {
  sku: string;
  productId: string;
  warehouseName: string;
  warehouseId: string;
  quantity: number;
  unitCost: number;
}

export interface OpeningStockImportContext {
  productsBySku: Map<string, Product>;
  warehousesByName: Map<string, Warehouse>;
}

export const OPENING_STOCK_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'sku', label: 'SKU', required: true, type: 'string', aliases: ['Item Code', 'Product Code', 'Stock Code', 'Item Number'] },
  { key: 'warehouse', label: 'Warehouse', required: true, type: 'string', aliases: ['Location', 'Store'] },
  { key: 'quantity', label: 'Quantity', required: true, type: 'number', aliases: ['Qty', 'Opening Qty', 'Opening Quantity'] },
  { key: 'unitCost', label: 'Unit Cost', required: true, type: 'number', aliases: ['Cost', 'Cost Price', 'Cost Ex VAT'] },
];

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeRow(
  raw: Record<string, string | number | boolean | Date | undefined>,
  _rowNumber: number,
  ctx: OpeningStockImportContext,
): { normalized?: OpeningStockImportRow; messages: RowMessage[] } {
  const messages: RowMessage[] = [];
  const sku = asString(raw.sku);
  const warehouseName = asString(raw.warehouse);
  requireField(sku, 'sku', 'SKU', messages);
  requireField(warehouseName, 'warehouse', 'Warehouse', messages);

  const quantity = asNumber(raw.quantity);
  if (requireField(quantity, 'quantity', 'Quantity', messages) === false && quantity !== undefined && quantity <= 0) {
    messages.push({ field: 'quantity', message: 'Quantity must be greater than zero.', severity: 'error' });
  }
  const unitCost = asNumber(raw.unitCost);
  requireField(unitCost, 'unitCost', 'Unit Cost', messages);
  if (unitCost !== undefined && unitCost < 0) {
    messages.push({ field: 'unitCost', message: 'Unit Cost cannot be negative.', severity: 'error' });
  }

  let productId: string | undefined;
  if (sku) {
    const product = ctx.productsBySku.get(sku.trim().toLowerCase());
    if (product) productId = product.id;
    else messages.push({ field: 'sku', message: `SKU "${sku}" was not found — create the product first.`, severity: 'error' });
  }

  let warehouseId: string | undefined;
  if (warehouseName) {
    const warehouse = ctx.warehousesByName.get(normalizeKey(warehouseName));
    if (warehouse) warehouseId = warehouse.id;
    else messages.push({ field: 'warehouse', message: `Warehouse "${warehouseName}" does not exist.`, severity: 'error' });
  }

  if (messages.some((m) => m.severity === 'error')) return { messages };

  return {
    normalized: { sku: sku!, productId: productId!, warehouseName: warehouseName!, warehouseId: warehouseId!, quantity: quantity!, unitCost: unitCost! },
    messages,
  };
}

function detectDuplicates(rows: ImportRowResult<OpeningStockImportRow>[], _ctx: OpeningStockImportContext): ImportRowResult<OpeningStockImportRow>[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    if (!row.normalized || row.severity === 'error') return row;
    const key = `${row.normalized.sku.trim().toLowerCase()}::${row.normalized.warehouseId}`;
    if (seen.has(key)) {
      return {
        ...row,
        severity: 'warning',
        messages: [...row.messages, { field: 'sku', message: `SKU "${row.normalized.sku}" at this warehouse appears more than once in this file — both lines will be included in the draft.`, severity: 'warning' }],
      };
    }
    seen.add(key);
    return row;
  });
}

async function execute(rows: ImportRowResult<OpeningStockImportRow>[], _ctx: OpeningStockImportContext, options: ImportExecuteOptions): Promise<ImportExecutionSummary> {
  const outcomes: ImportRowOutcome[] = [];
  const lines: NewOpeningStockLine[] = [];
  let errored = 0;

  for (const row of rows) {
    if (row.severity === 'skipped') {
      outcomes.push({ rowNumber: row.rowNumber, outcome: 'skipped' });
      continue;
    }
    if (row.severity === 'error' || !row.normalized) {
      errored++;
      outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: row.messages.find((m) => m.severity === 'error')?.message ?? 'Invalid row.' });
      continue;
    }
    const r = row.normalized;
    lines.push({ productId: r.productId, warehouseId: r.warehouseId, quantity: r.quantity, unitCost: r.unitCost, totalCost: Math.round(r.quantity * r.unitCost * 100) / 100 });
    outcomes.push({ rowNumber: row.rowNumber, outcome: 'imported' });
  }

  if (lines.length === 0) {
    return { rowsRead: rows.length, imported: 0, updated: 0, skipped: rows.filter((r) => r.severity === 'skipped').length, errored, rows: outcomes };
  }

  const batch = await openingStockBatchService.createOpeningStockBatch({
    warehouseId: lines[0].warehouseId,
    effectiveDate: new Date().toISOString().slice(0, 10),
    notes: `Imported ${lines.length} line${lines.length === 1 ? '' : 's'} — review and confirm in Opening Stock before it posts.`,
    lineItems: lines.map((l) => ({ ...l, id: '', openingStockBatchId: '' })),
  });
  void options.actorUserId;

  return { rowsRead: rows.length, imported: lines.length, updated: 0, skipped: rows.filter((r) => r.severity === 'skipped').length, errored, rows: outcomes, draftRecordId: batch.id };
}

/**
 * Opening Stock import — creates ONE `draft` `OpeningStockBatch` from the
 * valid rows and stops (Phase 6 spec §11). It never touches inventory
 * quantities or the GL itself: `openingStockBatchService.confirmBatch()`
 * — the existing Phase 5 workflow, with its preview and explicit
 * confirmation checkbox — is the only thing that can ever post this
 * batch (`Dr Inventory Asset / Cr Opening Balance Equity`, no VAT). A
 * SKU that doesn't already exist is an ERROR, never auto-created — this
 * adapter loads stock onto existing products, `productImportAdapter`
 * creates them.
 */
export const openingStockImportAdapter: ImportAdapter<OpeningStockImportRow, OpeningStockImportContext> = {
  id: 'inventory-opening-stock',
  label: 'Opening Stock',
  description: 'Load opening quantities and cost onto a draft batch — review and post it in Opening Stock afterwards.',
  permission: { feature: 'inventory', action: 'import' },
  fields: OPENING_STOCK_IMPORT_FIELDS,
  async loadContext() {
    const [products, warehouses] = await Promise.all([productService.getProducts(), warehouseService.getWarehouses()]);
    return {
      productsBySku: new Map(products.map((p) => [p.sku.trim().toLowerCase(), p])),
      warehousesByName: new Map(warehouses.map((w) => [normalizeKey(w.name), w])),
    };
  },
  normalizeRow,
  detectDuplicates,
  execute,
};
