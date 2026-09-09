import type {
  Bill,
  CreditNote,
  DeliveryNote,
  Invoice,
  OpeningStockBatch,
  PurchaseOrder,
  ReturnNote,
  StockAdjustment,
  StockTake,
  StockTransfer,
  SupplierReturn,
} from '@/types';

/**
 * The set of `reference` / `source_document_*` values that DO resolve to a
 * real posted document — the `knownDocumentRefs` input that
 * `reconcileInventory()`'s Check F (movement source-evidence completeness)
 * needs to distinguish "this free-text reference points at a real document"
 * from "this movement is unexplained".
 *
 * Check F only ever does `knownDocumentRefs.has(movement.reference)`, so the
 * set carries the human document NUMBER (INV-1072, BILL-2031, TRF-0004, …)
 * — the shape a `reference` is written in — and, defensively, the raw id, so
 * a movement that stored its `reference` as a UUID still resolves.
 *
 * Pure: no I/O. The caller passes documents it has already loaded (the
 * Product workspace and the Inventory Reconciliation report both hold every
 * one of these lists via their existing hooks).
 */
export interface KnownDocumentRefsInput {
  invoices?: Pick<Invoice, 'id' | 'invoiceNumber'>[];
  bills?: Pick<Bill, 'id' | 'billNumber'>[];
  creditNotes?: Pick<CreditNote, 'id' | 'creditNoteNumber'>[];
  purchaseOrders?: Pick<PurchaseOrder, 'id' | 'poNumber'>[];
  adjustments?: Pick<StockAdjustment, 'id' | 'adjustmentNumber'>[];
  transfers?: Pick<StockTransfer, 'id' | 'transferNumber'>[];
  stockTakes?: Pick<StockTake, 'id' | 'stockTakeNumber'>[];
  supplierReturns?: Pick<SupplierReturn, 'id' | 'returnNumber'>[];
  openingStockBatches?: Pick<OpeningStockBatch, 'id' | 'batchNumber'>[];
  deliveryNotes?: Pick<DeliveryNote, 'id' | 'deliveryNoteNumber'>[];
  returnNotes?: Pick<ReturnNote, 'id' | 'returnNoteNumber'>[];
}

export function buildKnownDocumentRefs(input: KnownDocumentRefsInput): Set<string> {
  const refs = new Set<string>();
  const add = (...values: (string | undefined | null)[]) => {
    for (const value of values) {
      if (value != null && value !== '') refs.add(value);
    }
  };

  for (const d of input.invoices ?? []) add(d.id, d.invoiceNumber);
  for (const d of input.bills ?? []) add(d.id, d.billNumber);
  for (const d of input.creditNotes ?? []) add(d.id, d.creditNoteNumber);
  for (const d of input.purchaseOrders ?? []) add(d.id, d.poNumber);
  for (const d of input.adjustments ?? []) add(d.id, d.adjustmentNumber);
  for (const d of input.transfers ?? []) add(d.id, d.transferNumber);
  for (const d of input.stockTakes ?? []) add(d.id, d.stockTakeNumber);
  for (const d of input.supplierReturns ?? []) add(d.id, d.returnNumber);
  for (const d of input.openingStockBatches ?? []) add(d.id, d.batchNumber);
  for (const d of input.deliveryNotes ?? []) add(d.id, d.deliveryNoteNumber);
  for (const d of input.returnNotes ?? []) add(d.id, d.returnNoteNumber);

  return refs;
}
