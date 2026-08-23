import { SupabaseProductRepository } from './SupabaseProductRepository';
import { SupabaseWarehouseRepository } from './SupabaseWarehouseRepository';
import { SupabaseStockMovementRepository } from './SupabaseStockMovementRepository';
import { MockStockLotRepository } from './MockStockLotRepository';
import { supabase } from '@/config/supabase';

/**
 * Single shared repository instances for the whole inventory feature.
 * productService, warehouseService, stockService, and stockLotService all
 * depend on THESE instances (not separate `new XxxRepository()` calls) so
 * that, e.g., stockService's write to the product repository is visible to
 * productService.getProducts() — one source of truth per entity type for
 * the lifetime of the app session.
 *
 * Product/Warehouse (master data, Phase D) and StockMovement
 * (transactional, append-only, Phase E) are all Supabase-backed now
 * (docs/SUPABASE_MIGRATION_GUIDE.md). StockLot (FIFO costing layers) stays
 * Mock — not in this phase's scope.
 */
export const productRepository = new SupabaseProductRepository(supabase);
export const warehouseRepository = new SupabaseWarehouseRepository(supabase);
export const stockMovementRepository = new SupabaseStockMovementRepository(supabase);
export const stockLotRepository = new MockStockLotRepository();
