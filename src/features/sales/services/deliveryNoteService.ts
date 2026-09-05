import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeliveryNote, DeliveryNoteLineItem, ID, SalesOrder } from '@/types';
import type { IDeliveryNoteRepository } from '@/repositories/IDeliveryNoteRepository';
import type { ISalesOrderRepository } from '@/repositories/ISalesOrderRepository';
import type { IInvoiceRepository } from '@/repositories/IInvoiceRepository';
import type { AccountMapper } from '@/features/accounting/services';
import type { InventoryAccountResolver } from '@/features/inventory/services/inventoryAccountResolver';
import type { DocumentProductLookup, DocumentWarehouseResolver } from '@/features/inventory/services/documentInventoryPosting';
import { newUuid } from '@/lib/uuid';
import { auditLogService, type AuditLogService } from '@/services/auditLogService';
import { nextDocumentNumber } from '@/features/purchases/utils/nextDocumentNumber';
import { computeSalesOrderFulfilment, round2, type SalesOrderInvoiceSelection } from '../utils/salesOrderFulfilment';

const SYSTEM_USER_ID: ID = 'system';
const EPSILON = 1e-6;

function roundQty(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

export interface CreateDeliveryNoteLineDTO {
  salesOrderLineId: ID;
  quantity: number;
}

export interface CreateDeliveryNoteDTO {
  salesOrderId: ID;
  warehouseId: ID;
  deliveryDate: string;
  lines: CreateDeliveryNoteLineDTO[];
  notes?: string;
}

export interface UpdateDeliveryNoteDTO {
  warehouseId?: ID;
  deliveryDate?: string;
  lines?: CreateDeliveryNoteLineDTO[];
  notes?: string;
}

/**
 * Fields immutable once `status === 'posted'`
 * (docs/DELIVERY_NOTES_DESIGN.md § "Posted Delivery Note immutability
 * contract"). Enforced in `updateDeliveryNote()` — `notes` is the ONLY
 * field this list excludes.
 */
const ACCOUNTING_RELEVANT_FIELDS: (keyof DeliveryNote)[] = [
  'deliveryNoteNumber',
  'salesOrderId',
  'customerId',
  'warehouseId',
  'deliveryDate',
  'lineItems',
  'journalEntryId',
];

function fieldChanged<K extends keyof DeliveryNote>(current: DeliveryNote, patch: Partial<DeliveryNote>, key: K): boolean {
  if (!(key in patch)) return false;
  const nextValue = patch[key];
  const currentValue = current[key];
  if (Array.isArray(nextValue) || Array.isArray(currentValue)) {
    return JSON.stringify(nextValue) !== JSON.stringify(currentValue);
  }
  return nextValue !== currentValue;
}

/** Per-line inventory account this service resolves (category/product-mapped) — the RPC never re-derives it. */
export interface DeliveryNotePosterLineAccount {
  deliveryNoteLineId: ID;
  inventoryAccountId: ID;
}

export interface DeliveryNotePostResult {
  journalEntryId?: ID;
  movementIds: ID[];
}

/**
 * Posts a draft Delivery Note via the atomic `post_delivery_note` RPC
 * (migration 0054, live). Real vs local/test implementations — same split
 * as `SalesOrderDraftInvoiceWriter` (0049).
 */
export interface DeliveryNotePoster {
  post(input: {
    deliveryNoteId: ID;
    contraAccountId: ID;
    lineAccounts: DeliveryNotePosterLineAccount[];
    postedBy?: ID;
  }): Promise<DeliveryNotePostResult>;
}

interface RpcPostResult {
  journal_entry_id?: string | null;
  movement_ids?: string[];
}

/** Production wiring: calls the live `post_delivery_note` RPC directly. */
export class RpcDeliveryNotePoster implements DeliveryNotePoster {
  constructor(private readonly client: SupabaseClient) {}

  async post({ deliveryNoteId, contraAccountId, lineAccounts, postedBy }: {
    deliveryNoteId: ID;
    contraAccountId: ID;
    lineAccounts: DeliveryNotePosterLineAccount[];
    postedBy?: ID;
  }): Promise<DeliveryNotePostResult> {
    const { data, error } = await this.client.rpc('post_delivery_note', {
      p_delivery_note_id: deliveryNoteId,
      p_contra_account_id: contraAccountId,
      p_line_accounts: lineAccounts.map((a) => ({
        deliveryNoteLineId: a.deliveryNoteLineId,
        inventoryAccountId: a.inventoryAccountId,
      })),
      p_posted_by: postedBy ?? null,
      p_posting_date: null,
    });
    if (error) {
      throw new Error(error.message.replace(/^post_delivery_note:\s*/i, ''));
    }
    const result = data as RpcPostResult | null;
    return {
      journalEntryId: result?.journal_entry_id ?? undefined,
      movementIds: result?.movement_ids ?? [],
    };
  }
}

/**
 * Test/mock wiring: no live RPC exists — returns a synthetic result so unit
 * tests can exercise `DeliveryNoteService`'s own pre-validation and status
 * transitions without a Postgres connection. Deliberately does NOT
 * replicate 0054's full accounting transaction (no stock_movements /
 * journal_entries are created) — accounting-effect assertions belong to
 * the migration-contract tests (`deliveryNotesMigrations.test.ts`) and the
 * live smoke test already run against the real RPC.
 */
export class LocalDeliveryNotePoster implements DeliveryNotePoster {
  async post(): Promise<DeliveryNotePostResult> {
    return { journalEntryId: newUuid(), movementIds: [] };
  }
}

/**
 * Business-logic layer for Delivery Notes (Phase 5C). A Delivery Note is
 * physical-dispatch evidence for a confirmed Sales Order line — see
 * docs/DELIVERY_NOTES_DESIGN.md. Draft create/update/cancel are plain
 * repository writes (zero accounting effect, Part 3 of the CP-5C-A
 * hardening record: a draft never reduces `remainingToDeliver`). Posting
 * ALWAYS goes through the atomic `post_delivery_note` RPC — this service
 * never builds a `stock_movements`/`journal_entries` row itself.
 */
export class DeliveryNoteService {
  constructor(
    private readonly repository: IDeliveryNoteRepository,
    private readonly salesOrderRepository: ISalesOrderRepository,
    private readonly invoiceRepository: IInvoiceRepository,
    private readonly accounts: AccountMapper,
    private readonly inventoryAccounts: InventoryAccountResolver,
    private readonly products: DocumentProductLookup,
    private readonly warehouses: DocumentWarehouseResolver,
    private readonly poster: DeliveryNotePoster = new LocalDeliveryNotePoster(),
    private readonly auditLog: AuditLogService = auditLogService,
  ) {}

  async listDeliveryNotes(): Promise<DeliveryNote[]> {
    return this.repository.getAll();
  }

  async getDeliveryNote(id: ID): Promise<DeliveryNote | undefined> {
    return this.repository.getById(id);
  }

  async getForSalesOrder(salesOrderId: ID): Promise<DeliveryNote[]> {
    return this.repository.getBySalesOrderId(salesOrderId);
  }

  async getForCustomer(customerId: ID): Promise<DeliveryNote[]> {
    return this.repository.getByCustomerId(customerId);
  }

  /**
   * The per-SO-line remaining-to-deliver picture a "Create delivery" form
   * needs — thin wrapper over `computeSalesOrderFulfilment` so the UI never
   * has to assemble the three data sources (order/invoices/deliveryNotes)
   * itself.
   */
  async getFulfilmentForSalesOrder(salesOrderId: ID) {
    const order = await this.requireSalesOrder(salesOrderId);
    const [invoices, deliveryNotes] = await Promise.all([
      this.invoiceRepository.getAll(),
      this.repository.getAll(),
    ]);
    return computeSalesOrderFulfilment(order, invoices, deliveryNotes);
  }

  /**
   * Creates a DRAFT Delivery Note. Validates: the Sales Order exists and is
   * `confirmed` (a delivery only ever comes from a real commitment); every
   * `salesOrderLineId` is on that order; no duplicate lines; every quantity
   * is a positive, ≤3dp number not exceeding that line's CURRENT
   * `remainingToDeliver` (re-derived from fresh invoice + delivery-note
   * evidence — a stale form is rejected the same way `buildInvoiceFromSelections`
   * rejects a stale invoice picker). `warehouseId` must resolve to a real
   * warehouse. `customerId` and every line's `productId`/pricing are
   * DERIVED from the Sales Order — never trusted from the caller, mirroring
   * `SalesOrderService.createInvoiceFromSalesOrder`'s own discipline.
   *
   * Zero accounting effect — plain insert, `status: 'draft'`.
   */
  async createDraft(dto: CreateDeliveryNoteDTO, createdBy: ID = SYSTEM_USER_ID): Promise<DeliveryNote> {
    const order = await this.requireSalesOrder(dto.salesOrderId);
    if (order.status !== 'confirmed') {
      throw new Error(
        `Cannot create a delivery note for sales order "${order.orderNumber}": only a confirmed order can be delivered against (current status: ${order.status}).`,
      );
    }
    const warehouse = await this.warehouses.getWarehouse(dto.warehouseId);
    if (!warehouse) {
      throw new Error(`Cannot create a delivery note: warehouse "${dto.warehouseId}" was not found.`);
    }
    if (!Array.isArray(dto.lines) || dto.lines.length === 0) {
      throw new Error('Select at least one line to deliver.');
    }

    const [invoices, deliveryNotes] = await Promise.all([
      this.invoiceRepository.getAll(),
      this.repository.getAll(),
    ]);
    const fulfilment = computeSalesOrderFulfilment(order, invoices, deliveryNotes);
    const fulfilmentByLine = new Map(fulfilment.lines.map((l) => [l.salesOrderLineId, l]));
    const soLineById = new Map(order.lineItems.map((l) => [l.id, l]));

    const seen = new Set<ID>();
    const lineItems: DeliveryNoteLineItem[] = [];
    for (const sel of dto.lines) {
      const soLine = soLineById.get(sel.salesOrderLineId);
      if (!soLine) {
        throw new Error(`Line "${sel.salesOrderLineId}" is not on sales order "${order.orderNumber}".`);
      }
      if (!soLine.productId) {
        throw new Error(`Line "${soLine.description}" has no product — a non-inventory line cannot be delivered.`);
      }
      if (seen.has(sel.salesOrderLineId)) {
        throw new Error(`Line "${soLine.description}" is selected more than once.`);
      }
      seen.add(sel.salesOrderLineId);

      if (typeof sel.quantity !== 'number' || !Number.isFinite(sel.quantity) || sel.quantity <= 0) {
        throw new Error(`Quantity for "${soLine.description}" must be a number greater than zero.`);
      }
      if (roundQty(sel.quantity) !== sel.quantity) {
        throw new Error(`Quantity for "${soLine.description}" has more than 3 decimal places.`);
      }

      const remaining = fulfilmentByLine.get(sel.salesOrderLineId)?.remainingToDeliver ?? 0;
      if (sel.quantity > remaining + EPSILON) {
        throw new Error(
          `Cannot deliver ${roundQty(sel.quantity)} of "${soLine.description}" — only ${roundQty(remaining)} remain to deliver.`,
        );
      }

      const orderedQty = Math.max(0, roundQty(soLine.quantity ?? 0));
      const isWholeLine = Math.abs(sel.quantity - orderedQty) <= EPSILON;
      const rate = (soLine.lineTotal ?? 0) > 0 ? (soLine.taxAmount ?? 0) / (soLine.lineTotal as number) : 0;
      const lineTotal = isWholeLine ? round2(soLine.lineTotal ?? 0) : round2(sel.quantity * (soLine.unitPrice ?? 0));
      const taxAmount = isWholeLine ? round2(soLine.taxAmount ?? 0) : round2(lineTotal * rate);

      lineItems.push({
        id: newUuid(),
        salesOrderLineId: sel.salesOrderLineId,
        productId: soLine.productId,
        description: soLine.description,
        quantity: sel.quantity,
        unitPrice: soLine.unitPrice ?? 0,
        taxRateId: soLine.taxRateId,
        taxAmount,
        lineTotal,
      });
    }

    const existing = await this.repository.getAll();
    const deliveryNoteNumber = nextDocumentNumber(
      existing.map((dn) => dn.deliveryNoteNumber),
      'DN',
    );

    const created = await this.repository.create({
      id: '',
      deliveryNoteNumber,
      salesOrderId: order.id,
      customerId: order.customerId,
      warehouseId: dto.warehouseId,
      deliveryDate: dto.deliveryDate,
      status: 'draft',
      lineItems,
      notes: dto.notes,
      createdAt: '',
      updatedAt: '',
    });

    await this.auditLog.log({
      userId: createdBy,
      action: 'delivery_note_created',
      module: 'sales',
      recordType: 'DeliveryNote',
      recordId: created.id,
      newValue: { deliveryNoteNumber: created.deliveryNoteNumber, salesOrderId: order.id, lineCount: lineItems.length },
    });

    return created;
  }

  /**
   * Edits a DRAFT Delivery Note. Refuses ANY change once posted — see
   * ACCOUNTING_RELEVANT_FIELDS above; `notes` is the only field a posted
   * document may still change (matches `InvoiceService.updateInvoice`'s
   * own draft/posted boundary exactly).
   */
  async updateDraft(id: ID, patch: UpdateDeliveryNoteDTO, updatedBy: ID = SYSTEM_USER_ID): Promise<DeliveryNote> {
    const dn = await this.requireDeliveryNote(id);
    if (dn.status !== 'draft') {
      const wouldChange = ACCOUNTING_RELEVANT_FIELDS.some((key) =>
        key === 'lineItems' ? patch.lines !== undefined : fieldChanged(dn, patch as Partial<DeliveryNote>, key),
      );
      if (wouldChange) {
        throw new Error(
          `Cannot edit delivery note "${dn.deliveryNoteNumber}": it is ${dn.status} — a posted delivery note's accounting evidence cannot be changed. Only "notes" may still be edited.`,
        );
      }
      const updated = await this.repository.update(id, { notes: patch.notes });
      return updated;
    }

    let lineItems = dn.lineItems;
    if (patch.lines) {
      const order = await this.requireSalesOrder(dn.salesOrderId);
      const soLineById = new Map(order.lineItems.map((l) => [l.id, l]));
      const [invoices, deliveryNotes] = await Promise.all([
        this.invoiceRepository.getAll(),
        this.repository.getAll(),
      ]);
      const fulfilment = computeSalesOrderFulfilment(order, invoices, deliveryNotes.filter((d) => d.id !== id));
      const fulfilmentByLine = new Map(fulfilment.lines.map((l) => [l.salesOrderLineId, l]));
      const seen = new Set<ID>();
      lineItems = patch.lines.map((sel) => {
        const soLine = soLineById.get(sel.salesOrderLineId);
        if (!soLine || !soLine.productId) {
          throw new Error(`Line "${sel.salesOrderLineId}" is not a deliverable line on sales order "${order.orderNumber}".`);
        }
        if (seen.has(sel.salesOrderLineId)) {
          throw new Error(`Line "${soLine.description}" is selected more than once.`);
        }
        seen.add(sel.salesOrderLineId);
        if (typeof sel.quantity !== 'number' || !Number.isFinite(sel.quantity) || sel.quantity <= 0) {
          throw new Error(`Quantity for "${soLine.description}" must be a number greater than zero.`);
        }
        const remaining = fulfilmentByLine.get(sel.salesOrderLineId)?.remainingToDeliver ?? 0;
        if (sel.quantity > remaining + EPSILON) {
          throw new Error(`Cannot deliver ${roundQty(sel.quantity)} of "${soLine.description}" — only ${roundQty(remaining)} remain to deliver.`);
        }
        const existingLine = dn.lineItems.find((l) => l.salesOrderLineId === sel.salesOrderLineId);
        const orderedQty = Math.max(0, roundQty(soLine.quantity ?? 0));
        const isWholeLine = Math.abs(sel.quantity - orderedQty) <= EPSILON;
        const rate = (soLine.lineTotal ?? 0) > 0 ? (soLine.taxAmount ?? 0) / (soLine.lineTotal as number) : 0;
        const lineTotal = isWholeLine ? round2(soLine.lineTotal ?? 0) : round2(sel.quantity * (soLine.unitPrice ?? 0));
        const taxAmount = isWholeLine ? round2(soLine.taxAmount ?? 0) : round2(lineTotal * rate);
        return {
          id: existingLine?.id ?? newUuid(),
          salesOrderLineId: sel.salesOrderLineId,
          productId: soLine.productId,
          description: soLine.description,
          quantity: sel.quantity,
          unitPrice: soLine.unitPrice ?? 0,
          taxRateId: soLine.taxRateId,
          taxAmount,
          lineTotal,
        };
      });
    }

    const updated = await this.repository.update(id, {
      warehouseId: patch.warehouseId ?? dn.warehouseId,
      deliveryDate: patch.deliveryDate ?? dn.deliveryDate,
      lineItems,
      notes: patch.notes ?? dn.notes,
    });
    await this.auditLog.log({
      userId: updatedBy,
      action: 'delivery_note_updated',
      module: 'sales',
      recordType: 'DeliveryNote',
      recordId: id,
      newValue: { lineCount: updated.lineItems.length },
    });
    return updated;
  }

  /** Cancels a DRAFT Delivery Note — never a posted one (Part 3/7: no unsafe cancellation of posted accounting evidence). */
  async cancelDraft(id: ID, cancelledBy: ID = SYSTEM_USER_ID): Promise<DeliveryNote> {
    const dn = await this.requireDeliveryNote(id);
    if (dn.status !== 'draft') {
      throw new Error(
        `Cannot cancel delivery note "${dn.deliveryNoteNumber}": only a draft can be cancelled (current status: ${dn.status}). ` +
          `A posted delivery note's physical evidence cannot be reversed in this release.`,
      );
    }
    const updated = await this.repository.update(id, { status: 'cancelled' });
    await this.auditLog.log({
      userId: cancelledBy,
      action: 'delivery_note_cancelled',
      module: 'sales',
      recordType: 'DeliveryNote',
      recordId: id,
      newValue: { deliveryNoteNumber: dn.deliveryNoteNumber },
    });
    return updated;
  }

  /** Permanently removes a draft (mirrors `deleteInvoice`'s draft-only rule). */
  async deleteDraft(id: ID): Promise<void> {
    const dn = await this.requireDeliveryNote(id);
    if (dn.status !== 'draft') {
      throw new Error(`Cannot delete delivery note "${dn.deliveryNoteNumber}": only a draft can be deleted (current status: ${dn.status}). Cancel it instead.`);
    }
    return this.repository.delete(id);
  }

  /**
   * Posts a draft Delivery Note. Friendly pre-validation here (SO status,
   * DN status, fresh remaining-to-deliver) gives a fast, readable error —
   * it does NOT replace the database transaction guard: `post_delivery_note`
   * (0054, live) independently re-locks and re-derives everything inside
   * its own atomic transaction, which remains the final authority. This
   * service never builds a `stock_movements`/`journal_entries` row itself.
   */
  async postDeliveryNote(id: ID, postedBy: ID = SYSTEM_USER_ID): Promise<DeliveryNote> {
    const dn = await this.requireDeliveryNote(id);
    if (dn.status !== 'draft') {
      throw new Error(`Cannot post delivery note "${dn.deliveryNoteNumber}": only a draft can be posted (current status: ${dn.status}).`);
    }
    if (dn.lineItems.length === 0) {
      throw new Error(`Cannot post delivery note "${dn.deliveryNoteNumber}": it has no lines.`);
    }

    const order = await this.requireSalesOrder(dn.salesOrderId);
    if (order.status === 'cancelled') {
      throw new Error(`Cannot post delivery note "${dn.deliveryNoteNumber}": sales order "${order.orderNumber}" has been cancelled.`);
    }
    if (order.status === 'closed') {
      throw new Error(`Cannot post delivery note "${dn.deliveryNoteNumber}": sales order "${order.orderNumber}" is closed — its remainder was abandoned.`);
    }

    const [invoices, deliveryNotes] = await Promise.all([
      this.invoiceRepository.getAll(),
      this.repository.getAll(),
    ]);
    const fulfilment = computeSalesOrderFulfilment(order, invoices, deliveryNotes.filter((d) => d.id !== dn.id));
    const fulfilmentByLine = new Map(fulfilment.lines.map((l) => [l.salesOrderLineId, l]));

    const contraAccountId = await this.accounts.getAccountId('GOODS_DELIVERED_NOT_INVOICED');
    const lineAccounts: DeliveryNotePosterLineAccount[] = [];
    for (const line of dn.lineItems) {
      const remaining = fulfilmentByLine.get(line.salesOrderLineId)?.remainingToDeliver ?? 0;
      if (line.quantity > remaining + EPSILON) {
        throw new Error(
          `Cannot post delivery note "${dn.deliveryNoteNumber}": line "${line.description}" requests ${roundQty(line.quantity)} — only ${roundQty(remaining)} remain to deliver (concurrent activity on this order may have changed the available quantity).`,
        );
      }
      const product = await this.products.getProduct(line.productId);
      if (!product) {
        throw new Error(`Cannot post delivery note "${dn.deliveryNoteNumber}": product "${line.productId}" was not found.`);
      }
      const inventoryAccountId = await this.inventoryAccounts.resolveForProduct(product, 'inventory');
      lineAccounts.push({ deliveryNoteLineId: line.id, inventoryAccountId });
    }

    const result = await this.poster.post({ deliveryNoteId: dn.id, contraAccountId, lineAccounts, postedBy });
    const posted = await this.repository.update(id, { status: 'posted', journalEntryId: result.journalEntryId });

    await this.auditLog.log({
      userId: postedBy,
      action: 'delivery_note_posted',
      module: 'sales',
      recordType: 'DeliveryNote',
      recordId: id,
      newValue: {
        deliveryNoteNumber: dn.deliveryNoteNumber,
        salesOrderId: order.id,
        salesOrderNumber: order.orderNumber,
        lineCount: dn.lineItems.length,
        journalEntryId: result.journalEntryId,
      },
    });

    return posted;
  }

  /**
   * Builds the `SalesOrderInvoiceSelection[]` for "invoice this delivery"
   * (Part 14) — one selection PER DELIVERY NOTE LINE (never merged across
   * lines, the adopted N:M policy, docs/DELIVERY_NOTES_DESIGN.md Part 9),
   * defaulting each to that line's own remaining-to-invoice quantity
   * (its own quantity minus whatever has already been invoiced against
   * it). Lines already fully invoiced are omitted. Delegates the actual
   * draft-invoice write to `SalesOrderService.createInvoiceFromSalesOrder`
   * (still the atomic `create_invoice_from_sales_order` RPC, migration
   * 0055) — this method never creates the invoice itself.
   */
  async buildInvoiceSelectionsForDeliveryNote(
    deliveryNoteId: ID,
    requestedQuantities?: ReadonlyMap<ID, number>,
  ): Promise<SalesOrderInvoiceSelection[]> {
    const dn = await this.requireDeliveryNote(deliveryNoteId);
    if (dn.status !== 'posted') {
      throw new Error(`Cannot invoice delivery note "${dn.deliveryNoteNumber}": only a posted delivery note has real physical evidence to invoice (current status: ${dn.status}).`);
    }
    const invoices = await this.invoiceRepository.getAll();
    const linked = invoices.filter((inv) => inv.salesOrderId === dn.salesOrderId && inv.status !== 'void');

    const selections: SalesOrderInvoiceSelection[] = [];
    for (const line of dn.lineItems) {
      const takenForThisLine = linked.reduce((sum, inv) => {
        return sum + inv.lineItems.filter((l) => l.deliveryNoteLineId === line.id).reduce((s, l) => s + (l.quantity ?? 0), 0);
      }, 0);
      const remaining = roundQty(line.quantity - takenForThisLine);
      if (remaining <= EPSILON) continue;
      const requested = requestedQuantities?.get(line.id) ?? remaining;
      if (requested <= EPSILON) continue;
      if (requested > remaining + EPSILON) {
        throw new Error(`Cannot invoice ${roundQty(requested)} against delivery note line "${line.description}" — only ${remaining} remain to invoice on that delivery.`);
      }
      selections.push({ salesOrderLineId: line.salesOrderLineId, quantity: requested, deliveryNoteLineId: line.id });
    }
    if (selections.length === 0) {
      throw new Error(`Delivery note "${dn.deliveryNoteNumber}" has nothing left to invoice.`);
    }
    return selections;
  }

  private async requireDeliveryNote(id: ID): Promise<DeliveryNote> {
    const dn = await this.repository.getById(id);
    if (!dn) throw new Error(`Delivery note "${id}" not found`);
    return dn;
  }

  private async requireSalesOrder(id: ID): Promise<SalesOrder> {
    const order = await this.salesOrderRepository.getById(id);
    if (!order) throw new Error(`Sales order "${id}" not found`);
    return order;
  }
}
