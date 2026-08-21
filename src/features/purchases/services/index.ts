import { BillService } from './billService';
import { PurchaseOrderService } from './purchaseOrderService';
import { PaymentService } from './paymentService';
import { MockBillRepository } from '@/repositories/mock/MockBillRepository';
import { MockPurchaseOrderRepository } from '@/repositories/mock/MockPurchaseOrderRepository';
import { MockPaymentRepository } from '@/repositories/mock/MockPaymentRepository';
import { journalEntryService } from '@/features/accounting/services';
import { taxRateService } from '@/features/tax/services';
import { inventoryPoster } from '@/features/inventory/services/inventoryPostingAdapter';

export type { CreateBillDTO } from './billService';
export type { CreatePurchaseOrderDTO } from './purchaseOrderService';
export type { CreatePaymentDTO } from './paymentService';
export { BillService } from './billService';
export { PurchaseOrderService } from './purchaseOrderService';
export { PaymentService } from './paymentService';

/**
 * Wires the services to their Phase 0 mock repositories, and BillService/
 * PaymentService to the real GL posting engine (journalEntryService) — the
 * same shared singleton bankTransactionService.ts posts through — so a
 * bill/payment posted here is immediately visible in the trial balance and
 * subject to accountingPeriodService's period-open rule.
 * Hooks depend on these singletons instead of importing repositories directly.
 */
export const billService = new BillService(new MockBillRepository(), journalEntryService, taxRateService, inventoryPoster);
export const purchaseOrderService = new PurchaseOrderService(new MockPurchaseOrderRepository());
export const paymentService = new PaymentService(new MockPaymentRepository(), journalEntryService, billService);
