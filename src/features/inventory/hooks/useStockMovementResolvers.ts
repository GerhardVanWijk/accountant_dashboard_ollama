import { useMemo } from 'react';
import type { ID, Product, StockMovement, StockTransfer, Warehouse } from '@/types';
import { resolveSourceDocument, type ResolvedSourceDocument } from '@/components/app/record-page';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerList } from '@/features/sales/hooks/useCustomerMap';
import { useCreditNotes } from '@/features/sales/hooks/useCreditNotes';
import { useQuotes } from '@/features/sales/hooks/useQuotes';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useDeliveryNotes } from '@/features/sales/hooks/useDeliveryNotes';
import { useBills } from '@/features/purchases/hooks/useBills';
import { usePurchaseOrders } from '@/features/purchases/hooks/usePurchaseOrders';
import { useJournalEntries } from '@/features/accounting/hooks/useJournalEntries';
import { useProducts } from './useProducts';
import { useWarehouses } from './useWarehouses';
import { useStockAdjustments } from './useStockAdjustments';
import { useStockTransfers } from './useStockTransfers';
import { useStockTakes } from './useStockTakes';
import { useSupplierReturns } from './useSupplierReturns';
import { useOpeningStockBatches } from './useOpeningStockBatches';
import { buildKnownDocumentRefs } from '../services/knownDocumentRefs';
import {
  resolveMovementAccounting,
  type MovementAccounting,
} from '../services/movementAccounting';

export interface StockMovementResolvers {
  /** Resolve a movement's source into a human doc number + route + preview type. Never a UUID. */
  resolveSource: (m: StockMovement) => ResolvedSourceDocument | undefined;
  /** The accounting trace (journal, inventory GL + contra, posting key, reversal). */
  resolveAccounting: (m: StockMovement) => MovementAccounting | undefined;
  /** Customer / supplier behind the movement, where derivable. */
  resolveParty: (m: StockMovement) => string | undefined;
  /** The resolved warehouse (for `<WarehouseReference>` / `<WarehouseRoute>`); undefined for an unknown id. */
  warehouse: (id: ID) => Warehouse | undefined;
  warehouseName: (id: ID) => string;
  productName: (id: ID) => string;
  productSku: (id: ID) => string;
  /** The Check-F reference set (ids + document numbers of every posted document). */
  knownDocumentRefs: Set<string>;
  products: Product[];
  warehouses: Warehouse[];
  transfers: StockTransfer[];
  /** True while any of the underlying collections is still loading. */
  loading: boolean;
}

/**
 * Loads every document collection a stock-movement view needs to turn raw
 * `source_document_type` / `source_document_id` / `product_id` / `warehouse_id`
 * UUIDs into human names, and to attach the accounting trace. Shared by the
 * Product workspace ledger and the global Stock Movements page so the two
 * resolve identically.
 */
