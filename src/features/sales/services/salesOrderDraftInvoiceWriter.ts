import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, Invoice, SalesOrder } from '@/types';
import type { IInvoiceRepository } from '@/repositories/IInvoiceRepository';
import { newUuid } from '@/lib/uuid';
import { documentNumberPrefix, nextDocumentNumber } from '@/features/purchases/utils/nextDocumentNumber';
import { NORMALIZED_DOCUMENT_LINES_ENABLED } from '@/config/featureFlags';
import type {
  BuiltInvoiceFromSelections,
  SalesOrderInvoiceSelection,
} from '../utils/salesOrderFulfilment';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface DraftInvoiceWriteInput {
  order: SalesOrder;
  existingInvoices: Invoice[];
  /** The validated + built lines/totals — used by the local writer. */
  built: BuiltInvoiceFromSelections;
  /** The raw selection — handed to the DB RPC, which rebuilds authoritatively. */
  selections: readonly SalesOrderInvoiceSelection[];
  createdBy?: ID;
}

/**
 * Persists a DRAFT invoice created from a Sales Order. Two implementations:
 *
 *  - `LocalSalesOrderDraftInvoiceWriter` — assembles the invoice from the
 *    already-validated `built` result and writes it through an
 *    `IInvoiceRepository`. Used by tests and any mock-repo wiring.
 *
 *  - `RpcSalesOrderDraftInvoiceWriter` — calls the atomic Postgres RPC
 *    `create_invoice_from_sales_order` (migration 0049), which LOCKS the Sales
 *    Order row, re-derives every line's remaining quantity inside the
 *    transaction, and inserts the invoice — the database is the final
 *    concurrency authority. Used by the Supabase-backed production wiring.
 *
 * Both produce an identical `Invoice` shape; the service's fail-fast
 * `buildInvoiceFromSelections` validation runs before either.
 */
export interface SalesOrderDraftInvoiceWriter {
  write(input: DraftInvoiceWriteInput): Promise<Invoice>;
}

export class LocalSalesOrderDraftInvoiceWriter implements SalesOrderDraftInvoiceWriter {
  constructor(private readonly invoiceRepository: IInvoiceRepository) {}

  async write({ order, existingInvoices, built, selections }: DraftInvoiceWriteInput): Promise<Invoice> {
    // Phase 5C: `deliveryNoteLineId` isn't part of `buildInvoiceFromSelections`'
    // pure validation output (that stays delivery-agnostic) — recovered here
    // from the original selection so the local/test writer stamps it too.
    const deliveryLinkBySoLine = new Map(
      selections.filter((s) => s.deliveryNoteLineId).map((s) => [s.salesOrderLineId, s.deliveryNoteLineId]),
    );
    const lineItems = built.parts.map((p) => ({
      ...p.source,
      id: newUuid(),
      salesOrderLineId: p.salesOrderLineId,
      quantity: p.quantity,
      lineTotal: p.lineTotal,
      taxAmount: p.taxAmount,
      ...(deliveryLinkBySoLine.has(p.salesOrderLineId)
        ? { deliveryNoteLineId: deliveryLinkBySoLine.get(p.salesOrderLineId) }
        : {}),
    }));

    const now = new Date();
    const dueDate = new Date(now.getTime() + THIRTY_DAYS_MS);
    const invoiceNumber = nextDocumentNumber(
      existingInvoices.map((i) => i.invoiceNumber),
      documentNumberPrefix(order.orderNumber.replace(/^SO-/, 'INV-'), 'INV'),
    );

    return this.invoiceRepository.create({
      id: '',
      invoiceNumber,
      customerId: order.customerId,
      salesOrderId: order.id,
      issueDate: now.toISOString(),
      dueDate: dueDate.toISOString(),
      lineItems,
      subtotal: built.subtotal,
      taxTotal: built.taxTotal,
      total: built.total,
      amountPaid: 0,
      currency: order.currency,
      status: 'draft',
      notes: `Invoiced from ${order.orderNumber}`,
      createdAt: '',
      updatedAt: '',
    });
  }
}

interface RpcResult {
  invoice_id: string;
}

export class RpcSalesOrderDraftInvoiceWriter implements SalesOrderDraftInvoiceWriter {
  constructor(
    private readonly client: SupabaseClient,
    private readonly invoiceRepository: IInvoiceRepository,
  ) {}

  async write({ order, selections, createdBy }: DraftInvoiceWriteInput): Promise<Invoice> {
    const { data, error } = await this.client.rpc('create_invoice_from_sales_order', {
      p_sales_order_id: order.id,
      p_selections: selections.map((s) => ({
        salesOrderLineId: s.salesOrderLineId,
        quantity: s.quantity,
        ...(s.deliveryNoteLineId ? { deliveryNoteLineId: s.deliveryNoteLineId } : {}),
      })),
      p_created_by: createdBy ?? null,
      p_issue_date: null,
      // Phase 9B / Block B: the RPC inserts the invoice in raw SQL and never
      // reaches `SupabaseDocumentLineProjector`, so it does its own atomic
      // `invoice_lines` projection when — and only when — the same flag that
      // gates the TS projector is on (migration 0062).
      p_project_lines: NORMALIZED_DOCUMENT_LINES_ENABLED,
    });
    if (error) {
      throw new Error(error.message.replace(/^create_invoice_from_sales_order:\s*/i, ''));
    }
    const result = data as RpcResult | null;
    if (!result?.invoice_id) {
      throw new Error('create_invoice_from_sales_order returned no invoice id.');
    }
    const invoice = await this.invoiceRepository.getById(result.invoice_id);
    if (!invoice) {
      throw new Error(`Invoice ${result.invoice_id} was created but could not be re-read.`);
    }
    return invoice;
  }
}
