import { BillService } from './billService';
import { PurchaseOrderService } from './purchaseOrderService';
import { PaymentService } from './paymentService';
import { MockBillRepository } from '@/repositories/mock/MockBillRepository';
import { MockPurchaseOrderRepository } from '@/repositories/mock/MockPurchaseOrderRepository';
import { MockPaymentRepository } from '@/repositories/mock/MockPaymentRepository';
import { journalEntryService } from '@/features/accounting/services';
import { taxRateService } from '@/features/tax/services';
import { inventoryPoster } from '@/features/inventory/services/inventoryPostingAdapter';
import { fixedAssetService } from '@/features/assets/services';

export type { CreateBillDTO } from './billService';
export type { CreatePurchaseOrderDTO } from './purchaseOrderService';
export type { CreatePaymentDTO } from './paymentService';
export { BillService } from './billService';
export { PurchaseOrderService } from './purchaseOrderService';
export { PaymentService } from './paymentService';

/**
 * Wires the services to their Phase 0 mock repositories, and BillService/
 * PurchaseOrderService/PaymentService to the real GL posting engine
 * (journalEntryService) — the same shared singleton
 * bankTransactionService.ts posts through — so a bill/PO-receipt/payment
 * posted here is immediately visible in the trial balance and subject to
 * accountingPeriodService's period-open rule.
 * Hooks depend on these singletons instead of importing repositories directly.
 *
 * `purchaseOrderService` is declared BEFORE `billService` and passed
 * directly to it (not a fresh lookup) so `postBill()`'s GRNI check
 * (`purchaseOrders.getPurchaseOrder()`) always sees the SAME in-memory PO
 * store the Purchase Orders page reads/writes — the same
 * "two-disconnected-singletons" bug class already fixed once for
 * InvoiceService/CustomerService in this codebase, avoided here by
 * construction rather than caught later.
 */
export const purchaseOrderService = new PurchaseOrderService(
  new MockPurchaseOrderRepository(),
  journalEntryService,
  inventoryPoster,
);
export const billService = new BillService(
  new MockBillRepository(),
  journalEntryService,
  taxRateService,
  inventoryPoster,
  purchaseOrderService,
  fixedAssetService,
);
export const paymentService = new PaymentService(new MockPaymentRepository(), journalEntryService, billService);
