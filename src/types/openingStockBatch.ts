import type { BaseEntity, ID, ISODateString } from './common';

export type OpeningStockBatchStatus = 'draft' | 'confirmed' | 'cancelled';

export interface OpeningStockLine {
  id: ID;
  openingStockBatchId: ID;
  productId: ID;
  warehouseId: ID;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export type OpeningStockBatchHeader = Omit<OpeningStockBatch, 'lineItems'>;
export type NewOpeningStockLine = Omit<OpeningStockLine, 'id' | 'openingStockBatchId'> & { id?: ID };

/**
 * The deliberate, accounting-significant workflow for capturing opening
 * inventory (migration 0029). A `draft` batch can be populated (including by
 * import); confirming it PREVIEWS the accounting effect
 * (DR 1200 Inventory / CR `offsetAccountId`, default 3950 Opening Balance
 * Equity) and requires explicit user confirmation before it posts. Confirming
 * generates `opening` movements and one balanced GL entry.
 */
export interface OpeningStockBatch extends BaseEntity {
  batchNumber: string;
  effectiveDate: ISODateString;
  warehouseId: ID;
  lineItems: OpeningStockLine[];
  totalCost: number;
  /** The credit side of the opening entry — defaults to the company's 3950 Opening Balance Equity. */
  offsetAccountId?: ID;
  status: OpeningStockBatchStatus;
  confirmedBy?: ID;
  confirmedAt?: ISODateString;
  journalEntryId?: ID;
  notes?: string;
}
