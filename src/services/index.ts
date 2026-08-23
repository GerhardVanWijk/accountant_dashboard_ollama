import { InvoiceService } from './invoiceService';
import { SupabaseInvoiceRepository } from '@/repositories/SupabaseInvoiceRepository';
import { journalEntryService, accountMappingService } from '@/features/accounting/services';
import { inventoryPoster } from '@/features/inventory/services/inventoryPostingAdapter';
import { supabase } from '@/config/supabase';

export type { CreateInvoiceDTO } from './invoiceService';
export { InvoiceService } from './invoiceService';

/**
 * Shared InvoiceService singleton wired to the real GL posting engine
 * (journalEntryService) — the same shared singleton
 * src/features/purchases/services/index.ts and
 * src/features/banking/services/index.ts post through. Sales feature
 * services (CreditNoteService, CustomerReceiptService) that need to call
 * InvoiceService.recordPayment() import this singleton rather than
 * constructing their own InvoiceService, so a credit-note allocation or a
 * receipt allocation and the Invoices page always see the same data.
 * Supabase-backed since docs/SUPABASE_MIGRATION_GUIDE.md Phase E — this is
 * the one swap that also makes `sales/services/index.ts`'s
 * `SharedInvoiceRepositoryAdapter` (which delegates to this exact
 * singleton rather than constructing its own repository) real too, with
 * zero changes to that adapter or any of its callers.
 */
export const invoiceService = new InvoiceService(
  new SupabaseInvoiceRepository(supabase),
  journalEntryService,
  inventoryPoster,
  accountMappingService,
);
