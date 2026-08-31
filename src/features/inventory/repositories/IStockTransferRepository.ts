import type { NewStockTransferLine, StockTransfer, StockTransferHeader, StockTransferLine } from '@/types';
import type { INormalizedInventoryDocumentRepository } from './INormalizedInventoryDocumentRepository';

/**
 * Inter-warehouse stock transfer contract (migration 0027). Extends the
 * generic IRepository, mirroring IFixedAssetRepository — the row is
 * editable/deletable subject to stockTransferService's own draft-only
 * guards; once dispatched the transfer is in-flight and must be cancelled
 * rather than deleted (docs/INVENTORY_ACCOUNTING.md § "Warehouse transfer").
 */
export type IStockTransferRepository = INormalizedInventoryDocumentRepository<
  StockTransfer, StockTransferLine, StockTransferHeader, Partial<StockTransferHeader>,
  NewStockTransferLine, Partial<NewStockTransferLine>
>;
