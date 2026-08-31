import type { NewStockAdjustmentLine, StockAdjustment, StockAdjustmentHeader, StockAdjustmentLine } from '@/types';
import type { INormalizedInventoryDocumentRepository } from './INormalizedInventoryDocumentRepository';

/**
 * Stock adjustment document contract (migration 0027). Extends the generic
 * IRepository, mirroring IFixedAssetRepository — the register row is
 * editable/deletable subject to stockAdjustmentService's own draft-only
 * guards; a posted adjustment is immutable (a correction is a new
 * adjustment, per docs/INVENTORY_ACCOUNTING.md § "Stock adjustment").
 */
export type IStockAdjustmentRepository = INormalizedInventoryDocumentRepository<
  StockAdjustment, StockAdjustmentLine, StockAdjustmentHeader, Partial<StockAdjustmentHeader>,
  NewStockAdjustmentLine, Partial<NewStockAdjustmentLine>
>;
