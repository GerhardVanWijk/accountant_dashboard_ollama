import type { CreditNoteLineItem, Invoice } from '@/types';
import type { IInvoiceRepository } from '@/repositories/IInvoiceRepository';
import { QuoteService } from './quoteService';
import { SalesOrderService } from './salesOrderService';
import { RpcSalesOrderDraftInvoiceWriter } from './salesOrderDraftInvoiceWriter';
import { CreditNoteService } from './creditNoteService';
import { CustomerReceiptService } from './customerReceiptService';
import { RealDepositAllocationExecutor } from './depositAllocationExecutor';
import { DeliveryNoteService, RpcDeliveryNotePoster } from './deliveryNoteService';
import { ReturnNoteService, RpcReturnNotePoster } from './returnNoteService';
import { SupabaseQuoteRepository } from '@/repositories/SupabaseQuoteRepository';
import { SupabaseSalesOrderRepository } from '@/repositories/SupabaseSalesOrderRepository';
import { SupabaseCreditNoteRepository } from '@/repositories/SupabaseCreditNoteRepository';
import { SupabaseCustomerReceiptRepository } from '@/repositories/SupabaseCustomerReceiptRepository';
import { SupabaseDeliveryNoteRepository } from '@/repositories/SupabaseDeliveryNoteRepository';
import { SupabaseReturnNoteRepository } from '@/repositories/SupabaseReturnNoteRepository';
import { journalEntryService, accountMappingService } from '@/features/accounting/services';
import { invoiceService } from '@/services';
import {
  inventoryAccountResolver,
  periodGuardedInventoryPostingEngine,
} from '@/features/inventory/services/inventoryPostingEngineInstance';
import { productService } from '@/features/inventory/services/productService';
import { warehouseService } from '@/features/inventory/services/warehouseService';
import { supabase } from '@/config/supabase';
import { SupabaseDocumentLineProjector } from '@/repositories/SupabaseDocumentLineProjector';
import { RealInvoiceFrozenCostLookup } from '@/features/inventory/services/invoiceFrozenCostLookup';
import { auditLogService } from '@/services/auditLogService';

export type { CreateQuoteDTO } from './quoteService';
export type { CreateSalesOrderDTO } from './salesOrderService';
export type { CreateCreditNoteDTO } from './creditNoteService';
export type { CreateCustomerReceiptDTO } from './customerReceiptService';
export type { CreateDeliveryNoteDTO, UpdateDeliveryNoteDTO, CreateDeliveryNoteLineDTO } from './deliveryNoteService';
export type { CreateReturnNoteDTO, UpdateReturnNoteDTO, CreateReturnNoteLineDTO, ReturnableDeliveryNoteLine } from './returnNoteService';
export { QuoteService } from './quoteService';
export { SalesOrderService } from './salesOrderService';
export { CreditNoteService } from './creditNoteService';
export { CustomerReceiptService } from './customerReceiptService';
export { DeliveryNoteService } from './deliveryNoteService';
export { ReturnNoteService, computeReturnableDeliveryNoteLines } from './returnNoteService';

const quoteRepository = new SupabaseQuoteRepository(supabase);
const salesOrderRepository = new SupabaseSalesOrderRepository(supabase);
const creditNoteRepository = new SupabaseCreditNoteRepository(supabase);
const customerReceiptRepository = new SupabaseCustomerReceiptRepository(supabase);
const deliveryNoteRepository = new SupabaseDeliveryNoteRepository(supabase);
const returnNoteRepository = new SupabaseReturnNoteRepository(supabase);

/**
 * SalesOrderService.convertToInvoice() writes new invoices straight through
 * an IInvoiceRepository (repository-level, not service-level) — see
 * salesOrderService.ts. Constructing a fresh `new MockInvoiceRepository()`
 * here would create invoices in a store the Invoices page never reads
 * from, the exact same "silently writes to a different in-memory invoice
 * store" bug this dispatch's brief warns about for CreditNoteService/
 * CustomerReceiptService. Since `src/services/index.ts` is frozen and only
 * exports the `invoiceService` instance (not its internal repository),
 * this adapter satisfies IInvoiceRepository by delegating every method to
 * that SAME shared singleton, so a sales-order conversion and the Invoices
 * page always see the same in-memory invoice data.
 */
