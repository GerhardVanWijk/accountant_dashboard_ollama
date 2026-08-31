import type { ID, Product } from '@/types';
import { supabase } from '@/config/supabase';
import { accountMappingService, accountingPeriodService } from '@/features/accounting/services';
import { InventoryPostingEngine } from './inventoryPostingEngine';
import { RealInventoryTransactionExecutor } from './inventoryPostingEngine.real';
import type { StockTakeFreezeExecutor } from './stockTakeService';
import { InventoryAccountResolverService, type InventoryAccountResolver } from './inventoryAccountResolver';
import { periodGuardFrom } from './documentInventoryPosting';
import { productCategoryService } from './productCategoryService';
import { productService } from './productService';

/**
 * Shared, lazily-usable singletons that wire the five greenfield inventory
 * document workflow services (stock adjustment / transfer / take / opening
 * stock / supplier return) to the ONE atomic posting engine.
 *
 * TODO(Queen — instances.ts): this file `new`s the production engine directly
 * against the app-wide `supabase` client and the Mock-backed
 * `productCategoryService`. When the inventory feature gets a real
 * `instances.ts` composition root, inject these three (`inventoryPostingEngine`,
 * `inventoryAccountResolver`, `postingProductLookup`) instead of importing the
 * singletons, exactly as `repositories/instances.ts` already does for the
 * repository layer. The service classes are exported and take these as
 * constructor dependencies precisely so that swap is a one-line change.
 */

/** Narrow product surface the workflow services need to resolve GL accounts + WAC. */
export interface PostingProductLookup {
  getById(id: ID): Promise<Product | undefined>;
}

/** The production posting engine — one Supabase RPC (`post_inventory_transaction`) per transaction. */
export const inventoryPostingEngine = new InventoryPostingEngine(
  new RealInventoryTransactionExecutor(supabase),
);

/** Resolves inventory / adjustment / in-transit / opening-offset accounts (product → category → generic key). */
export const inventoryAccountResolver: InventoryAccountResolver = new InventoryAccountResolverService(
  accountMappingService,
  productCategoryService,
);

/** Product-by-id lookup backed by the shared `productService` singleton. */
export const postingProductLookup: PostingProductLookup = {
  getById: (id: ID) => productService.getProduct(id),
};

/**
 * Atomic stock-take freeze — one call to `public.freeze_stock_take`
 * (migration 0036). The RPC locks every scoped product, replaces the take's
 * lines with an authoritative `stock_balances` + `products.cost_price`
 * snapshot, and stamps `frozen_at` — all in one transaction.
 */
export const stockTakeFreezeExecutor: StockTakeFreezeExecutor = {
  async freeze(stockTakeId: ID): Promise<{ frozenAt: string; lineCount: number }> {
    const { data, error } = await supabase.rpc('freeze_stock_take', { p_stock_take_id: stockTakeId });
    if (error) throw new Error(`freeze_stock_take: ${error.message}`);
    const d = (data ?? {}) as Record<string, unknown>;
    return { frozenAt: String(d.frozen_at ?? ''), lineCount: Number(d.line_count ?? 0) };
  },
};

/**
 * Engine variant that additionally rejects a posting dated outside an open
 * accounting period — used by the Sales / Purchases document services
 * (invoice / bill / PO receipt / credit note), which previously got that
 * guard for free from `journalEntryService.postJournalEntry()`. The five
 * greenfield inventory workflows keep using the bare `inventoryPostingEngine`
 * (their own services own the period question).
 *
 * TODO(Queen — instances.ts): fold this into the single composition root
 * alongside `inventoryPostingEngine`; today both `new` the production
 * executor against the app-wide `supabase` client directly.
 *
 * The period guard is resolved lazily (at posting time, not module load) so
 * that a leaf import of this module never forces `accountingPeriodService` to
 * exist — tests that `vi.mock('@/features/accounting/services')` and only
 * touch unrelated screens must not be dragged into mocking it.
 */
const lazyOpenPeriodGuard = {
  assertOpenForDate: (isoDate: string): Promise<void> =>
    periodGuardFrom(accountingPeriodService).assertOpenForDate(isoDate),
};
export const periodGuardedInventoryPostingEngine = new InventoryPostingEngine(
  new RealInventoryTransactionExecutor(supabase),
  lazyOpenPeriodGuard,
);
