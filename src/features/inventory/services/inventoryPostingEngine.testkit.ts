import type { ID, Product } from '@/types';
import type { AccountMapper, AccountMappingKey } from '@/features/accounting/services';
import { InventoryPostingEngine } from './inventoryPostingEngine';
import { FakeInventoryStore, FakeInventoryTransactionExecutor } from './inventoryPostingEngine.fake';
import { InventoryAccountResolverService } from './inventoryAccountResolver';
import type { PostingProductLookup } from './inventoryPostingEngineInstance';
import type { StockTakeFreezeExecutor } from './stockTakeService';
import type { IStockTakeRepository } from '../repositories/IStockTakeRepository';

/**
 * Shared wiring for the five Phase-3 workflow-service tests: a real
 * `InventoryPostingEngine` over the in-memory `FakeInventoryStore`, a
 * deterministic account resolver (`acc-<KEY>` for a generic key,
 * `acc-INVENTORY` for a product with no override/category), and a product
 * lookup that shares product ids with the store.
 */
export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    sku: 'SKU-1',
    name: 'Widget',
    type: 'good',
    unitPrice: 100,
    costPrice: 0,
    trackInventory: true,
    quantityOnHand: 0,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const fakeAccountMapper: AccountMapper = {
  getAccountId: async (key: AccountMappingKey) => `acc-${key}`,
};

export interface PostingTestKit {
  store: FakeInventoryStore;
  engine: InventoryPostingEngine;
  resolver: InventoryAccountResolverService;
  products: PostingProductLookup;
  /** The raw product catalog shared with `products` — scope filters read it directly. */
  productCatalog: Map<ID, Product>;
  /** Seed a product into BOTH the ledger store and the product lookup. */
  seed(product: Product, opts?: { quantityOnHand?: number; costPrice?: number; warehouseId?: string }): Product;
  /**
   * A `StockTakeFreezeExecutor` that mirrors migration 0036's
   * `freeze_stock_take` over the fake store: for every tracked product in the
   * take's scope it snapshots `expectedQty` from the per-warehouse balance and
   * `unitCost` from the product's current cost, replaces the take's lines, and
   * stamps `frozenAt` / `status = counting`.
   */
  freezeExecutor(repository: IStockTakeRepository): StockTakeFreezeExecutor;
}

export function makePostingTestKit(): PostingTestKit {
  const store = new FakeInventoryStore();
  const engine = new InventoryPostingEngine(new FakeInventoryTransactionExecutor(store));
  const resolver = new InventoryAccountResolverService(fakeAccountMapper, {
    getCategory: async () => undefined,
  });
  const productStore = new Map<ID, Product>();
  const products: PostingProductLookup = { getById: async (id) => productStore.get(id) };

  return {
    store,
    engine,
    resolver,
    products,
    productCatalog: productStore,
    seed(product, opts = {}) {
      const qoh = opts.quantityOnHand ?? product.quantityOnHand ?? 0;
      const cost = opts.costPrice ?? product.costPrice ?? 0;
      const resolved: Product = { ...product, quantityOnHand: qoh, costPrice: cost };
      productStore.set(product.id, resolved);
      store.addProduct(product.id, qoh, cost);
      if (opts.warehouseId) store.setBalance(product.id, opts.warehouseId, qoh);
      return resolved;
    },
    freezeExecutor(repository) {
      return {
        async freeze(stockTakeId: ID) {
          const take = await repository.getById(stockTakeId);
          if (!take) throw new Error(`freeze_stock_take: stock take ${stockTakeId} not found`);
          const productIds = new Set(take.scopeRef.productIds ?? []);
          const scoped = [...productStore.values()]
            .filter((p) => p.trackInventory)
            .filter((p) => {
              if (take.scope === 'all') return true;
              if (take.scope === 'category') return p.categoryId === take.scopeRef.categoryId;
              return productIds.has(p.id);
            })
            .sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : a.id < b.id ? -1 : 1));

          for (const line of take.lineItems) await repository.deleteLine(stockTakeId, line.id);
          for (const p of scoped) {
            await repository.createLine(stockTakeId, {
              productId: p.id,
              warehouseId: take.warehouseId,
              expectedQty: store.balance(p.id, take.warehouseId),
              unitCost: store.products.get(p.id)?.costPrice ?? p.costPrice,
              varianceQty: 0,
              varianceValue: 0,
            });
          }
          const frozenAt = new Date().toISOString();
          await repository.updateHeader(stockTakeId, {
            status: 'counting',
            frozenAt,
            totalVarianceValue: 0,
          });
          return { frozenAt, lineCount: scoped.length };
        },
      };
    },
  };
}