class SharedInvoiceRepositoryAdapter implements IInvoiceRepository {
  async getAll(): Promise<Invoice[]> {
    return invoiceService.getInvoices();
  }
  async getById(id: string): Promise<Invoice | undefined> {
    return invoiceService.getInvoice(id);
  }
  async create(entity: Invoice): Promise<Invoice> {
    return invoiceService.createInvoice(entity);
  }
  async update(id: string, patch: Partial<Invoice>): Promise<Invoice> {
    return invoiceService.updateInvoice(id, patch);
  }
  async delete(id: string): Promise<void> {
    return invoiceService.deleteInvoice(id);
  }
}

const sharedInvoiceRepository = new SharedInvoiceRepositoryAdapter();

/**
 * Wires the Order-to-Cash services to their Phase 0 mock repositories.
 * QuoteService/SalesOrderService never post to the GL (see their class
 * docs) so they only need their own + each other's repositories.
 * CreditNoteService/CustomerReceiptService post through the real GL engine
 * (journalEntryService) — the same shared singleton every other feature's
 * services/index.ts posts through — and both depend on an
 * InvoicePaymentRecorder-shaped object, wired here to the SHARED
 * `invoiceService` singleton from `@/services` (not a fresh
 * `new InvoiceService(...)`) so a credit-note allocation or a receipt
 * allocation and the Invoices page always see the same in-memory invoice
 * data, per this dispatch's brief.
 */
// Phase 9B (docs/PHASE_9B_DESIGN.md): no-ops until
// NORMALIZED_DOCUMENT_LINES_ENABLED (src/config/featureFlags.ts) is
// flipped true AND migration 0041 has actually been applied.
const creditNoteLineProjector = new SupabaseDocumentLineProjector(supabase, {
  projectorName: 'creditNoteLineProjector',
  lineTable: 'credit_note_lines',
  foreignKeyColumn: 'credit_note_id',
  extraColumns: (line) => ({ original_invoice_line_id: (line as CreditNoteLineItem).originalInvoiceLineId ?? null }),
});

export const quoteService = new QuoteService(quoteRepository, salesOrderRepository);
export const salesOrderService = new SalesOrderService(
  salesOrderRepository,
  sharedInvoiceRepository,
  undefined,
  // Phase 5B FINAL: route draft-invoice creation through the atomic
  // `create_invoice_from_sales_order` RPC (migration 0049) — the DB locks the
  // Sales Order and re-derives remaining quantities, so a concurrent
  // create/create can never over-invoice a line. Re-reads the created row
  // through the SAME shared invoice repository the Invoices page uses.
  new RpcSalesOrderDraftInvoiceWriter(supabase, sharedInvoiceRepository),
);
export const creditNoteService = new CreditNoteService(
  creditNoteRepository,
  periodGuardedInventoryPostingEngine,
  invoiceService,
  accountMappingService,
  inventoryAccountResolver,
  productService,
  warehouseService,
  creditNoteLineProjector,
  // Part 5 (docs/CURRENT_TASKS.md): reverses a return at the ORIGINAL sale's
  // frozen cost when `originalInvoiceLineId` evidence exists, instead of
  // today's current WAC.
  new RealInvoiceFrozenCostLookup(supabase),
);
export const customerReceiptService = new CustomerReceiptService(
  customerReceiptRepository,
  journalEntryService,
  invoiceService,
  accountMappingService,
  // Increment 4A: applying a deposit to an invoice runs entirely inside the
  // atomic `apply_customer_deposit` RPC (migration 0046).
  new RealDepositAllocationExecutor(supabase),
);

/**
 * Phase 5C. Posting always runs through the atomic `post_delivery_note` RPC
 * (migration 0054, live) — `RpcDeliveryNotePoster` calls it directly; this
 * service never builds a `stock_movements`/`journal_entries` row itself.
 */
export const deliveryNoteService = new DeliveryNoteService(
  deliveryNoteRepository,
  salesOrderRepository,
  sharedInvoiceRepository,
  accountMappingService,
  inventoryAccountResolver,
  productService,
  warehouseService,
  new RpcDeliveryNotePoster(supabase),
  auditLogService,
  // Completion-run stabilization (Part 1): nets posted Return Notes into
  // every remaining-to-deliver pre-check, matching the atomic
  // `post_delivery_note` RPC's own re-derivation (migration 0061).
  returnNoteRepository,
);

/**
 * Phase 5D. Posting always runs through the atomic `post_return_note` RPC
 * (migration 0058, live) — `RpcReturnNotePoster` calls it directly; this
 * service never builds a `stock_movements`/`journal_entries` row itself.
 */
export const returnNoteService = new ReturnNoteService(
  returnNoteRepository,
  deliveryNoteRepository,
  sharedInvoiceRepository,
  accountMappingService,
  inventoryAccountResolver,
  productService,
  new RpcReturnNotePoster(supabase),
);
