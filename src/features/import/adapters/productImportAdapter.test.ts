import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Product, ProductCategory, Supplier, TaxRate } from '@/types';
import { productImportAdapter } from './productImportAdapter';
import { productService } from '@/features/inventory/services/productService';
import { productCategoryService } from '@/features/inventory/services/productCategoryService';
import { supplierService } from '@/features/suppliers/services/supplierService';
import { taxRateService } from '@/features/tax/services';
import type { ImportRowResult } from '../types';
import type { ProductImportContext, ProductImportRow } from './productImportAdapter';

vi.mock('@/features/inventory/services/productService', () => ({
  productService: { getProducts: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn() },
}));
vi.mock('@/features/inventory/services/productCategoryService', () => ({
  productCategoryService: { getCategories: vi.fn() },
}));
vi.mock('@/features/suppliers/services/supplierService', () => ({
  supplierService: { getSuppliers: vi.fn() },
}));
vi.mock('@/features/tax/services', () => ({
  taxRateService: { getCurrentlyEffectiveRates: vi.fn() },
}));

const mockedGetProducts = productService.getProducts as unknown as ReturnType<typeof vi.fn>;
const mockedCreateProduct = productService.createProduct as unknown as ReturnType<typeof vi.fn>;
const mockedUpdateProduct = productService.updateProduct as unknown as ReturnType<typeof vi.fn>;
const mockedGetCategories = productCategoryService.getCategories as unknown as ReturnType<typeof vi.fn>;
const mockedGetSuppliers = supplierService.getSuppliers as unknown as ReturnType<typeof vi.fn>;
const mockedGetTaxRates = taxRateService.getCurrentlyEffectiveRates as unknown as ReturnType<typeof vi.fn>;

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod_1',
    sku: 'PEN-1',
    name: 'Blue Pen',
    type: 'good',
    unitPrice: 5,
    costPrice: 2,
    trackInventory: true,
    quantityOnHand: 0,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeCategory(overrides: Partial<ProductCategory> = {}): ProductCategory {
  return { id: 'cat_1', name: 'Stationery', isActive: true, createdAt: '', updatedAt: '', ...overrides } as ProductCategory;
}

function makeSupplier(overrides: Partial<Supplier> = {}): Supplier {
  return { id: 'sup_1', name: 'Acme', status: 'active', createdAt: '', updatedAt: '', ...overrides } as Supplier;
}

function makeTaxRate(overrides: Partial<TaxRate> = {}): TaxRate {
  return { id: 'tax_1', code: 'STD', name: 'Standard', treatment: 'standard', rate: 15, appliesTo: 'both', effectiveFrom: '2026-01-01', jurisdiction: 'ZA', ...overrides } as TaxRate;
}

