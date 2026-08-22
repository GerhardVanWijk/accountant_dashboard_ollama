import type { ID, StockLot } from '@/types';

/**
 * Unlike IStockMovementRepository, this DOES have update() — StockLot's
 * `quantityRemaining` is a deliberate, narrow exception to the append-only
 * ledger philosophy (see src/types/stockLot.ts's class doc). Only
 * `quantityRemaining` should ever be patched via update(); every other
 * field is set once at create() and never changes.
 */
export interface IStockLotRepository {
  getAll(): Promise<StockLot[]>;
  getById(id: ID): Promise<StockLot | undefined>;
  create(entity: StockLot): Promise<StockLot>;
  update(id: ID, patch: Partial<StockLot>): Promise<StockLot>;
}
