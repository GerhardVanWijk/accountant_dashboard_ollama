import { MockProductRepository } from './MockProductRepository';
import { MockWarehouseRepository } from './MockWarehouseRepository';
import { MockStockMovementRepository } from './MockStockMovementRepository';

/**
 * Single shared in-memory repository instances for the whole inventory
 * feature. productService, warehouseService, and stockService all depend
 * on THESE instances (not separate `new Mock...Repository()` calls) so
 * that, e.g., stockService.recordStockMovement's write to the product
 * repository is visible to productService.getProducts() — one source of
 * truth per entity type for the lifetime of the app session, matching the
 * in-memory-mock decision in docs/ARCHITECTURE.md (ADR 001).
 */
export const productRepository = new MockProductRepository();
export const warehouseRepository = new MockWarehouseRepository();
export const stockMovementRepository = new MockStockMovementRepository();
