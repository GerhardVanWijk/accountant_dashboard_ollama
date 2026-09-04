import type { ID, Invoice, SalesOrder } from '@/types';
import type { ISalesOrderRepository } from '@/repositories/ISalesOrderRepository';
import type { IInvoiceRepository } from '@/repositories/IInvoiceRepository';
import { newUuid } from '@/lib/uuid';
import { auditLogService, type AuditLogService } from '@/services/auditLogService';
import {
  documentNumberPrefix,
  nextDocumentNumber,
} from '@/features/purchases/utils/nextDocumentNumber';
import {
  buildInvoiceFromSelections,
  canCloseRemaining,
  computeSalesOrderFulfilment,
  fullRemainingSelections,
  type SalesOrderInvoiceSelection,
} from '../utils/salesOrderFulfilment';
import {
  LocalSalesOrderDraftInvoiceWriter,
  type SalesOrderDraftInvoiceWriter,
} from './salesOrderDraftInvoiceWriter';

/** No real authenticated actor for a system-initiated copy — same pattern as stockAdjustmentService. */
const SYSTEM_USER_ID: ID = 'system';

export type CreateSalesOrderDTO = Omit<SalesOrder, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Business-logic layer for Sales Orders. Sales Orders are pre-accounting
 * commitment documents (same treatment as Purchase Orders on the other
 * side) — NO journal entry is ever posted for a Sales Order, see
 * docs/LEDGER_ARCHITECTURE.md.
 */
export class SalesOrderService {
  private readonly invoiceWriter: SalesOrderDraftInvoiceWriter;

  constructor(
    private readonly repository: ISalesOrderRepository,
    private readonly invoiceRepository: IInvoiceRepository,
    /** Phase 4B-2: records a "created" audit row for a duplicated sales order. Defaults to the shared singleton. */
    private readonly auditLog: AuditLogService = auditLogService,
    /**
     * Phase 5B FINAL: persists a draft invoice created from a Sales Order.
     * Defaults to the in-process `LocalSalesOrderDraftInvoiceWriter` (writes
     * through `invoiceRepository`); the Supabase-backed production wiring
     * injects `RpcSalesOrderDraftInvoiceWriter`, which routes through the
     * atomic `create_invoice_from_sales_order` RPC (the DB is then the final
     * concurrency authority — migration 0049).
     */
    invoiceWriter?: SalesOrderDraftInvoiceWriter,
  ) {
    this.invoiceWriter = invoiceWriter ?? new LocalSalesOrderDraftInvoiceWriter(invoiceRepository);
  }

  async getSalesOrders(): Promise<SalesOrder[]> {
    return this.repository.getAll();
  }

  async getSalesOrder(id: string): Promise<SalesOrder | undefined> {
    return this.repository.getById(id);
  }

  async createSalesOrder(data: CreateSalesOrderDTO): Promise<SalesOrder> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateSalesOrder(id: string, patch: Partial<SalesOrder>): Promise<SalesOrder> {
    return this.repository.update(id, patch);
  }

  /** Permanently removes a pending sales order (there is no earlier 'draft' state — see class doc). Once confirmed/fulfilled it's a real business commitment and must be cancelled instead of deleted. */
  async deleteSalesOrder(id: string): Promise<void> {
    const order = await this.requireOrder(id);
    if (order.status !== 'pending') {
      throw new Error(
        `Cannot delete sales order "${id}": only a pending order can be deleted (current status: ${order.status}). Cancel it instead.`,
      );
    }
    return this.repository.delete(id);
  }

  /** Confirms a pending sales order with the customer. Transitions 'pending' -> 'confirmed'. */
  async confirmOrder(id: string): Promise<SalesOrder> {
    const order = await this.requireOrder(id);
    if (order.status !== 'pending') {
      throw new Error(
        `Cannot confirm sales order "${id}": only a pending order can be confirmed (current status: ${order.status}).`,
      );
    }
    return this.repository.update(id, { status: 'confirmed' });
  }

