import { InvoiceService } from './invoiceService';
import { MockInvoiceRepository } from '@/repositories/mock/MockInvoiceRepository';
import { journalEntryService } from '@/features/accounting/services';

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
 * receipt allocation and the Invoices page always see the same in-memory
 * invoice data.
 */
export const invoiceService = new InvoiceService(new MockInvoiceRepository(), journalEntryService);
