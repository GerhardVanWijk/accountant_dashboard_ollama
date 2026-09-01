import type { Product, ProductCategory, Supplier, TaxRate } from '@/types';
import { productService } from '@/features/inventory/services/productService';
import { productCategoryService } from '@/features/inventory/services/productCategoryService';
import { supplierService } from '@/features/suppliers/services/supplierService';
import { taxRateService } from '@/features/tax/services';
import type { ImportAdapter, ImportExecuteOptions, ImportExecutionSummary, ImportFieldDef, ImportRowOutcome, ImportRowResult, RowMessage } from '../types';
import { asBoolean, asNumber, asString, requireField } from '../normalize';

export interface ProductImportRow {
  sku: string;
  name: string;
  barcode?: string;
  description?: string;
  categoryName?: string;
  categoryId?: string;
  preferredSupplierName?: string;
  preferredSupplierId?: string;
  supplierItemCode?: string;
  uom?: string;
  unitPrice: number;
  costPrice?: number;
  reorderLevel?: number;
  reorderQuantity?: number;
  preferredStockLevel?: number;
  trackInventory: boolean;
  active: boolean;
  taxTreatmentName?: string;
  taxRateId?: string;
}

export interface ProductImportContext {
  existingBySku: Map<string, Product>;
  categories: ProductCategory[];
  suppliers: Supplier[];
  taxRates: TaxRate[];
}

export const PRODUCT_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'sku', label: 'SKU', required: true, type: 'string', aliases: ['Item Code', 'Product Code', 'Stock Code', 'Item Number'] },
  { key: 'name', label: 'Name', required: true, type: 'string', aliases: ['Product', 'Product Name', 'Item Description', 'Description'] },
  { key: 'barcode', label: 'Barcode', type: 'string', aliases: ['UPC', 'EAN', 'Bar Code'] },
  { key: 'description', label: 'Description', type: 'string', aliases: ['Product Description', 'Long Description'] },
  { key: 'category', label: 'Category', type: 'string', aliases: ['Product Category', 'Group'] },
  { key: 'preferredSupplier', label: 'Preferred Supplier', type: 'string', aliases: ['Supplier', 'Vendor', 'Preferred Vendor'] },
  { key: 'supplierItemCode', label: 'Supplier Item Code', type: 'string', aliases: ["Supplier's Code", 'Vendor Item Code'] },
  { key: 'uom', label: 'Unit of Measure', type: 'string', aliases: ['UOM', 'Unit'] },
  { key: 'unitPrice', label: 'Selling Price', required: true, type: 'number', aliases: ['Sales Price', 'Retail Price', 'Price'] },
  { key: 'costPrice', label: 'Cost Price', type: 'number', aliases: ['Cost', 'Cost Ex VAT', 'Unit Cost'] },
  { key: 'reorderLevel', label: 'Reorder Level', type: 'number', aliases: ['Reorder Point', 'Min Stock'] },
  { key: 'reorderQuantity', label: 'Reorder Quantity', type: 'number', aliases: ['Reorder Qty'] },
  { key: 'preferredStockLevel', label: 'Preferred Stock Level', type: 'number', aliases: ['Max Stock', 'Ideal Stock Level'] },
  { key: 'trackInventory', label: 'Track Inventory', type: 'boolean', aliases: ['Stock Tracked', 'Tracked'] },
  { key: 'active', label: 'Active', type: 'boolean', aliases: ['Status', 'Is Active'] },
  { key: 'taxTreatment', label: 'Tax Treatment', type: 'string', aliases: ['Tax Rate', 'VAT Treatment', 'Tax Code'] },
];

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeRow(
  raw: Record<string, string | number | boolean | Date | undefined>,
  _rowNumber: number,
  ctx: ProductImportContext,
): { normalized?: ProductImportRow; messages: RowMessage[] } {
  const messages: RowMessage[] = [];
  const sku = asString(raw.sku);
  const name = asString(raw.name);
  requireField(sku, 'sku', 'SKU', messages);
  requireField(name, 'name', 'Name', messages);

  const unitPrice = asNumber(raw.unitPrice);
  if (raw.unitPrice !== undefined && unitPrice === undefined) {
    messages.push({ field: 'unitPrice', message: `Selling Price "${String(raw.unitPrice)}" is not numeric.`, severity: 'error' });
  }

  const costPriceRaw = asNumber(raw.costPrice);
  if (raw.costPrice !== undefined && costPriceRaw === undefined) {
    messages.push({ field: 'costPrice', message: `Cost Price "${String(raw.costPrice)}" is not numeric.`, severity: 'error' });
  }

  const categoryName = asString(raw.category);
  let categoryId: string | undefined;
  if (categoryName) {
    const match = ctx.categories.find((c) => normalizeKey(c.name) === normalizeKey(categoryName));
    if (match) categoryId = match.id;
    else messages.push({ field: 'category', message: `Category "${categoryName}" was not found — the product will import without a category.`, severity: 'warning' });
  }

  const preferredSupplierName = asString(raw.preferredSupplier);
  let preferredSupplierId: string | undefined;
  if (preferredSupplierName) {
    const match = ctx.suppliers.find((s) => normalizeKey(s.name) === normalizeKey(preferredSupplierName));
    if (match) preferredSupplierId = match.id;
    else messages.push({ field: 'preferredSupplier', message: `Supplier "${preferredSupplierName}" was not found — the product will import without a preferred supplier.`, severity: 'warning' });
  }

  const taxTreatmentName = asString(raw.taxTreatment);
  let taxRateId: string | undefined;
  if (taxTreatmentName) {
    const match = ctx.taxRates.find((t) => normalizeKey(t.name) === normalizeKey(taxTreatmentName) || normalizeKey(t.code) === normalizeKey(taxTreatmentName));
    if (match) taxRateId = match.id;
    else messages.push({ field: 'taxTreatment', message: `Tax treatment "${taxTreatmentName}" was not found — the product will import without a tax rate.`, severity: 'warning' });
  }

  if (messages.some((m) => m.severity === 'error')) return { messages };

  return {
    normalized: {
      sku: sku!,
      name: name!,
      barcode: asString(raw.barcode),
      description: asString(raw.description),
      categoryName,
      categoryId,
      preferredSupplierName,
      preferredSupplierId,
      supplierItemCode: asString(raw.supplierItemCode),
      uom: asString(raw.uom),
      unitPrice: unitPrice ?? 0,
      costPrice: costPriceRaw,
      reorderLevel: asNumber(raw.reorderLevel),
      reorderQuantity: asNumber(raw.reorderQuantity),
      preferredStockLevel: asNumber(raw.preferredStockLevel),
      trackInventory: asBoolean(raw.trackInventory) ?? true,
      active: asBoolean(raw.active) ?? true,
      taxTreatmentName,
      taxRateId,
    },
    messages,
  };
}

