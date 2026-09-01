import type { StockTransfer, Warehouse } from '@/types';

export interface TransferReportRow {
  transfer: StockTransfer;
  transferNumber: string;
  transferDate: string;
  fromWarehouseName: string;
  toWarehouseName: string;
  status: StockTransfer['status'];
  itemCount: number;
  quantity: number;
  value: number;
  dispatchDate: string;
  receiptDate: string | undefined;
  /** Whole days between dispatch and receipt — `undefined` while still in transit or for a transfer never dispatched (draft/cancelled). */
  inTransitDays: number | undefined;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Document-level Stock Transfer report (spec §9) — every column is a real
 * `StockTransfer` field or a direct sum over its `lineItems`; only
 * `inTransitDays` is derived, from the two real dates already on the
 * document (`transferDate` as the dispatch date, `receivedDate`), never
 * from a separately-tracked "duration" the schema doesn't have.
 */
export function buildTransferReportRows(transfers: StockTransfer[], warehouses: Warehouse[]): TransferReportRow[] {
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  return transfers.map((transfer) => {
    const quantity = transfer.lineItems.reduce((sum, l) => sum + l.quantity, 0);
    const dispatchDate = transfer.transferDate;
    const receiptDate = transfer.receivedDate;
    const inTransitDays =
      receiptDate !== undefined
        ? Math.round((new Date(receiptDate).getTime() - new Date(dispatchDate).getTime()) / MS_PER_DAY)
        : undefined;

    return {
      transfer,
      transferNumber: transfer.transferNumber,
      transferDate: transfer.transferDate,
      fromWarehouseName: warehouseById.get(transfer.fromWarehouseId)?.name ?? transfer.fromWarehouseId,
      toWarehouseName: warehouseById.get(transfer.toWarehouseId)?.name ?? transfer.toWarehouseId,
      status: transfer.status,
      itemCount: transfer.lineItems.length,
      quantity,
      value: transfer.totalCost,
      dispatchDate,
      receiptDate,
      inTransitDays,
    };
  });
}
