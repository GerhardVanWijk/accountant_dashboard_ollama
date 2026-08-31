import type { NewStockAdjustmentLine, StockAdjustment, StockAdjustmentHeader, StockAdjustmentLine } from '@/types';
import { seedStockAdjustments } from '@/mock-data/stockAdjustments';
import type { IStockAdjustmentRepository } from './IStockAdjustmentRepository';
import { MockNormalizedInventoryDocumentRepository } from './MockNormalizedInventoryDocumentRepository';
export class MockStockAdjustmentRepository extends MockNormalizedInventoryDocumentRepository<StockAdjustment, StockAdjustmentLine, StockAdjustmentHeader, NewStockAdjustmentLine> implements IStockAdjustmentRepository {
  constructor(initialData: StockAdjustment[] = seedStockAdjustments) { super(initialData, 'adjustmentId', 'adj'); }
}