function detectDuplicates(rows: ImportRowResult<ProductImportRow>[], ctx: ProductImportContext): ImportRowResult<ProductImportRow>[] {
  const seenInFile = new Set<string>();
  return rows.map((row) => {
    if (!row.normalized || row.severity === 'error') return row;
    const key = row.normalized.sku.trim().toLowerCase();
    const existsInFile = seenInFile.has(key);
    seenInFile.add(key);
    const existsInApp = ctx.existingBySku.has(key);
    if (existsInFile) {
      return { ...row, severity: 'error', messages: [...row.messages, { field: 'sku', message: `SKU "${row.normalized.sku}" appears more than once in this file.`, severity: 'error' }] };
    }
    if (existsInApp) {
      return { ...row, severity: 'duplicate', messages: [...row.messages, { field: 'sku', message: `SKU "${row.normalized.sku}" already exists.`, severity: 'warning' }] };
    }
    return row;
  });
}

async function execute(rows: ImportRowResult<ProductImportRow>[], ctx: ProductImportContext, options: ImportExecuteOptions): Promise<ImportExecutionSummary> {
  const outcomes: ImportRowOutcome[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let errored = 0;

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

    const r = row.normalized;

    if (row.severity === 'duplicate') {
      if (options.duplicateStrategy === 'skip') {
        skipped++;
        outcomes.push({ rowNumber: row.rowNumber, outcome: 'skipped', message: `SKU "${r.sku}" already exists.` });
        continue;
      }
      if (options.duplicateStrategy === 'error') {
        errored++;
        outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: `SKU "${r.sku}" already exists.` });
        continue;
      }
      // 'update' — WAC protection (spec §10): never let a master-data
      // import silently rewrite the cost of a product that already has
      // stock on hand. A cost change on existing stock is a valuation
      // event and belongs to an explicit stock-adjustment/correction
      // workflow, not a spreadsheet re-upload.
      const existing = ctx.existingBySku.get(r.sku.trim().toLowerCase())!;
      const costPriceChangeBlocked = existing.quantityOnHand > 0 && r.costPrice !== undefined && r.costPrice !== existing.costPrice;
      try {
        await productService.updateProduct(existing.id, {
          name: r.name,
          barcode: r.barcode,
          description: r.description,
          categoryId: r.categoryId ?? existing.categoryId,
          category: r.categoryName ?? existing.category,
          preferredSupplierId: r.preferredSupplierId ?? existing.preferredSupplierId,
          supplierItemCode: r.supplierItemCode ?? existing.supplierItemCode,
          uom: r.uom ?? existing.uom,
          unitPrice: r.unitPrice,
          costPrice: costPriceChangeBlocked ? existing.costPrice : (r.costPrice ?? existing.costPrice),
          reorderLevel: r.reorderLevel ?? existing.reorderLevel,
          reorderQuantity: r.reorderQuantity ?? existing.reorderQuantity,
          preferredStockLevel: r.preferredStockLevel ?? existing.preferredStockLevel,
          trackInventory: r.trackInventory,
          status: r.active ? 'active' : 'inactive',
          taxRateId: r.taxRateId ?? existing.taxRateId,
        });
        updated++;
        outcomes.push({
          rowNumber: row.rowNumber,
          outcome: 'updated',
          message: costPriceChangeBlocked
            ? `Updated — cost price left unchanged (this SKU has ${existing.quantityOnHand} on hand; use a stock adjustment to revalue it).`
            : undefined,
        });
      } catch (err) {
        errored++;
        outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: err instanceof Error ? err.message : 'Failed to update product.' });
      }
      continue;
    }

    try {
      await productService.createProduct({
        sku: r.sku,
        name: r.name,
        description: r.description,
        type: 'good',
        unitPrice: r.unitPrice,
        costPrice: r.costPrice ?? 0,
        taxRateId: r.taxRateId,
        trackInventory: r.trackInventory,
        reorderLevel: r.reorderLevel,
        status: r.active ? 'active' : 'inactive',
        barcode: r.barcode,
        uom: r.uom,
        category: r.categoryName,
        categoryId: r.categoryId,
        preferredSupplierId: r.preferredSupplierId,
        supplierItemCode: r.supplierItemCode,
        reorderQuantity: r.reorderQuantity,
        preferredStockLevel: r.preferredStockLevel,
      });
      imported++;
      outcomes.push({ rowNumber: row.rowNumber, outcome: 'imported' });
    } catch (err) {
      errored++;
      outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: err instanceof Error ? err.message : 'Failed to create product.' });
    }
  }

  return { rowsRead: rows.length, imported, updated, skipped, errored, rows: outcomes };
}

