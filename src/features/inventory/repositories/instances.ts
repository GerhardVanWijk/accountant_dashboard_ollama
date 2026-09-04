import { SupabaseProductRepository } from './SupabaseProductRepository';
import { SupabaseWarehouseRepository } from './SupabaseWarehouseRepository';
import { SupabaseStockMovementRepository } from './SupabaseStockMovementRepository';
import { MockStockLotRepository } from './MockStockLotRepository';
import { SupabaseProductCategoryRepository } from './SupabaseProductCategoryRepository';
import { SupabaseStockBalanceRepository } from './SupabaseStockBalanceRepository';
import { SupabaseStockAdjustmentRepository } from './SupabaseStockAdjustmentRepository';
import { SupabaseStockTransferRepository } from './SupabaseStockTransferRepository';
import { SupabaseStockTakeRepository } from './SupabaseStockTakeRepository';
import { SupabaseOpeningStockBatchRepository } from './SupabaseOpeningStockBatchRepository';
import { SupabaseSupplierReturnRepository } from './SupabaseSupplierReturnRepository';
import { SupabaseSalesOrderRepository } from '@/repositories/SupabaseSalesOrderRepository';
import { SupabaseInvoiceRepository } from '@/repositories/SupabaseInvoiceRepository';
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

/**
 * Inventory Accounting Module (Phase 3). Migrations 0024, 0026, 0027-0029 are
 * applied to the shared project, so the category / balance / adjustment /
 * transfer / stock-take / opening-stock / supplier-return repositories are all
 * Supabase-backed now. The greenfield workflow services (stockAdjustmentService
 * etc.) depend on THESE instances — one source of truth per entity for the app
 * session, same as the block above. Tests inject their own fakes and never
 * touch these.
 */
export const productCategoryRepository = new SupabaseProductCategoryRepository(supabase);
export const stockBalanceRepository = new SupabaseStockBalanceRepository(supabase);
export const stockAdjustmentRepository = new SupabaseStockAdjustmentRepository(supabase);
export const stockTransferRepository = new SupabaseStockTransferRepository(supabase);
export const stockTakeRepository = new SupabaseStockTakeRepository(supabase);
export const openingStockBatchRepository = new SupabaseOpeningStockBatchRepository(supabase);
export const supplierReturnRepository = new SupabaseSupplierReturnRepository(supabase);

/**
 * Read-only, used by `stockCommitmentService` for the derived stock-commitment
 * model (Phase 5A) — recompute `quantityCommitted` from confirmed Sales Order
 * lines on read, no schema change and no Supabase write. A second
 * Supabase-backed instance is safe: shared DB, no in-memory divergence (the
 * hazard is only with `Mock*Repository`), so this never disagrees with the
 * sales feature's own `SupabaseSalesOrderRepository`.
 */
export const salesOrderRepository = new SupabaseSalesOrderRepository(supabase);

/**
 * Read-only, used by `stockCommitmentService` (Phase 5B.3) to net each
 * confirmed Sales Order line down to its remaining un-fulfilled commitment
 * (`orderedQty − Σ posted invoice-line qty linked via `salesOrderLineId`).
 * Same safety note as `salesOrderRepository` above: a second Supabase-backed
 * instance over the shared client, no in-memory divergence.
 */
export const invoiceRepository = new SupabaseInvoiceRepository(supabase);
