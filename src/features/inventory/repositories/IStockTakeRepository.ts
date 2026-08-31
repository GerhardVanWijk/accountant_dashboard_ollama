import type { NewStockTakeLine, StockTake, StockTakeHeader, StockTakeLine } from '@/types';
import type { INormalizedInventoryDocumentRepository } from './INormalizedInventoryDocumentRepository';

/**
 * Stock-take repository contract (migration 0028). Same generic CRUD shape
 * as IWarehouseRepository — see IProductRepository.ts for the pattern. The
 * Persistent child rows carry stable line IDs and aggregate reads hydrate
 * them into `lineItems`; lifecycle/variance rules remain in stockTakeService.
 */
export type IStockTakeRepository = INormalizedInventoryDocumentRepository<
  StockTake, StockTakeLine, StockTakeHeader, Partial<StockTakeHeader>,
  NewStockTakeLine, Partial<NewStockTakeLine>
>;