  /**
   * Cancels a sales order that has NOT been invoiced. Once any invoice
   * (draft or posted) is linked, the order is a real commercial commitment —
   * the remainder must be `closeRemaining()`d instead so the invoiced portion
   * and its accounting stay intact.
   */
  async cancelOrder(id: string): Promise<SalesOrder> {
    const order = await this.requireOrder(id);
    if (order.status === 'fulfilled' || order.status === 'closed' || order.status === 'cancelled') {
      throw new Error(`Cannot cancel sales order "${id}": its status is "${order.status}".`);
    }
    const invoices = await this.invoiceRepository.getAll();
    const linked = invoices.filter((inv) => inv.salesOrderId === order.id && inv.status !== 'void');
    if (linked.length > 0) {
      throw new Error(
        `Cannot cancel sales order "${id}": it has already been invoiced (${linked.map((i) => i.invoiceNumber).join(', ')}). ` +
          `Close the remaining quantity instead.`,
      );
    }
    return this.repository.update(id, { status: 'cancelled' });
  }

  /**
   * Phase 5B FINAL — ends the commercial commitment of a partly-invoiced
   * Sales Order: the business has decided NOT to supply the remaining ordered
   * quantity. Sets `status = 'closed'`.
   *
   * This is DISTINCT from `fulfilled` (every ordered quantity actually
   * supplied) — a `closed` order was short-shipped on purpose. It has **zero**
   * accounting or inventory effect: no journal, no stock movement, no COGS,
   * no revenue, no VAT, no AR, no invoice. It simply stops
   * `StockCommitmentService` (which only reserves for `confirmed` orders) from
   * committing the un-invoiced remainder. The already-invoiced lines and their
   * postings are untouched.
   *
   * Allowed only for a `confirmed` order that has some invoicing progress and
   * some remaining un-invoiced quantity (`canCloseRemaining`). A pending order
   * or a confirmed order with nothing invoiced is `cancelOrder()`d instead.
   */
  async closeRemaining(id: string, closedBy: ID = SYSTEM_USER_ID): Promise<SalesOrder> {
    const order = await this.requireOrder(id);
    const invoices = await this.invoiceRepository.getAll();
    const fulfilment = computeSalesOrderFulfilment(order, invoices);
    if (!canCloseRemaining(order, fulfilment)) {
      throw new Error(
        `Cannot close the remaining quantity of sales order "${id}" (status: ${order.status}, ` +
          `invoiced: ${fulfilment.postedFulfilledQty}, remaining: ${fulfilment.remainingToFulfilQty}). ` +
          `Only a confirmed, partly-invoiced order with an un-invoiced remainder can be closed — otherwise cancel it.`,
      );
    }
    const updated = await this.repository.update(id, { status: 'closed' });
    await this.auditLog.log({
      userId: closedBy,
      action: 'sales_order_closed',
      module: 'sales',
      recordType: 'SalesOrder',
      recordId: id,
      reason: `Closed remaining quantity — abandoned ${fulfilment.remainingToFulfilQty} un-invoiced unit(s)`,
      newValue: {
        status: 'closed',
        orderedQty: fulfilment.orderedQty,
        invoicedQty: fulfilment.postedFulfilledQty,
        abandonedQty: fulfilment.remainingToFulfilQty,
      },
    });
    return updated;
  }

  /**
   * Converts a Sales Order into a new draft Invoice for **every quantity still
   * remaining to invoice** — the one-click "invoice the rest" path (Phase 5B.1).
   * Delegates to `createInvoiceFromSalesOrder` with the full remaining
   * selection; throws once every line is already fully covered by existing
   * (draft + posted, non-void) linked invoices.
   */
  async convertToInvoice(orderId: string): Promise<Invoice> {
    const order = await this.requireOrder(orderId);
    const existing = await this.invoiceRepository.getAll();
    const selections = fullRemainingSelections(order, existing);
    if (selections.length === 0) {
      const linked = existing.filter((inv) => inv.salesOrderId === order.id && inv.status !== 'void');
      const legacy = linked.find(
        (inv) => inv.lineItems.length > 0 && inv.lineItems.every((l) => !l.salesOrderLineId),
      );
      if (legacy) {
        throw new Error(
          `Cannot invoice sales order "${orderId}": it was already converted to invoice ${legacy.invoiceNumber}.`,
        );
      }
      if (order.status === 'cancelled' || order.status === 'closed') {
        throw new Error(`Cannot invoice sales order "${orderId}": its status is "${order.status}".`);
      }
      if (order.status === 'fulfilled' && linked.length === 0) {
        throw new Error(`Cannot invoice sales order "${orderId}": it has already been fulfilled.`);
      }
      const nums = linked.map((i) => i.invoiceNumber).join(', ');
      throw new Error(
        `Cannot invoice sales order "${orderId}": every line is already fully invoiced${nums ? ` (${nums})` : ''}.`,
      );
    }
    return this.createInvoiceFromSalesOrder(orderId, selections);
  }

