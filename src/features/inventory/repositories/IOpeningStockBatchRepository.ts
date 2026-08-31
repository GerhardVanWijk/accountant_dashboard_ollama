import type { NewOpeningStockLine, OpeningStockBatch, OpeningStockBatchHeader, OpeningStockLine } from '@/types';
import type { INormalizedInventoryDocumentRepository } from './INormalizedInventoryDocumentRepository';

/**
 * Opening-stock-batch repository contract (migration 0029). Same generic
 * CRUD shape as IWarehouseRepository — see IProductRepository.ts for the
 * pattern. Persistent child rows are hydrated into `lineItems`; the
 * confirm-with-explicit-consent rule lives in
 * openingStockBatchService, not here.
 */
export type IOpeningStockBatchRepository = INormalizedInventoryDocumentRepository<
  OpeningStockBatch, OpeningStockLine, OpeningStockBatchHeader, Partial<OpeningStockBatchHeader>,
  NewOpeningStockLine, Partial<NewOpeningStockLine>
>;
