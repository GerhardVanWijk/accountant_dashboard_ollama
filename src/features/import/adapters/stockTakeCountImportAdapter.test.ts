import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Product, StockTake } from '@/types';
import { stockTakeCountImportAdapter } from './stockTakeCountImportAdapter';
import { stockTakeService } from '@/features/inventory/services/stockTakeService';
import { productService } from '@/features/inventory/services/productService';
import type { ImportRowResult } from '../types';
import type { StockTakeCountImportContext, StockTakeCountImportRow } from './stockTakeCountImportAdapter';

vi.mock('@/features/inventory/services/stockTakeService', () => ({
  stockTakeService: { getStockTakes: vi.fn(), enterCounts: vi.fn() },
}));
vi.mock('@/features/inventory/services/productService', () => ({
  productService: { getProducts: vi.fn() },
}));

const mockedGetStockTakes = stockTakeService.getStockTakes as unknown as ReturnType<typeof vi.fn>;
const mockedEnterCounts = stockTakeService.enterCounts as unknown as ReturnType<typeof vi.fn>;
const mockedGetProducts = productService.getProducts as unknown as ReturnType<typeof vi.fn>;

function makeProduct(overrides: Partial<Product> = {}): Product {
  return { id: 'prod_1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 5, costPrice: 2, trackInventory: true, quantityOnHand: 0, status: 'active', createdAt: '', updatedAt: '', ...overrides };
}

function makeStockTake(overrides: Partial<StockTake> = {}): StockTake {
  return {
    id: 'stk_1',
    stockTakeNumber: 'STK-0001',
    warehouseId: 'wh_1',
    scope: 'all',
    scopeRef: {},
    countDate: '2026-08-01',
    lineItems: [{ id: 'line_1', stockTakeId: 'stk_1', productId: 'prod_1', warehouseId: 'wh_1', expectedQty: 100, unitCost: 2, varianceQty: 0, varianceValue: 0 }],
    totalVarianceValue: 0,
    status: 'counting',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('stockTakeCountImportAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetProducts.mockResolvedValue([makeProduct()]);
    mockedGetStockTakes.mockResolvedValue([makeStockTake()]);
  });

  it('loadContext only offers stock takes currently being counted', async () => {
    mockedGetStockTakes.mockResolvedValue([makeStockTake({ id: 'stk_1', status: 'counting' }), makeStockTake({ id: 'stk_2', status: 'posted' })]);
    const ctx = await stockTakeCountImportAdapter.loadContext();
    expect(ctx.countingStockTakes.map((s) => s.id)).toEqual(['stk_1']);
  });

  it('confirmFields lists the counting stock takes for selection', async () => {
    const ctx = await stockTakeCountImportAdapter.loadContext();
    const fields = stockTakeCountImportAdapter.confirmFields!(ctx);
    expect(fields[0].options).toEqual([{ value: 'stk_1', label: 'STK-0001' }]);
  });

  describe('normalizeRow', () => {
    it('requires a target stock take to be selected first', async () => {
      const ctx = await stockTakeCountImportAdapter.loadContext();
      const { normalized, messages } = stockTakeCountImportAdapter.normalizeRow({ sku: 'PEN-1', countedQty: 95 }, 2, ctx);
      expect(normalized).toBeUndefined();
      expect(messages.some((m) => /select which stock take/i.test(m.message))).toBe(true);
    });

    it('resolves a SKU already on the frozen sheet to its line id', async () => {
      let ctx = await stockTakeCountImportAdapter.loadContext();
      ctx = stockTakeCountImportAdapter.applyParams!(ctx, { stockTakeId: 'stk_1' });
      const { normalized, messages } = stockTakeCountImportAdapter.normalizeRow({ sku: 'PEN-1', countedQty: 95 }, 2, ctx);
      expect(normalized).toMatchObject({ lineId: 'line_1', countedQty: 95 });
      expect(messages).toEqual([]);
    });

    it('errors on a SKU outside the stock take scope', async () => {
      let ctx = await stockTakeCountImportAdapter.loadContext();
      ctx = stockTakeCountImportAdapter.applyParams!(ctx, { stockTakeId: 'stk_1' });
      mockedGetProducts.mockResolvedValue([makeProduct(), makeProduct({ id: 'prod_2', sku: 'PEN-2' })]);
      ctx = await stockTakeCountImportAdapter.loadContext();
      ctx = stockTakeCountImportAdapter.applyParams!(ctx, { stockTakeId: 'stk_1' });
      const { normalized, messages } = stockTakeCountImportAdapter.normalizeRow({ sku: 'PEN-2', countedQty: 10 }, 2, ctx);
      expect(normalized).toBeUndefined();
      expect(messages.some((m) => /not in this stock take's frozen scope/i.test(m.message))).toBe(true);
    });

    it('errors on a SKU that does not exist at all', async () => {
      let ctx = await stockTakeCountImportAdapter.loadContext();
      ctx = stockTakeCountImportAdapter.applyParams!(ctx, { stockTakeId: 'stk_1' });
      const { normalized, messages } = stockTakeCountImportAdapter.normalizeRow({ sku: 'DOES-NOT-EXIST', countedQty: 10 }, 2, ctx);
      expect(normalized).toBeUndefined();
      expect(messages.some((m) => /was not found/i.test(m.message))).toBe(true);
    });
  });

  describe('detectDuplicates', () => {
    it('errors when the same line is set twice in one file', async () => {
      let ctx = await stockTakeCountImportAdapter.loadContext();
      ctx = stockTakeCountImportAdapter.applyParams!(ctx, { stockTakeId: 'stk_1' });
      const rows: ImportRowResult<StockTakeCountImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { sku: 'PEN-1', lineId: 'line_1', countedQty: 95 }, severity: 'valid', messages: [] },
        { rowNumber: 3, raw: {}, normalized: { sku: 'PEN-1', lineId: 'line_1', countedQty: 90 }, severity: 'valid', messages: [] },
      ];
      const result = stockTakeCountImportAdapter.detectDuplicates(rows, ctx);
      expect(result[1].severity).toBe('error');
    });
  });

  describe('execute', () => {
    it('writes only countedQty via enterCounts — expectedQty/unitCost are never part of the call', async () => {
      const ctx: StockTakeCountImportContext = { productsBySku: new Map(), countingStockTakes: [], selectedStockTakeId: 'stk_1' };
      const rows: ImportRowResult<StockTakeCountImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { sku: 'PEN-1', lineId: 'line_1', countedQty: 95 }, severity: 'valid', messages: [] },
      ];
      await stockTakeCountImportAdapter.execute(rows, ctx, { duplicateStrategy: 'skip', actorUserId: 'user_1', params: { stockTakeId: 'stk_1' } });
      expect(mockedEnterCounts).toHaveBeenCalledWith('stk_1', [{ lineId: 'line_1', countedQty: 95 }]);
    });

    it('never calls enterCounts when every row errors', async () => {
      const ctx: StockTakeCountImportContext = { productsBySku: new Map(), countingStockTakes: [], selectedStockTakeId: 'stk_1' };
      const rows: ImportRowResult<StockTakeCountImportRow>[] = [{ rowNumber: 2, raw: {}, normalized: undefined, severity: 'error', messages: [{ message: 'Not found.', severity: 'error' }] }];
      const summary = await stockTakeCountImportAdapter.execute(rows, ctx, { duplicateStrategy: 'skip', actorUserId: 'user_1', params: { stockTakeId: 'stk_1' } });
      expect(mockedEnterCounts).not.toHaveBeenCalled();
      expect(summary.errored).toBe(1);
    });
  });
});