  /**
   * Phase 5B.2 — create a DRAFT invoice for an explicit per-line quantity
   * selection. The request identifies only `{ salesOrderLineId, quantity }`;
   * every other field (productId / warehouseId / taxRateId / unitPrice /
   * description / totals) is DERIVED from the authoritative Sales Order line —
   * the caller's product / price / description are never trusted.
   *
   * `buildInvoiceFromSelections` runs here for fail-fast validation (SO exists,
   * not cancelled / closed / legacy-fulfilled; each `salesOrderLineId` on the
   * order; no duplicates; quantity finite, > 0, ≤ 3dp, ≤ current
   * `remainingToInvoiceQty`). The actual write is delegated to
   * `this.invoiceWriter`: the Supabase wiring routes it through the atomic
   * `create_invoice_from_sales_order` RPC (migration 0049), which LOCKS the
   * Sales Order and re-validates inside the transaction — the database is the
   * final concurrency authority. The local writer (tests / mock repos) writes
   * the already-validated `built` result through the invoice repository.
   *
   * Every created invoice line gets a FRESH `id` (never the SO line id) and
   * carries `salesOrderLineId`. No GL / stock / VAT posting — the invoice stays
   * `draft`. The commercial status is NOT touched here (a draft never flips it —
   * the `confirmed → fulfilled` flip happens at post time via
   * `InvoiceService.onInvoicePosted`).
   */
  async createInvoiceFromSalesOrder(
    orderId: string,
    selections: readonly SalesOrderInvoiceSelection[],
    createdBy: ID = SYSTEM_USER_ID,
  ): Promise<Invoice> {
    const order = await this.requireOrder(orderId);
    const existing = await this.invoiceRepository.getAll();
    const built = buildInvoiceFromSelections(order, existing, selections);
    return this.invoiceWriter.write({ order, existingInvoices: existing, built, selections, createdBy });
  }

  /**
   * Copies a sales order into a brand-new PENDING sales order — new
   * number, today's order date, fresh line-item ids, party + notes
   * carried over. `quoteId` is dropped (the copy is not from that quote).
   * NO GL posting (sales orders never post). Throws if the source does
   * not exist. Writes a `created` audit row naming the source order number.
   */
  async duplicateSalesOrder(id: string, duplicatedBy: ID = SYSTEM_USER_ID): Promise<SalesOrder> {
    const source = await this.requireOrder(id);
    const existing = await this.repository.getAll();
    const copy = await this.repository.create({
      id: '',
      orderNumber: nextDocumentNumber(
        existing.map((o) => o.orderNumber),
        documentNumberPrefix(source.orderNumber, 'SO'),
      ),
      customerId: source.customerId,
      orderDate: new Date().toISOString(),
      lineItems: source.lineItems.map((line) => ({ ...line, id: newUuid() })),
      subtotal: source.subtotal,
      taxTotal: source.taxTotal,
      total: source.total,
      currency: source.currency,
      status: 'pending',
      notes: source.notes,
      createdAt: '',
      updatedAt: '',
    });
    await this.auditLog.log({
      userId: duplicatedBy,
      action: 'created',
      module: 'sales',
      recordType: 'SalesOrder',
      recordId: copy.id,
      reason: `Duplicated from ${source.orderNumber}`,
      newValue: { copiedFromNumber: source.orderNumber },
    });
    return copy;
  }

  /** Get sales orders for a specific customer. */
  async getSalesOrdersByCustomer(customerId: string): Promise<SalesOrder[]> {
    const all = await this.repository.getAll();
    return all.filter((so) => so.customerId === customerId);
  }

  /** Get sales orders filtered by status. */
  async getSalesOrdersByStatus(status: SalesOrder['status']): Promise<SalesOrder[]> {
    const all = await this.repository.getAll();
    return all.filter((so) => so.status === status);
  }

  /** Search sales orders by order number or customer ID. */
  async searchSalesOrders(query: string): Promise<SalesOrder[]> {
    const all = await this.repository.getAll();
    const lowerQuery = query.toLowerCase();
    return all.filter(
      (so) =>
        so.orderNumber.toLowerCase().includes(lowerQuery) || so.customerId.toLowerCase().includes(lowerQuery),
    );
  }

  private async requireOrder(id: string): Promise<SalesOrder> {
    const order = await this.repository.getById(id);
    if (!order) {
      throw new Error(`Sales order "${id}" not found`);
    }
    return order;
  }
}
