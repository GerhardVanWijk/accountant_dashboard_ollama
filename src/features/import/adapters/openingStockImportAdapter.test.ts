import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Product, Warehouse } from '@/types';
import { openingStockImportAdapter } from './openingStockImportAdapter';
import { openingStockBatchService } from '@/features/inventory/services/openingStockBatchService';
import { productService } from '@/features/inventory/services/productService';
import { warehouseService } from '@/features/inventory/services/warehouseService';
import type { ImportRowResult } from '../types';
import type { OpeningStockImportContext, OpeningStockImportRow } from './openingStockImportAdapter';

vi.mock('@/features/inventory/services/openingStockBatchService', () => ({
  openingStockBatchService: { createOpeningStockBatch: vi.fn() },
}));
vi.mock('@/features/inventory/services/productService', () => ({
  productService: { getProducts: vi.fn() },
}));
vi.mock('@/features/inventory/services/warehouseService', () => ({
  warehouseService: { getWarehouses: vi.fn() },
}));

const mockedCreateBatch = openingStockBatchService.createOpeningStockBatch as unknown as ReturnType<typeof vi.fn>;
const mockedGetProducts = productService.getProducts as unknown as ReturnType<typeof vi.fn>;
const mockedGetWarehouses = warehouseService.getWarehouses as unknown as ReturnType<typeof vi.fn>;

function makeProduct(overrides: Partial<Product> = {}): Product {
  return { id: 'prod_1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 5, costPrice: 2, trackInventory: true, quantityOnHand: 0, status: 'active', createdAt: '', updatedAt: '', ...overrides };
}

function makeWarehouse(overrides: Partial<Warehouse> = {}): Warehouse {
  return { id: 'wh_1', name: 'Main', isDefault: true, isActive: true, createdAt: '', updatedAt: '', ...overrides } as Warehouse;
}

describe('openingStockImportAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetProducts.mockResolvedValue([makeProduct()]);
    mockedGetWarehouses.mockResolvedValue([makeWarehouse()]);
  });

  describe('normalizeRow', () => {
    it('accepts a valid row and resolves productId/warehouseId', async () => {
      const ctx = await openingStockImportAdapter.loadContext();
      const { normalized, messages } = openingStockImportAdapter.normalizeRow({ sku: 'PEN-1', warehouse: 'Main', quantity: 10, unitCost: 2 }, 2, ctx);
      expect(normalized).toMatchObject({ productId: 'prod_1', warehouseId: 'wh_1', quantity: 10, unitCost: 2 });
      expect(messages).toEqual([]);
    });

    it('errors when the SKU does not exist — never auto-creates a product', async () => {
      const ctx = await openingStockImportAdapter.loadContext();
      const { normalized, messages } = openingStockImportAdapter.normalizeRow({ sku: 'UNKNOWN', warehouse: 'Main', quantity: 10, unitCost: 2 }, 2, ctx);
      expect(normalized).toBeUndefined();
      expect(messages.some((m) => m.field === 'sku' && /not found/i.test(m.message))).toBe(true);
    });

    it('errors when the warehouse does not exist', async () => {
      const ctx = await openingStockImportAdapter.loadContext();
      const { normalized, messages } = openingStockImportAdapter.normalizeRow({ sku: 'PEN-1', warehouse: 'Cape Town', quantity: 10, unitCost: 2 }, 2, ctx);
      expect(normalized).toBeUndefined();
      expect(messages.some((m) => m.field === 'warehouse' && /does not exist/i.test(m.message))).toBe(true);
    });

    it('errors on a zero or negative quantity', async () => {
      const ctx = await openingStockImportAdapter.loadContext();
      const { messages } = openingStockImportAdapter.normalizeRow({ sku: 'PEN-1', warehouse: 'Main', quantity: 0, unitCost: 2 }, 2, ctx);
      expect(messages.some((m) => m.field === 'quantity' && m.severity === 'error')).toBe(true);
    });
  });

  describe('execute', () => {
    it('creates exactly ONE draft opening stock batch from every valid line — never posts', async () => {
      mockedCreateBatch.mockResolvedValue({ id: 'osb_1' });
      const ctx: OpeningStockImportContext = { productsBySku: new Map(), warehousesByName: new Map() };
      const rows: ImportRowResult<OpeningStockImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { sku: 'PEN-1', productId: 'prod_1', warehouseName: 'Main', warehouseId: 'wh_1', quantity: 10, unitCost: 2 }, severity: 'valid', messages: [] },
        { rowNumber: 3, raw: {}, normalized: { sku: 'PEN-2', productId: 'prod_2', warehouseName: 'Main', warehouseId: 'wh_1', quantity: 5, unitCost: 3 }, severity: 'valid', messages: [] },
      ];
      const summary = await openingStockImportAdapter.execute(rows, ctx, { duplicateStrategy: 'skip', actorUserId: 'user_1', params: {} });
      expect(mockedCreateBatch).toHaveBeenCalledTimes(1);
      expect(mockedCreateBatch.mock.calls[0][0].lineItems).toHaveLength(2);
      expect(mockedCreateBatch.mock.calls[0][0].warehouseId).toBe('wh_1');
      expect(summary.imported).toBe(2);
      expect(summary.draftRecordId).toBe('osb_1');
    });

    it('never calls createOpeningStockBatch when every row errors', async () => {
      const ctx: OpeningStockImportContext = { productsBySku: new Map(), warehousesByName: new Map() };
      const rows: ImportRowResult<OpeningStockImportRow>[] = [{ rowNumber: 2, raw: {}, normalized: undefined, severity: 'error', messages: [{ message: 'SKU not found.', severity: 'error' }] }];
      const summary = await openingStockImportAdapter.execute(rows, ctx, { duplicateStrategy: 'skip', actorUserId: 'user_1', params: {} });
      expect(mockedCreateBatch).not.toHaveBeenCalled();
      expect(summary.errored).toBe(1);
    });
  });
});
