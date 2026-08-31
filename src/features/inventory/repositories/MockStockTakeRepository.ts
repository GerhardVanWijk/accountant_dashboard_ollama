import type { NewStockTakeLine, StockTake, StockTakeHeader, StockTakeLine } from '@/types';
import { seedStockTakes } from '@/mock-data/stockTakes';
import type { IStockTakeRepository } from './IStockTakeRepository';
import { MockNormalizedInventoryDocumentRepository } from './MockNormalizedInventoryDocumentRepository';
export class MockStockTakeRepository extends MockNormalizedInventoryDocumentRepository<StockTake, StockTakeLine, StockTakeHeader, NewStockTakeLine> implements IStockTakeRepository {
  constructor(initialData: StockTake[] = seedStockTakes) { super(initialData, 'stockTakeId', 'stk'); }
}
