import { InvoiceService } from './invoiceService';
import { SupabaseInvoiceRepository } from '@/repositories/SupabaseInvoiceRepository';
import { accountMappingService } from '@/features/accounting/services';
import {
  inventoryAccountResolver,
  periodGuardedInventoryPostingEngine,
} from '@/features/inventory/services/inventoryPostingEngineInstance';
import { productService } from '@/features/inventory/services/productService';
import { warehouseService } from '@/features/inventory/services/warehouseService';
import { supabase } from '@/config/supabase';

export type { CreateInvoiceDTO } from './invoiceService';
export { InvoiceService } from './invoiceService';

/**
 * Shared InvoiceService singleton. Phase 3: it no longer posts through
 * `journalEntryService` + a separate `inventoryPoster` — the ONE atomic
 * inventory posting engine (`periodGuardedInventoryPostingEngine`) posts
 * the single revenue/AR/VAT + COGS/inventory journal entry and moves stock
 * in one RPC. Accounts resolve product → category → generic key via
 * `inventoryAccountResolver` (the deprecated `CategoryAccountMappingService`
 * read path is gone).
 *
 * TODO(Queen — instances.ts): inject the engine / resolver / product /
 * warehouse singletons from a single composition root instead of importing
 * them here.
 */
export const invoiceService = new InvoiceService(
  new SupabaseInvoiceRepository(supabase),
  periodGuardedInventoryPostingEngine,
  inventoryAccountResolver,
  accountMappingService,
  productService,
  warehouseService,
);
