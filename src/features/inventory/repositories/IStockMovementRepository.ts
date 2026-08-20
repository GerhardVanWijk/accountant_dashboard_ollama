import type { ID, StockMovement } from '@/types';

/**
 * Append-only ledger contract — deliberately NARROWER than the generic
 * IRepository<T>. StockMovement rows are immutable
 * (docs/INVENTORY_DOMAIN.md § Stock Control Protocol /
 * docs/DO_NOT_BREAK.md § Inventory & Stock: "Update quantities directly ->
 * always use stock movement ledger" and "Create stock movements without
 * logging them" are both forbidden, and so is editing history). This
 * interface has no update()/delete() at all, so a caller cannot even
 * attempt to mutate a past entry — the only write path is create().
 */
export interface IStockMovementRepository {
  getAll(): Promise<StockMovement[]>;
  getById(id: ID): Promise<StockMovement | undefined>;
  create(entity: StockMovement): Promise<StockMovement>;
}
