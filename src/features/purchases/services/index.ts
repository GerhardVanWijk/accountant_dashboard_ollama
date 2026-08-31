import { BillService } from './billService';
import { PurchaseOrderService } from './purchaseOrderService';
import { PaymentService } from './paymentService';
import { SupabaseBillRepository } from '@/repositories/SupabaseBillRepository';
import { SupabasePurchaseOrderRepository } from '@/repositories/SupabasePurchaseOrderRepository';
import { SupabasePaymentRepository } from '@/repositories/SupabasePaymentRepository';
import { journalEntryService, accountMappingService } from '@/features/accounting/services';
import { taxRateService } from '@/features/tax/services';
import {
  inventoryAccountResolver,
  periodGuardedInventoryPostingEngine,
} from '@/features/inventory/services/inventoryPostingEngineInstance';
import { productService } from '@/features/inventory/services/productService';
import { warehouseService } from '@/features/inventory/services/warehouseService';
import { fixedAssetService } from '@/features/assets/services';
import { supabase } from '@/config/supabase';

export type { CreateBillDTO } from './billService';
export type { CreatePurchaseOrderDTO } from './purchaseOrderService';
export type { CreatePaymentDTO } from './paymentService';
export { BillService } from './billService';
export { PurchaseOrderService } from './purchaseOrderService';
export { PaymentService } from './paymentService';

/**
 * Wires the Purchases services to the shared singletons. Phase 3:
 * `PurchaseOrderService.recordReceipt()` and `BillService.postBill()` post
 * their inventory / GRNI / AP side through the ONE atomic inventory posting
 * engine (`periodGuardedInventoryPostingEngine`) — one journal entry per
 * document, WAC + stock moved in the same RPC, accounts resolved
 * product → category → generic key via `inventoryAccountResolver`. They no
 * longer take a `JournalPoster` or the deprecated `CategoryAccountMappingService`.
 *
 * `purchaseOrderService` is declared BEFORE `billService` and passed
 * directly to it so `postBill()`'s GRNI check sees the SAME in-memory PO
 * store the Purchase Orders page reads/writes.
 *
 * `paymentService` still posts through `journalEntryService` directly — it
 * touches no inventory and is out of Phase 3 scope.
 *
 * TODO(Queen — instances.ts): inject engine / resolver / product /
 * warehouse from a single composition root.
 */
export const purchaseOrderService = new PurchaseOrderService(
  new SupabasePurchaseOrderRepository(supabase),
  periodGuardedInventoryPostingEngine,
  inventoryAccountResolver,
  productService,
  warehouseService,
);
export const billService = new BillService(
  new SupabaseBillRepository(supabase),
  periodGuardedInventoryPostingEngine,
  taxRateService,
  purchaseOrderService,
  fixedAssetService,
  accountMappingService,
  inventoryAccountResolver,
  productService,
  warehouseService,
);
export const paymentService = new PaymentService(
  new SupabasePaymentRepository(supabase),
  journalEntryService,
  billService,
  accountMappingService,
);
