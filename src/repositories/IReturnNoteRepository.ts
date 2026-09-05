import type { ReturnNote } from '@/types';
import type { IRepository } from './IRepository';

/**
 * ReturnNote-specific repository contract (Phase 5D). Extends the generic
 * IRepository so it stays interchangeable with any future backend-backed
 * implementation. `update()`/`delete()` are used only for the `draft`
 * lifecycle (edit / cancel) — posting NEVER goes through a plain `update()`,
 * it goes through `ReturnNoteService.postReturnNote()` which calls the
 * atomic `post_return_note` RPC (migration 0058).
 */
export interface IReturnNoteRepository extends IRepository<ReturnNote> {
  getByDeliveryNoteId(deliveryNoteId: string): Promise<ReturnNote[]>;
  getBySalesOrderId(salesOrderId: string): Promise<ReturnNote[]>;
  getByCustomerId(customerId: string): Promise<ReturnNote[]>;
}
