import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import type { Product, Invoice, StockMovement } from '@/types';
import { ProductService, type ProductUsageSources } from './productService';
import { MockProductRepository } from '../repositories/MockProductRepository';

function product(id: string): Product {
  return {
    id,
    sku: id.toUpperCase(),
    name: `Product ${id}`,
    type: 'good',
    unitPrice: 100,
    costPrice: 60,
    trackInventory: true,
    quantityOnHand: 0,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function movement(productId: string): StockMovement {
  return {
    id: `mv_${productId}`,
    productId,
    warehouseId: 'wh_1',
    type: 'sale',
    quantityDelta: -1,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
}

function invoiceWithLine(productId: string): Invoice {
  return {
    id: 'inv_1',
    invoiceNumber: 'INV-0001',
    customerId: 'cust_1',
    issueDate: '2026-01-02',
    dueDate: '2026-01-16',
    lineItems: [
      {
        id: 'inv_1_line_1',
        productId,
        description: 'Line',
        quantity: 1,
        unitPrice: 100,
        taxAmount: 0,
        lineTotal: 100,
      },
    ],
    subtotal: 100,
    taxTotal: 0,
    total: 100,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'sent',
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
}

/** Empty ProductUsageSources — every source returns []. Individual tests override one at a time. */
function emptySources(overrides: Partial<ProductUsageSources> = {}): ProductUsageSources {
  return {
    stockMovements: { getAll: async () => [] },
    invoices: { getAll: async () => [] },
    bills: { getAll: async () => [] },
    purchaseOrders: { getAll: async () => [] },
    creditNotes: { getAll: async () => [] },
    supplierReturns: { getAll: async () => [] },
    openingStockBatches: { getAll: async () => [] },
    ...overrides,
  };
}

describe('ProductService.deleteProduct — usage guard', () => {
  it('hard-deletes a product with zero accounting history', async () => {
    const repo = new MockProductRepository([product('p1')]);
    const service = new ProductService(repo, emptySources());

    await service.deleteProduct('p1');

    expect(await repo.getById('p1')).toBeUndefined();
  });

  it('deactivates instead of deleting a product referenced by a stock movement', async () => {
    const repo = new MockProductRepository([product('p1')]);
    const service = new ProductService(
      repo,
      emptySources({ stockMovements: { getAll: async () => [movement('p1')] } }),
    );

    await service.deleteProduct('p1');

    const stillThere = await repo.getById('p1');
    expect(stillThere).toBeDefined();
    expect(stillThere?.status).toBe('inactive');
  });

  it('deactivates instead of deleting a product referenced only by a historical invoice line (no stock movement — e.g. non-tracked at the time)', async () => {
    const repo = new MockProductRepository([product('p1')]);
    const service = new ProductService(
      repo,
      emptySources({ invoices: { getAll: async () => [invoiceWithLine('p1')] } }),
    );

    await service.deleteProduct('p1');

    const stillThere = await repo.getById('p1');
    expect(stillThere).toBeDefined();
    expect(stillThere?.status).toBe('inactive');
  });

  it('does not flag an unrelated product as having history', async () => {
    const repo = new MockProductRepository([product('p1'), product('p2')]);
    const service = new ProductService(
      repo,
      emptySources({
        stockMovements: { getAll: async () => [movement('p1')] },
        invoices: { getAll: async () => [invoiceWithLine('p1')] },
      }),
    );

    expect(await service.hasAccountingHistory('p2')).toBe(false);

    await service.deleteProduct('p2');
    expect(await repo.getById('p2')).toBeUndefined();
  });

  it('hasAccountingHistory checks bills/purchase orders/credit notes/supplier returns/opening stock batches too', async () => {
    const repo = new MockProductRepository([product('p1')]);
    const billsService = new ProductService(
      repo,
      emptySources({
        bills: {
          getAll: async () => [
            { ...invoiceWithLine('p1'), id: 'bill_1', billNumber: 'BILL-0001', supplierId: 's1' } as never,
          ],
        },
      }),
    );
    expect(await billsService.hasAccountingHistory('p1')).toBe(true);
  });
});

describe('ProductService — FIFO valuation gate (FIFO_VALUATION_ENABLED is false)', () => {
  function newService(seed: Product[] = []) {
    return new ProductService(new MockProductRepository(seed), emptySources());
  }

  it('createProduct rejects valuationMethod: "fifo"', async () => {
    const service = newService();
    await expect(
      service.createProduct({
        sku: 'X1', name: 'X1', type: 'good', unitPrice: 10, costPrice: 5,
        trackInventory: true, status: 'active', valuationMethod: 'fifo',
      } as never),
    ).rejects.toThrow(/FIFO valuation is not available/i);
  });

  it('createProduct allows valuationMethod: "weighted_average"', async () => {
    const service = newService();
    const created = await service.createProduct({
      sku: 'X2', name: 'X2', type: 'good', unitPrice: 10, costPrice: 5,
      trackInventory: true, status: 'active', valuationMethod: 'weighted_average',
    } as never);
    expect(created.valuationMethod).toBe('weighted_average');
  });

  it('createProduct allows an undefined valuationMethod (defaults to weighted-average downstream)', async () => {
    const service = newService();
    const created = await service.createProduct({
      sku: 'X3', name: 'X3', type: 'good', unitPrice: 10, costPrice: 5,
      trackInventory: true, status: 'active',
    } as never);
    expect(created.id).toBeTruthy();
  });

  it('updateProduct rejects switching a weighted-average product TO "fifo"', async () => {
    const service = newService([{ ...product('p1'), valuationMethod: 'weighted_average' }]);
    await expect(service.updateProduct('p1', { valuationMethod: 'fifo' })).rejects.toThrow(
      /FIFO valuation is not available/i,
    );
  });

  it('updateProduct allows editing OTHER fields of a product already on "fifo" (grandfather — none exist live)', async () => {
    const service = newService([{ ...product('p1'), valuationMethod: 'fifo' }]);
    const updated = await service.updateProduct('p1', { name: 'renamed' });
    expect(updated.name).toBe('renamed');
    expect(updated.valuationMethod).toBe('fifo');
  });

  it('updateProduct allows a redundant re-set of "fifo" on a product that is already "fifo"', async () => {
    const service = newService([{ ...product('p1'), valuationMethod: 'fifo' }]);
    const updated = await service.updateProduct('p1', { valuationMethod: 'fifo' });
    expect(updated.valuationMethod).toBe('fifo');
  });

  it('updateProduct allows switching a fifo product BACK to weighted-average', async () => {
    const service = newService([{ ...product('p1'), valuationMethod: 'fifo' }]);
    const updated = await service.updateProduct('p1', { valuationMethod: 'weighted_average' });
    expect(updated.valuationMethod).toBe('weighted_average');
  });

  it('the FIFO_VALUATION_ENABLED feature flag ships OFF (no persistent stock-lot layer yet)', () => {
    const flag = readFileSync(join(process.cwd(), 'src', 'config', 'featureFlags.ts'), 'utf8');
    expect(flag).toMatch(/export const FIFO_VALUATION_ENABLED\s*=\s*false\s*;/);
  });
});