describe('productImportAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetProducts.mockResolvedValue([]);
    mockedGetCategories.mockResolvedValue([]);
    mockedGetSuppliers.mockResolvedValue([]);
    mockedGetTaxRates.mockResolvedValue([]);
  });

  describe('normalizeRow', () => {
    it('accepts a minimally valid row', async () => {
      const ctx = await productImportAdapter.loadContext();
      const { normalized, messages } = productImportAdapter.normalizeRow({ sku: 'PEN-1', name: 'Blue Pen', unitPrice: 5 }, 2, ctx);
      expect(normalized).toMatchObject({ sku: 'PEN-1', name: 'Blue Pen', unitPrice: 5, trackInventory: true, active: true });
      expect(messages).toEqual([]);
    });

    it('errors when SKU or Name is missing', async () => {
      const ctx = await productImportAdapter.loadContext();
      const { normalized, messages } = productImportAdapter.normalizeRow({}, 2, ctx);
      expect(normalized).toBeUndefined();
      expect(messages.some((m) => m.field === 'sku' && m.severity === 'error')).toBe(true);
      expect(messages.some((m) => m.field === 'name' && m.severity === 'error')).toBe(true);
    });

    it('errors on a non-numeric Selling Price', async () => {
      const ctx = await productImportAdapter.loadContext();
      const { normalized, messages } = productImportAdapter.normalizeRow({ sku: 'PEN-1', name: 'Blue Pen', unitPrice: 'abc' }, 2, ctx);
      expect(normalized).toBeUndefined();
      expect(messages.some((m) => m.field === 'unitPrice' && m.severity === 'error')).toBe(true);
    });

    it('resolves a known category to categoryId', async () => {
      mockedGetCategories.mockResolvedValue([makeCategory()]);
      const ctx = await productImportAdapter.loadContext();
      const { normalized } = productImportAdapter.normalizeRow({ sku: 'PEN-1', name: 'Blue Pen', unitPrice: 5, category: 'Stationery' }, 2, ctx);
      expect(normalized?.categoryId).toBe('cat_1');
    });

    it('warns (not errors) on an unknown category and still imports the product', async () => {
      const ctx = await productImportAdapter.loadContext();
      const { normalized, messages } = productImportAdapter.normalizeRow({ sku: 'PEN-1', name: 'Blue Pen', unitPrice: 5, category: 'Nonexistent' }, 2, ctx);
      expect(normalized).toBeDefined();
      expect(normalized?.categoryId).toBeUndefined();
      expect(messages.some((m) => m.field === 'category' && m.severity === 'warning')).toBe(true);
    });

    it('resolves a known supplier to preferredSupplierId', async () => {
      mockedGetSuppliers.mockResolvedValue([makeSupplier()]);
      const ctx = await productImportAdapter.loadContext();
      const { normalized } = productImportAdapter.normalizeRow({ sku: 'PEN-1', name: 'Blue Pen', unitPrice: 5, preferredSupplier: 'Acme' }, 2, ctx);
      expect(normalized?.preferredSupplierId).toBe('sup_1');
    });

    it('resolves a known tax treatment to taxRateId', async () => {
      mockedGetTaxRates.mockResolvedValue([makeTaxRate()]);
      const ctx = await productImportAdapter.loadContext();
      const { normalized } = productImportAdapter.normalizeRow({ sku: 'PEN-1', name: 'Blue Pen', unitPrice: 5, taxTreatment: 'Standard' }, 2, ctx);
      expect(normalized?.taxRateId).toBe('tax_1');
    });
  });

  describe('detectDuplicates', () => {
    it('flags a SKU repeated within the file as an error', async () => {
      const ctx = await productImportAdapter.loadContext();
      const rows: ImportRowResult<ProductImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { sku: 'PEN-1', name: 'A', unitPrice: 5, trackInventory: true, active: true }, severity: 'valid', messages: [] },
        { rowNumber: 3, raw: {}, normalized: { sku: 'pen-1', name: 'B', unitPrice: 5, trackInventory: true, active: true }, severity: 'valid', messages: [] },
      ];
      const result = productImportAdapter.detectDuplicates(rows, ctx);
      expect(result[0].severity).toBe('valid');
      expect(result[1].severity).toBe('error');
    });

    it('flags a SKU that already exists in the app as "duplicate"', async () => {
      mockedGetProducts.mockResolvedValue([makeProduct({ sku: 'PEN-1' })]);
      const ctx = await productImportAdapter.loadContext();
      const rows: ImportRowResult<ProductImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { sku: 'PEN-1', name: 'A', unitPrice: 5, trackInventory: true, active: true }, severity: 'valid', messages: [] },
      ];
      const result = productImportAdapter.detectDuplicates(rows, ctx);
      expect(result[0].severity).toBe('duplicate');
    });
  });

  describe('execute', () => {
    const baseOptions = { duplicateStrategy: 'skip' as const, actorUserId: 'user_1', params: {} };

    it('creates a new product and never sets quantityOnHand (productService.createProduct always starts it at 0)', async () => {
      mockedCreateProduct.mockResolvedValue(makeProduct());
      const ctx: ProductImportContext = { existingBySku: new Map(), categories: [], suppliers: [], taxRates: [] };
      const rows: ImportRowResult<ProductImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { sku: 'PEN-1', name: 'Blue Pen', unitPrice: 5, costPrice: 2, trackInventory: true, active: true }, severity: 'valid', messages: [] },
      ];
      const summary = await productImportAdapter.execute(rows, ctx, baseOptions);
      expect(summary.imported).toBe(1);
      expect(mockedCreateProduct).toHaveBeenCalledWith(expect.objectContaining({ sku: 'PEN-1', name: 'Blue Pen', costPrice: 2 }));
      expect(mockedCreateProduct.mock.calls[0][0]).not.toHaveProperty('quantityOnHand');
    });

    it('skips a duplicate row when the strategy is "skip"', async () => {
      const existing = makeProduct({ sku: 'PEN-1' });
      const ctx: ProductImportContext = { existingBySku: new Map([['pen-1', existing]]), categories: [], suppliers: [], taxRates: [] };
      const rows: ImportRowResult<ProductImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { sku: 'PEN-1', name: 'Blue Pen', unitPrice: 5, trackInventory: true, active: true }, severity: 'duplicate', messages: [] },
      ];
      const summary = await productImportAdapter.execute(rows, ctx, baseOptions);
      expect(summary.skipped).toBe(1);
      expect(mockedUpdateProduct).not.toHaveBeenCalled();
      expect(mockedCreateProduct).not.toHaveBeenCalled();
    });

    it('errors on a duplicate row when the strategy is "error"', async () => {
      const existing = makeProduct({ sku: 'PEN-1' });
      const ctx: ProductImportContext = { existingBySku: new Map([['pen-1', existing]]), categories: [], suppliers: [], taxRates: [] };
      const rows: ImportRowResult<ProductImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { sku: 'PEN-1', name: 'Blue Pen', unitPrice: 5, trackInventory: true, active: true }, severity: 'duplicate', messages: [] },
      ];
      const summary = await productImportAdapter.execute(rows, ctx, { ...baseOptions, duplicateStrategy: 'error' });
      expect(summary.errored).toBe(1);
    });

    it('updates an existing product when the strategy is "update"', async () => {
      const existing = makeProduct({ sku: 'PEN-1', quantityOnHand: 0 });
      mockedUpdateProduct.mockResolvedValue(existing);
      const ctx: ProductImportContext = { existingBySku: new Map([['pen-1', existing]]), categories: [], suppliers: [], taxRates: [] };
      const rows: ImportRowResult<ProductImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { sku: 'PEN-1', name: 'Blue Pen v2', unitPrice: 6, costPrice: 3, trackInventory: true, active: true }, severity: 'duplicate', messages: [] },
      ];
      const summary = await productImportAdapter.execute(rows, ctx, { ...baseOptions, duplicateStrategy: 'update' });
      expect(summary.updated).toBe(1);
      expect(mockedUpdateProduct).toHaveBeenCalledWith('prod_1', expect.objectContaining({ name: 'Blue Pen v2', costPrice: 3 }));
    });

    it('WAC protection: never rewrites costPrice for an existing SKU that already has stock on hand', async () => {
      const existing = makeProduct({ sku: 'PEN-1', quantityOnHand: 50, costPrice: 2 });
      mockedUpdateProduct.mockResolvedValue(existing);
      const ctx: ProductImportContext = { existingBySku: new Map([['pen-1', existing]]), categories: [], suppliers: [], taxRates: [] };
      const rows: ImportRowResult<ProductImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { sku: 'PEN-1', name: 'Blue Pen', unitPrice: 5, costPrice: 999, trackInventory: true, active: true }, severity: 'duplicate', messages: [] },
      ];
      const summary = await productImportAdapter.execute(rows, ctx, { ...baseOptions, duplicateStrategy: 'update' });
      expect(mockedUpdateProduct).toHaveBeenCalledWith('prod_1', expect.objectContaining({ costPrice: 2 }));
      expect(summary.rows[0].message).toMatch(/cost price left unchanged/i);
    });

    it('allows setting costPrice freely on a new product (no stock exists yet)', async () => {
      mockedCreateProduct.mockResolvedValue(makeProduct());
      const ctx: ProductImportContext = { existingBySku: new Map(), categories: [], suppliers: [], taxRates: [] };
      const rows: ImportRowResult<ProductImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { sku: 'PEN-1', name: 'Blue Pen', unitPrice: 5, costPrice: 3.5, trackInventory: true, active: true }, severity: 'valid', messages: [] },
      ];
      await productImportAdapter.execute(rows, ctx, baseOptions);
      expect(mockedCreateProduct).toHaveBeenCalledWith(expect.objectContaining({ costPrice: 3.5 }));
    });

    it('records an error outcome (not a thrown exception) for an error-severity row', async () => {
      const ctx: ProductImportContext = { existingBySku: new Map(), categories: [], suppliers: [], taxRates: [] };
      const rows: ImportRowResult<ProductImportRow>[] = [{ rowNumber: 2, raw: {}, normalized: undefined, severity: 'error', messages: [{ message: 'SKU is required.', severity: 'error' }] }];
      const summary = await productImportAdapter.execute(rows, ctx, baseOptions);
      expect(summary.errored).toBe(1);
      expect(summary.rows[0]).toMatchObject({ outcome: 'error', message: 'SKU is required.' });
    });
  });
});
