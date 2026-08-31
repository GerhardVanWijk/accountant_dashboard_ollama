import type { NewOpeningStockLine, OpeningStockBatch, OpeningStockBatchHeader, OpeningStockLine } from '@/types';
import { seedOpeningStockBatches } from '@/mock-data/openingStockBatches';
import type { IOpeningStockBatchRepository } from './IOpeningStockBatchRepository';
import { MockNormalizedInventoryDocumentRepository } from './MockNormalizedInventoryDocumentRepository';
export class MockOpeningStockBatchRepository extends MockNormalizedInventoryDocumentRepository<OpeningStockBatch, OpeningStockLine, OpeningStockBatchHeader, NewOpeningStockLine> implements IOpeningStockBatchRepository {
  constructor(initialData: OpeningStockBatch[] = seedOpeningStockBatches) { super(initialData, 'openingStockBatchId', 'osb'); }
}
