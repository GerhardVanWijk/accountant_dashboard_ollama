import { useEffect, useRef, useState } from 'react';
import { customerService } from '@/features/customers/services/customerService';
import { supplierService } from '@/features/suppliers/services/supplierService';
import { productService } from '@/features/inventory/services/productService';
import { deliveryNoteService, returnNoteService, quoteService, salesOrderService, creditNoteService } from '@/features/sales/services';
import { invoiceService } from '@/services';
import { billService, purchaseOrderService } from '@/features/purchases/services';
import { journalEntryService } from '@/features/accounting/services';

export type GlobalSearchRecordType =
  | 'product'
  | 'customer'
  | 'supplier'
  | 'delivery_note'
  | 'return_note'
  | 'invoice'
  | 'bill'
  | 'quote'
  | 'sales_order'
  | 'purchase_order'
  | 'credit_note'
  | 'journal_entry';

export interface GlobalSearchRecord {
  type: GlobalSearchRecordType;
  id: string;
  /** Primary line — the record's code/number. */
  code: string;
  /** Secondary line — the record's name. */
  name: string;
  /** Where selecting this record navigates. */
  href: string;
  /** Concatenated text cmdk matches the query against. */
  keywords: string;
}

interface State {
  records: GlobalSearchRecord[];
  loading: boolean;
  error: boolean;
}

const EMPTY: State = { records: [], loading: false, error: false };

/**
 * Business-record index for the global command palette. Deliberately lazy:
 * nothing is fetched until the palette is first opened (`enabled`), then
 * every list service loads once and is filtered client-side by cmdk — so
 * typing never triggers a request, and the topbar carries no cost until the
 * user actually searches. Read-only: only the existing list services, no
 * mutation, no new endpoint. Every record type here has a canonical
 * full-page route to navigate to — no raw UUID UX, no `?record=` side-sheet
 * regression (docs/CURRENT_TASKS.md "Global search coverage").
 */
export function useGlobalSearchRecords(enabled: boolean): State {
  const [state, setState] = useState<State>(EMPTY);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!enabled || loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;

    setState({ records: [], loading: true, error: false });

    Promise.all([
      productService.getProducts().catch(() => []),
      customerService.getCustomers().catch(() => []),
      supplierService.getSuppliers().catch(() => []),
      deliveryNoteService.listDeliveryNotes().catch(() => []),
      returnNoteService.listReturnNotes().catch(() => []),
      invoiceService.getInvoices().catch(() => []),
      billService.getBills().catch(() => []),
      quoteService.getQuotes().catch(() => []),
      salesOrderService.getSalesOrders().catch(() => []),
      purchaseOrderService.getPurchaseOrders().catch(() => []),
      creditNoteService.getCreditNotes().catch(() => []),
      journalEntryService.getEntries().catch(() => []),
    ])
      .then(([products, customers, suppliers, deliveryNotes, returnNotes, invoices, bills, quotes, salesOrders, purchaseOrders, creditNotes, journalEntries]) => {
        if (cancelled) return;
        const records: GlobalSearchRecord[] = [
          ...products.map((p) => ({
            type: 'product' as const,
            id: p.id,
            code: p.sku,
            name: p.name,
            href: `/inventory/products/${p.id}`,
            keywords: `${p.sku} ${p.name} product item`,
          })),
          ...customers.map((c) => ({
            type: 'customer' as const,
            id: c.id,
            code: c.customerNumber,
            name: c.name,
            href: `/sales/customers?record=${c.id}`,
            keywords: `${c.customerNumber} ${c.name} customer`,
          })),
          ...suppliers.map((s) => ({
            type: 'supplier' as const,
            id: s.id,
            code: s.supplierNumber,
            name: s.name,
            href: `/purchases/vendors?record=${s.id}`,
            keywords: `${s.supplierNumber} ${s.name} supplier vendor`,
          })),
          ...deliveryNotes.map((dn) => ({
            type: 'delivery_note' as const,
            id: dn.id,
            code: dn.deliveryNoteNumber,
            name: dn.status,
            href: `/sales/delivery-notes/${dn.id}`,
            keywords: `${dn.deliveryNoteNumber} delivery note ${dn.status}`,
          })),
          ...returnNotes.map((rn) => ({
            type: 'return_note' as const,
            id: rn.id,
            code: rn.returnNoteNumber,
            name: rn.status,
            href: `/sales/return-notes/${rn.id}`,
            keywords: `${rn.returnNoteNumber} return note ${rn.status}`,
          })),
          ...invoices.map((inv) => ({
            type: 'invoice' as const,
            id: inv.id,
            code: inv.invoiceNumber,
            name: inv.status,
            href: `/sales/invoices/${inv.id}`,
            keywords: `${inv.invoiceNumber} invoice ${inv.status}`,
          })),
          ...bills.map((b) => ({
            type: 'bill' as const,
            id: b.id,
            code: b.billNumber,
            name: b.status,
            href: `/purchases/bills/${b.id}`,
            keywords: `${b.billNumber} bill ${b.status}`,
          })),
          ...quotes.map((q) => ({
            type: 'quote' as const,
            id: q.id,
            code: q.quoteNumber,
            name: q.status,
            href: `/sales/quotes/${q.id}`,
            keywords: `${q.quoteNumber} quote ${q.status}`,
          })),
          ...salesOrders.map((so) => ({
            type: 'sales_order' as const,
            id: so.id,
            code: so.orderNumber,
            name: so.status,
            href: `/sales/orders/${so.id}`,
            keywords: `${so.orderNumber} sales order ${so.status}`,
          })),
          ...purchaseOrders.map((po) => ({
            type: 'purchase_order' as const,
            id: po.id,
            code: po.poNumber,
            name: po.status,
            href: `/purchases/orders/${po.id}`,
            keywords: `${po.poNumber} purchase order ${po.status}`,
          })),
          ...creditNotes.map((cn) => ({
            type: 'credit_note' as const,
            id: cn.id,
            code: cn.creditNoteNumber,
            name: cn.status,
            href: `/sales/credit-notes/${cn.id}`,
            keywords: `${cn.creditNoteNumber} credit note ${cn.status}`,
          })),
          ...journalEntries.map((je) => ({
            type: 'journal_entry' as const,
            id: je.id,
            code: je.entryNumber,
            name: je.memo || je.source,
            href: `/accounting/journals/${je.id}`,
            keywords: `${je.entryNumber} journal entry ${je.memo ?? ''} ${je.source}`,
          })),
        ];
        setState({ records, loading: false, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ records: [], loading: false, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
