import type { DeliveryNote } from '@/types';
import type { IRepository } from './IRepository';

/**
 * DeliveryNote-specific repository contract (Phase 5C). Extends the generic
 * IRepository so it stays interchangeable with any future backend-backed
 * implementation. `update()`/`delete()` are used only for the `draft`
 * lifecycle (edit / cancel) — posting NEVER goes through a plain `update()`,
 * it goes through `DeliveryNoteService.postDeliveryNote()` which calls the
 * atomic `post_delivery_note` RPC (migration 0054). See
 * docs/DELIVERY_NOTES_DESIGN.md.
 */
export interface IDeliveryNoteRepository extends IRepository<DeliveryNote> {
  getBySalesOrderId(salesOrderId: string): Promise<DeliveryNote[]>;
  getByCustomerId(customerId: string): Promise<DeliveryNote[]>;
}