/**
 * Inventory Product import — the first real consumer of the shared
 * framework (Phase 6 spec §9–10). Creates/updates `Product` master data
 * ONLY — never posts to the GL, never touches `quantityOnHand` (which
 * `productService.createProduct()` always starts at 0, matching
 * docs/DO_NOT_BREAK.md § Inventory & Stock: opening quantity is Opening
 * Stock's job, `openingStockImportAdapter.ts`), and never silently
 * rewrites `costPrice` for a SKU that already carries stock (the WAC
 * protection rule in `execute()` above).
 */
export const productImportAdapter: ImportAdapter<ProductImportRow, ProductImportContext> = {
  id: 'inventory-products',
  label: 'Products',
  description: 'Create or update product master data — SKU, name, pricing, category and supplier.',
  permission: { feature: 'inventory', action: 'import' },
  fields: PRODUCT_IMPORT_FIELDS,
  async loadContext() {
    const [products, categories, suppliers, taxRates] = await Promise.all([
      productService.getProducts(),
      productCategoryService.getCategories(),
      supplierService.getSuppliers(),
      taxRateService.getCurrentlyEffectiveRates(),
    ]);
    const existingBySku = new Map(products.map((p) => [p.sku.trim().toLowerCase(), p]));
    return { existingBySku, categories, suppliers, taxRates };
  },
  normalizeRow,
  detectDuplicates,
  execute,
};
