import { BillService } from './billService';
import { PurchaseOrderService } from './purchaseOrderService';
import { MockBillRepository } from '@/repositories/mock/MockBillRepository';
import { MockPurchaseOrderRepository } from '@/repositories/mock/MockPurchaseOrderRepository';

export type { CreateBillDTO } from './billService';
export type { CreatePurchaseOrderDTO } from './purchaseOrderService';

/**
 * Wires the services to their Phase 0 mock repositories.
 * Hooks depend on these singletons instead of importing repositories directly.
 */
export const billService = new BillService(new MockBillRepository());
export const purchaseOrderService = new PurchaseOrderService(new MockPurchaseOrderRepository());
