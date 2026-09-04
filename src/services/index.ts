import type { Invoice } from '@/types';
import { InvoiceService } from './invoiceService';
import { SupabaseInvoiceRepository } from '@/repositories/SupabaseInvoiceRepository';
import { SupabaseSalesOrderRepository } from '@/repositories/SupabaseSalesOrderRepository';
import { isFullyPostedInvoiced } from '@/features/sales/utils/salesOrderFulfilment';
import { accountMappingService } from '@/features/accounting/services';
import {
  inventoryAccountResolver,
  periodGuardedInventoryPostingEngine,
} from '@/features/inventory/services/inventoryPostingEngineInstance';
import { productService } from '@/features/inventory/services/productService';
import { warehouseService } from '@/features/inventory/services/warehouseService';
import { supabase } from '@/config/supabase';
import { SupabaseDocumentLineProjector } from '@/repositories/SupabaseDocumentLineProjector';

export type { CreateInvoiceDTO } from './invoiceService';
export { InvoiceService } from './invoiceService';

/**
 * Phase 9B (docs/PHASE_9B_DESIGN.md): no-ops until
 * NORMALIZED_DOCUMENT_LINES_ENABLED (src/config/featureFlags.ts) is
 * flipped true AND migrations 0038 has actually been applied.
 */
const invoiceLineProjector = new SupabaseDocumentLineProjector(supabase, {
  projectorName: 'invoiceLineProjector',
  lineTable: 'invoice_lines',
  foreignKeyColumn: 'invoice_id',
});

const invoiceRepositoryForService = new SupabaseInvoiceRepository(supabase);

/**
 * Phase 5B.2: when an SO-derived invoice posts and it now completes every
 * line's POSTED coverage, flip the Sales Order's stored commercial status
 * `confirmed → fulfilled`. Read-only `SupabaseSalesOrderRepository` (same
 * "second instance is safe over the shared client" note as
 * `stockCommitmentService`). Pure `isFullyPostedInvoiced` decides. Draft
 * invoices never reach here (postInvoice only calls this after a successful
 * post), so a later draft edit/delete can't strand a stale `fulfilled`.
 */
const salesOrderRepositoryForSync = new SupabaseSalesOrderRepository(supabase);
async function syncSalesOrderStatusAfterPost(invoice: Invoice): Promise<void> {
  if (!invoice.salesOrderId) return;
  const order = await salesOrderRepositoryForSync.getById(invoice.salesOrderId);
  // `confirmed` → the normal path. `closed` → defensive: the order's remainder
  // was abandoned but a still-open draft was posted anyway and now completes
  // every line — the truthful state is `fulfilled`, not a stale `closed`.
  if (!order || (order.status !== 'confirmed' && order.status !== 'closed')) return;
  const allInvoices = await invoiceRepositoryForService.getAll();
  if (isFullyPostedInvoiced(order, allInvoices)) {
    await salesOrderRepositoryForSync.update(order.id, { status: 'fulfilled' });
  }
}

/**
 * Shared InvoiceService singleton. Phase 3: it no longer posts through
 * `journalEntryService` + a separate `inventoryPoster` — the ONE atomic
 * inventory posting engine (`periodGuardedInventoryPostingEngine`) posts
 * the single revenue/AR/VAT + COGS/inventory journal entry and moves stock
 * in one RPC.
 */
export const invoiceService = new InvoiceService(
  invoiceRepositoryForService,
  periodGuardedInventoryPostingEngine,
  inventoryAccountResolver,
  accountMappingService,
  productService,
  warehouseService,
  invoiceLineProjector,
  undefined,
  syncSalesOrderStatusAfterPost,
);
