import type { Invoice } from '@/types';
import type { IInvoiceRepository } from '@/repositories/IInvoiceRepository';
import { QuoteService } from './quoteService';
import { SalesOrderService } from './salesOrderService';
import { CreditNoteService } from './creditNoteService';
import { CustomerReceiptService } from './customerReceiptService';
import { MockQuoteRepository } from '@/repositories/mock/MockQuoteRepository';
import { MockSalesOrderRepository } from '@/repositories/mock/MockSalesOrderRepository';
import { MockCreditNoteRepository } from '@/repositories/mock/MockCreditNoteRepository';
import { MockCustomerReceiptRepository } from '@/repositories/mock/MockCustomerReceiptRepository';
import { journalEntryService } from '@/features/accounting/services';
import { invoiceService } from '@/services';

export type { CreateQuoteDTO } from './quoteService';
export type { CreateSalesOrderDTO } from './salesOrderService';
export type { CreateCreditNoteDTO } from './creditNoteService';
export type { CreateCustomerReceiptDTO } from './customerReceiptService';
export { QuoteService } from './quoteService';
export { SalesOrderService } from './salesOrderService';
export { CreditNoteService } from './creditNoteService';
export { CustomerReceiptService } from './customerReceiptService';

const quoteRepository = new MockQuoteRepository();
const salesOrderRepository = new MockSalesOrderRepository();
const creditNoteRepository = new MockCreditNoteRepository();
const customerReceiptRepository = new MockCustomerReceiptRepository();

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
export const quoteService = new QuoteService(quoteRepository, salesOrderRepository);
export const salesOrderService = new SalesOrderService(salesOrderRepository, sharedInvoiceRepository);
export const creditNoteService = new CreditNoteService(creditNoteRepository, journalEntryService, invoiceService);
export const customerReceiptService = new CustomerReceiptService(
  customerReceiptRepository,
  journalEntryService,
  invoiceService,
);