export function useStockMovementResolvers(): StockMovementResolvers {
  const { products, loading: productsLoading } = useProducts();
  const { warehouses, loading: warehousesLoading } = useWarehouses();
  const { suppliers } = useSuppliers();
  const { customers } = useCustomerList();
  const { invoices, loading: invoicesLoading } = useInvoices();
  const { bills, isLoading: billsLoading } = useBills();
  const { creditNotes } = useCreditNotes();
  const { quotes } = useQuotes();
  const { salesOrders } = useSalesOrders();
  const { purchaseOrders } = usePurchaseOrders();
  const { adjustments } = useStockAdjustments();
  const { transfers } = useStockTransfers();
  const { stockTakes } = useStockTakes();
  const { supplierReturns } = useSupplierReturns();
  const { batches } = useOpeningStockBatches();
  const { deliveryNotes } = useDeliveryNotes();
  const { entries: journalEntries } = useJournalEntries();

  const numberById = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of invoices) map.set(i.id, i.invoiceNumber);
    for (const b of bills) map.set(b.id, b.billNumber);
    for (const c of creditNotes) map.set(c.id, c.creditNoteNumber);
    for (const q of quotes) map.set(q.id, q.quoteNumber);
    for (const o of salesOrders) map.set(o.id, o.orderNumber);
    for (const p of purchaseOrders) map.set(p.id, p.poNumber);
    for (const a of adjustments) map.set(a.id, a.adjustmentNumber);
    for (const t of transfers) map.set(t.id, t.transferNumber);
    for (const s of stockTakes) map.set(s.id, s.stockTakeNumber);
    for (const r of supplierReturns) map.set(r.id, r.returnNumber);
    for (const batch of batches) map.set(batch.id, batch.batchNumber);
    for (const dn of deliveryNotes) map.set(dn.id, dn.deliveryNoteNumber);
    return map;
  }, [invoices, bills, creditNotes, quotes, salesOrders, purchaseOrders, adjustments, transfers, stockTakes, supplierReturns, batches, deliveryNotes]);

  const journalEntryIdBySource = useMemo(() => {
    const map = new Map<string, string>();
    const put = (id: string, jeId?: string) => {
      if (jeId) map.set(id, jeId);
    };
    for (const i of invoices) put(i.id, i.journalEntryId);
    for (const b of bills) put(b.id, b.journalEntryId);
    for (const c of creditNotes) put(c.id, c.journalEntryId);
    for (const p of purchaseOrders) put(p.id, p.journalEntryId);
    for (const a of adjustments) put(a.id, a.journalEntryId);
    for (const s of stockTakes) put(s.id, s.journalEntryId);
    for (const r of supplierReturns) put(r.id, r.journalEntryId);
    for (const batch of batches) put(batch.id, batch.journalEntryId);
    for (const t of transfers) put(t.id, t.dispatchedJournalEntryId ?? t.receivedJournalEntryId);
    return map;
  }, [invoices, bills, creditNotes, purchaseOrders, adjustments, stockTakes, supplierReturns, batches, transfers]);

  const journalNumberById = useMemo(
    () => new Map(journalEntries.map((e) => [e.id, e.entryNumber])),
    [journalEntries],
  );

  const knownDocumentRefs = useMemo(
    () =>
      buildKnownDocumentRefs({
        invoices,
        bills,
        creditNotes,
        purchaseOrders,
        adjustments,
        transfers,
        stockTakes,
        supplierReturns,
        openingStockBatches: batches,
        deliveryNotes,
      }),
    [invoices, bills, creditNotes, purchaseOrders, adjustments, transfers, stockTakes, supplierReturns, batches, deliveryNotes],
  );

  return useMemo<StockMovementResolvers>(() => {
    const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
    const productById = new Map(products.map((p) => [p.id, p]));
    const supplierById = new Map(suppliers.map((s) => [s.id, s.name]));
    const customerById = new Map(customers.map((c) => [c.id, c.name]));
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));
    const billById = new Map(bills.map((b) => [b.id, b]));
    const creditNoteById = new Map(creditNotes.map((c) => [c.id, c]));
    const poById = new Map(purchaseOrders.map((p) => [p.id, p]));

    return {
      resolveSource: (m) =>
        resolveSourceDocument(
          { type: m.sourceDocumentType, id: m.sourceDocumentId, reference: m.reference },
          (_type, id) => numberById.get(id),
        ),
      resolveAccounting: (m) =>
        resolveMovementAccounting(m, { journalEntryIdBySource, journalNumberById }),
      resolveParty: (m) => {
        if (m.sourceDocumentType === 'invoice') {
          const inv = m.sourceDocumentId ? invoiceById.get(m.sourceDocumentId) : undefined;
          return inv ? customerById.get(inv.customerId) : undefined;
        }
        if (m.sourceDocumentType === 'credit_note') {
          const cn = m.sourceDocumentId ? creditNoteById.get(m.sourceDocumentId) : undefined;
          return cn ? customerById.get(cn.customerId) : undefined;
        }
        if (m.sourceDocumentType === 'bill') {
          const bill = m.sourceDocumentId ? billById.get(m.sourceDocumentId) : undefined;
          return bill ? supplierById.get(bill.supplierId) : undefined;
        }
        if (m.sourceDocumentType === 'purchase_order') {
          const po = m.sourceDocumentId ? poById.get(m.sourceDocumentId) : undefined;
          return po ? supplierById.get(po.supplierId) : undefined;
        }
        return undefined;
      },
      warehouse: (id) => warehouseById.get(id),
      warehouseName: (id) => warehouseById.get(id)?.name ?? id,
      productName: (id) => productById.get(id)?.name ?? id,
      productSku: (id) => productById.get(id)?.sku ?? '',
      knownDocumentRefs,
      products,
      warehouses,
      transfers,
      loading: productsLoading || warehousesLoading || invoicesLoading || billsLoading,
    };
  }, [
    warehouses, products, suppliers, customers, invoices, bills, creditNotes, purchaseOrders,
    numberById, journalEntryIdBySource, journalNumberById, knownDocumentRefs, transfers,
    productsLoading, warehousesLoading, invoicesLoading, billsLoading,
  ]);
}
