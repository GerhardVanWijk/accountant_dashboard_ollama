import type { NewStockTransferLine, StockTransfer, StockTransferHeader, StockTransferLine } from '@/types';
import { seedStockTransfers } from '@/mock-data/stockTransfers';
import type { IStockTransferRepository } from './IStockTransferRepository';
import { MockNormalizedInventoryDocumentRepository } from './MockNormalizedInventoryDocumentRepository';
export class MockStockTransferRepository extends MockNormalizedInventoryDocumentRepository<StockTransfer, StockTransferLine, StockTransferHeader, NewStockTransferLine> implements IStockTransferRepository {
  constructor(initialData: StockTransfer[] = seedStockTransfers) { super(initialData, 'transferId', 'trf'); }
}
