import type { SupabaseClient } from '@supabase/supabase-js';
import type { NewStockAdjustmentLine, StockAdjustment, StockAdjustmentHeader, StockAdjustmentLine } from '@/types';
import type { IStockAdjustmentRepository } from './IStockAdjustmentRepository';
import { SupabaseNormalizedInventoryDocumentRepository as Base } from './SupabaseNormalizedInventoryDocumentRepository';
const s=(v:unknown)=>v as string, opt=(v:unknown)=>v == null?undefined:s(v), n=(v:unknown)=>Number(v);
export class SupabaseStockAdjustmentRepository extends Base<StockAdjustment,StockAdjustmentLine,StockAdjustmentHeader,NewStockAdjustmentLine> implements IStockAdjustmentRepository {
  constructor(client:SupabaseClient){super(client,{repositoryName:'SupabaseStockAdjustmentRepository',headerTable:'stock_adjustments',lineTable:'stock_adjustment_lines',lineForeignKey:'stock_adjustment_id',orderColumn:'adjustment_number',
    rowToHeader:r=>({id:s(r.id),createdAt:s(r.created_at),updatedAt:s(r.updated_at),adjustmentNumber:s(r.adjustment_number),warehouseId:s(r.warehouse_id),adjustmentDate:s(r.adjustment_date),reason:s(r.reason) as StockAdjustment['reason'],notes:opt(r.notes),totalCostEffect:n(r.total_cost_effect),status:s(r.status) as StockAdjustment['status'],approvedBy:opt(r.approved_by),approvedAt:opt(r.approved_at),postedBy:opt(r.posted_by),postedAt:opt(r.posted_at),journalEntryId:opt(r.journal_entry_id)}),
    headerToRow:h=>map({adjustment_number:h.adjustmentNumber,warehouse_id:h.warehouseId,adjustment_date:h.adjustmentDate,reason:h.reason,notes:h.notes,total_cost_effect:h.totalCostEffect,status:h.status,approved_by:h.approvedBy,approved_at:h.approvedAt,posted_by:h.postedBy,posted_at:h.postedAt,journal_entry_id:h.journalEntryId}),
    rowToLine:r=>({id:s(r.id),adjustmentId:s(r.stock_adjustment_id),productId:s(r.product_id),warehouseId:s(r.warehouse_id),quantityDelta:n(r.quantity_delta),unitCost:n(r.unit_cost),costEffect:n(r.cost_effect),notes:opt(r.notes)}),
    lineToRow:l=>map({product_id:l.productId,warehouse_id:l.warehouseId,quantity_delta:l.quantityDelta,unit_cost:l.unitCost,cost_effect:l.costEffect,notes:l.notes})});}
}
function map(row:Record<string,unknown>):Record<string,unknown>{return Object.fromEntries(Object.entries(row).filter(([,v])=>v!==undefined));}
