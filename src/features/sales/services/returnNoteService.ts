import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeliveryNote, ID, Invoice, ReturnNote, ReturnNoteLineItem } from '@/types';
import type { IReturnNoteRepository } from '@/repositories/IReturnNoteRepository';
import type { IDeliveryNoteRepository } from '@/repositories/IDeliveryNoteRepository';
import type { IInvoiceRepository } from '@/repositories/IInvoiceRepository';
import type { AccountMapper } from '@/features/accounting/services';
import type { InventoryAccountResolver } from '@/features/inventory/services/inventoryAccountResolver';
import type { DocumentProductLookup } from '@/features/inventory/services/documentInventoryPosting';
import { newUuid } from '@/lib/uuid';
import { auditLogService, type AuditLogService } from '@/services/auditLogService';
import { nextDocumentNumber } from '@/features/purchases/utils/nextDocumentNumber';
import { round2 } from '../utils/salesOrderFulfilment';

const SYSTEM_USER_ID: ID = 'system';
const EPSILON = 1e-6;

function roundQty(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/**
 * One Delivery Note line's returnable picture — the read-model
 * `computeReturnableForDeliveryNote` derives from fresh delivery-note /
 * invoice / return-note evidence (docs/RETURN_NOTES_DESIGN.md formula):
 *
 *   returnableUninvoicedQty = max(0, deliveredQty - invoicedQty - alreadyReturnedQty)
 */
export interface ReturnableDeliveryNoteLine {
  deliveryNoteLineId: ID;
  salesOrderLineId: ID;
  productId: ID;
  description: string;
  deliveredQty: number;
  invoicedQty: number;
  alreadyReturnedQty: number;
  returnableQty: number;
}

export interface CreateReturnNoteLineDTO {
  deliveryNoteLineId: ID;
  quantity: number;
}

export interface CreateReturnNoteDTO {
  deliveryNoteId: ID;
  returnDate: string;
  lines: CreateReturnNoteLineDTO[];
  notes?: string;
}

export interface UpdateReturnNoteDTO {
  returnDate?: string;
  lines?: CreateReturnNoteLineDTO[];
  notes?: string;
}

/**
 * Pure read-model, exported standalone (mirrors `computeSalesOrderFulfilment`)
 * so a "Create return" form can derive returnable quantities synchronously
 * from already-fetched delivery-note/invoice/return-note data, without a
 * second async round trip through the service.
 */
export function computeReturnableDeliveryNoteLines(
  dn: DeliveryNote,
  invoices: Invoice[],
  returnNotes: ReturnNote[],
): ReturnableDeliveryNoteLine[] {
  return dn.lineItems.map((line) => {
    const invoicedQty = invoices
      .filter((inv) => inv.status !== 'void')
      .reduce((sum, inv) => sum + inv.lineItems.filter((l) => l.deliveryNoteLineId === line.id).reduce((s, l) => s + (l.quantity ?? 0), 0), 0);
    const alreadyReturnedQty = returnNotes
      .filter((rn) => rn.status === 'posted')
      .reduce((sum, rn) => sum + rn.lineItems.filter((l) => l.deliveryNoteLineId === line.id).reduce((s, l) => s + (l.quantity ?? 0), 0), 0);
    const returnableQty = Math.max(0, roundQty(line.quantity - invoicedQty - alreadyReturnedQty));
    return {
      deliveryNoteLineId: line.id,
      salesOrderLineId: line.salesOrderLineId,
      productId: line.productId,
      description: line.description,
      deliveredQty: line.quantity,
      invoicedQty,
      alreadyReturnedQty,
      returnableQty,
    };
  });
}

/** Fields immutable once `status === 'posted'` — `notes` is the only field a posted document may still change. */
const ACCOUNTING_RELEVANT_FIELDS: (keyof ReturnNote)[] = [
  'returnNoteNumber',
  'deliveryNoteId',
  'salesOrderId',
  'customerId',
  'warehouseId',
  'returnDate',
  'lineItems',
  'journalEntryId',
];

function fieldChanged<K extends keyof ReturnNote>(current: ReturnNote, patch: Partial<ReturnNote>, key: K): boolean {
  if (!(key in patch)) return false;
  const nextValue = patch[key];
  const currentValue = current[key];
  if (Array.isArray(nextValue) || Array.isArray(currentValue)) {
    return JSON.stringify(nextValue) !== JSON.stringify(currentValue);
  }
  return nextValue !== currentValue;
}

/** Per-line inventory account this service resolves (category/product-mapped) — the RPC never re-derives it. */
export interface ReturnNotePosterLineAccount {
  returnNoteLineId: ID;
  inventoryAccountId: ID;
}

export interface ReturnNotePostResult {
  journalEntryId?: ID;
  movementIds: ID[];
}

/** Posts a draft Return Note via the atomic `post_return_note` RPC (migration 0058, live). */
export interface ReturnNotePoster {
  post(input: {
    returnNoteId: ID;
    contraAccountId: ID;
    lineAccounts: ReturnNotePosterLineAccount[];
    postedBy?: ID;
  }): Promise<ReturnNotePostResult>;
}

interface RpcPostResult {
  journal_entry_id?: string | null;
  movement_ids?: string[];
}

/** Production wiring: calls the live `post_return_note` RPC directly. */
export class RpcReturnNotePoster implements ReturnNotePoster {
  constructor(private readonly client: SupabaseClient) {}

  async post({ returnNoteId, contraAccountId, lineAccounts, postedBy }: {
    returnNoteId: ID;
    contraAccountId: ID;
    lineAccounts: ReturnNotePosterLineAccount[];
    postedBy?: ID;
  }): Promise<ReturnNotePostResult> {
    const { data, error } = await this.client.rpc('post_return_note', {
      p_return_note_id: returnNoteId,
      p_contra_account_id: contraAccountId,
      p_line_accounts: lineAccounts.map((a) => ({
        returnNoteLineId: a.returnNoteLineId,
        inventoryAccountId: a.inventoryAccountId,
      })),
      p_posted_by: postedBy ?? null,
      p_posting_date: null,
    });
    if (error) {
      throw new Error(error.message.replace(/^post_return_note:\s*/i, ''));
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
 * tests can exercise `ReturnNoteService`'s own pre-validation and status
 * transitions without a Postgres connection (same reasoning as
 * `LocalDeliveryNotePoster`).
 */
export class LocalReturnNotePoster implements ReturnNotePoster {
  async post(): Promise<ReturnNotePostResult> {
    return { journalEntryId: newUuid(), movementIds: [] };
  }
}

/**
 * Business-logic layer for Return Notes (Phase 5D) — the delivered-but-not-
 * yet-invoiced return path. Credit Notes remain the correct mechanism for
 * returning already-invoiced goods; a Return Note only ever exists against a
 * POSTED Delivery Note. Draft create/update/cancel are plain repository
 * writes (zero accounting effect); posting ALWAYS goes through the atomic
 * `post_return_note` RPC — this service never builds a
 * `stock_movements`/`journal_entries` row itself.
 */
export class ReturnNoteService {
  constructor(
    private readonly repository: IReturnNoteRepository,
    private readonly deliveryNoteRepository: IDeliveryNoteRepository,
    private readonly invoiceRepository: IInvoiceRepository,
    private readonly accounts: AccountMapper,
    private readonly inventoryAccounts: InventoryAccountResolver,
    private readonly products: DocumentProductLookup,
    private readonly poster: ReturnNotePoster = new LocalReturnNotePoster(),
    private readonly auditLog: AuditLogService = auditLogService,
  ) {}

  async listReturnNotes(): Promise<ReturnNote[]> {
    return this.repository.getAll();
  }

  async getReturnNote(id: ID): Promise<ReturnNote | undefined> {
    return this.repository.getById(id);
  }

  async getForDeliveryNote(deliveryNoteId: ID): Promise<ReturnNote[]> {
    return this.repository.getByDeliveryNoteId(deliveryNoteId);
  }

  async getForSalesOrder(salesOrderId: ID): Promise<ReturnNote[]> {
    return this.repository.getBySalesOrderId(salesOrderId);
  }

  async getForCustomer(customerId: ID): Promise<ReturnNote[]> {
    return this.repository.getByCustomerId(customerId);
  }

  /**
   * The per-Delivery-Note-line returnable picture a "Create return" form
   * needs (docs/RETURN_NOTES_DESIGN.md formula):
   *   returnableUninvoicedQty = max(0, deliveredQty - invoicedQty - alreadyReturnedQty)
   * `invoicedQty` sums every non-void invoice line carrying this EXACT
   * `deliveryNoteLineId` (0055's own linking field — an invoiced quantity
   * can never be returned here, it goes through a Credit Note instead).
   * `alreadyReturnedQty` sums every OTHER POSTED return note's line against
   * this exact delivery note line — a draft return note (including this
   * one, mid-edit) never reserves returnable quantity, mirroring how a
   * draft Delivery Note never reduces `remainingToDeliver` (Part 3/8 of the
   * Delivery Note design).
   */
  async computeReturnableForDeliveryNote(deliveryNoteId: ID): Promise<ReturnableDeliveryNoteLine[]> {
    const dn = await this.requireDeliveryNote(deliveryNoteId);
    const [invoices, returnNotes] = await Promise.all([
      this.invoiceRepository.getAll(),
      this.repository.getByDeliveryNoteId(deliveryNoteId),
    ]);
    return this.computeReturnableLines(dn, invoices, returnNotes);
  }

  private computeReturnableLines(
    dn: DeliveryNote,
    invoices: Invoice[],
    returnNotes: ReturnNote[],
  ): ReturnableDeliveryNoteLine[] {
    return computeReturnableDeliveryNoteLines(dn, invoices, returnNotes);
  }

  /**
   * Creates a DRAFT Return Note. Validates: the Delivery Note exists and is
   * `posted` (only physically-departed stock can be returned); every
   * `deliveryNoteLineId` is on that delivery; no duplicate lines; every
   * quantity is a positive, ≤3dp number not exceeding that line's CURRENT
   * `returnableQty` (re-derived from fresh invoice + return-note evidence).
   * `salesOrderId`/`customerId`/`warehouseId` are DERIVED from the Delivery
   * Note — never trusted from the caller.
   *
   * Zero accounting effect — plain insert, `status: 'draft'`.
   */
  async createDraft(dto: CreateReturnNoteDTO, createdBy: ID = SYSTEM_USER_ID): Promise<ReturnNote> {
    const dn = await this.requireDeliveryNote(dto.deliveryNoteId);
    if (dn.status !== 'posted') {
      throw new Error(
        `Cannot create a return note for delivery note "${dn.deliveryNoteNumber}": only a posted delivery has physical stock to return (current status: ${dn.status}).`,
      );
    }
    if (!Array.isArray(dto.lines) || dto.lines.length === 0) {
      throw new Error('Select at least one line to return.');
    }

    const returnable = await this.computeReturnableForDeliveryNote(dn.id);
    const returnableByLine = new Map(returnable.map((l) => [l.deliveryNoteLineId, l]));
    const dnLineById = new Map(dn.lineItems.map((l) => [l.id, l]));

    const seen = new Set<ID>();
    const lineItems: ReturnNoteLineItem[] = [];
    for (const sel of dto.lines) {
      const dnLine = dnLineById.get(sel.deliveryNoteLineId);
      if (!dnLine) {
        throw new Error(`Line "${sel.deliveryNoteLineId}" is not on delivery note "${dn.deliveryNoteNumber}".`);
      }
      if (seen.has(sel.deliveryNoteLineId)) {
        throw new Error(`Line "${dnLine.description}" is selected more than once.`);
      }
      seen.add(sel.deliveryNoteLineId);

      if (typeof sel.quantity !== 'number' || !Number.isFinite(sel.quantity) || sel.quantity <= 0) {
        throw new Error(`Quantity for "${dnLine.description}" must be a number greater than zero.`);
      }
      if (roundQty(sel.quantity) !== sel.quantity) {
        throw new Error(`Quantity for "${dnLine.description}" has more than 3 decimal places.`);
      }

      const returnableQty = returnableByLine.get(sel.deliveryNoteLineId)?.returnableQty ?? 0;
      if (sel.quantity > returnableQty + EPSILON) {
        throw new Error(
          `Cannot return ${roundQty(sel.quantity)} of "${dnLine.description}" — only ${roundQty(returnableQty)} remain returnable (already invoiced or returned quantity cannot be returned here).`,
        );
      }

      const product = await this.products.getProduct(dnLine.productId);
      const isWholeLine = Math.abs(sel.quantity - dnLine.quantity) <= EPSILON;
      const rate = (dnLine.lineTotal ?? 0) > 0 ? (dnLine.taxAmount ?? 0) / (dnLine.lineTotal as number) : 0;
      const lineTotal = isWholeLine ? round2(dnLine.lineTotal ?? 0) : round2(sel.quantity * (dnLine.unitPrice ?? 0));
      const taxAmount = isWholeLine ? round2(dnLine.taxAmount ?? 0) : round2(lineTotal * rate);

      lineItems.push({
        id: newUuid(),
        deliveryNoteLineId: dnLine.id,
        salesOrderLineId: dnLine.salesOrderLineId,
        productId: dnLine.productId,
        description: dnLine.description,
        quantity: sel.quantity,
        // Informational only — the product's CURRENT cost at draft-creation
        // time, for display. `post_return_note` always re-derives and posts
        // the ORIGINAL frozen delivery cost from `stock_movements`, never
        // this value (docs/RETURN_NOTES_DESIGN.md).
        unitCost: product?.costPrice ?? 0,
        unitPrice: dnLine.unitPrice,
        taxRateId: dnLine.taxRateId,
        taxAmount,
        lineTotal,
      });
    }

    const existing = await this.repository.getAll();
    const returnNoteNumber = nextDocumentNumber(
      existing.map((rn) => rn.returnNoteNumber),
      'RN',
    );

    const created = await this.repository.create({
      id: '',
      returnNoteNumber,
      deliveryNoteId: dn.id,
      salesOrderId: dn.salesOrderId,
      customerId: dn.customerId,
      warehouseId: dn.warehouseId,
      returnDate: dto.returnDate,
      status: 'draft',
      lineItems,
      notes: dto.notes,
      createdAt: '',
      updatedAt: '',
    });

    await this.auditLog.log({
      userId: createdBy,
      action: 'return_note_created',
      module: 'sales',
      recordType: 'ReturnNote',
      recordId: created.id,
      newValue: { returnNoteNumber: created.returnNoteNumber, deliveryNoteId: dn.id, lineCount: lineItems.length },
    });

    return created;
  }

  /** Edits a DRAFT Return Note. Refuses ANY change once posted (mirrors `DeliveryNoteService.updateDraft`). */
  async updateDraft(id: ID, patch: UpdateReturnNoteDTO, updatedBy: ID = SYSTEM_USER_ID): Promise<ReturnNote> {
    const rn = await this.requireReturnNote(id);
    if (rn.status !== 'draft') {
      const wouldChange = ACCOUNTING_RELEVANT_FIELDS.some((key) =>
        key === 'lineItems' ? patch.lines !== undefined : fieldChanged(rn, patch as Partial<ReturnNote>, key),
      );
      if (wouldChange) {
        throw new Error(
          `Cannot edit return note "${rn.returnNoteNumber}": it is ${rn.status} — a posted return note's accounting evidence cannot be changed. Only "notes" may still be edited.`,
        );
      }
      return this.repository.update(id, { notes: patch.notes });
    }

    let lineItems = rn.lineItems;
    if (patch.lines) {
      const dn = await this.requireDeliveryNote(rn.deliveryNoteId);
      const dnLineById = new Map(dn.lineItems.map((l) => [l.id, l]));
      const [invoices, returnNotes] = await Promise.all([
        this.invoiceRepository.getAll(),
        this.repository.getByDeliveryNoteId(rn.deliveryNoteId),
      ]);
      const returnable = this.computeReturnableLines(dn, invoices, returnNotes.filter((r) => r.id !== id));
      const returnableByLine = new Map(returnable.map((l) => [l.deliveryNoteLineId, l]));
      const seen = new Set<ID>();
      lineItems = [];
      for (const sel of patch.lines) {
        const dnLine = dnLineById.get(sel.deliveryNoteLineId);
        if (!dnLine) {
          throw new Error(`Line "${sel.deliveryNoteLineId}" is not a returnable line on delivery note "${dn.deliveryNoteNumber}".`);
        }
        if (seen.has(sel.deliveryNoteLineId)) {
          throw new Error(`Line "${dnLine.description}" is selected more than once.`);
        }
        seen.add(sel.deliveryNoteLineId);
        if (typeof sel.quantity !== 'number' || !Number.isFinite(sel.quantity) || sel.quantity <= 0) {
          throw new Error(`Quantity for "${dnLine.description}" must be a number greater than zero.`);
        }
        const returnableQty = returnableByLine.get(sel.deliveryNoteLineId)?.returnableQty ?? 0;
        if (sel.quantity > returnableQty + EPSILON) {
          throw new Error(`Cannot return ${roundQty(sel.quantity)} of "${dnLine.description}" — only ${roundQty(returnableQty)} remain returnable.`);
        }
        const existingLine = rn.lineItems.find((l) => l.deliveryNoteLineId === sel.deliveryNoteLineId);
        const product = await this.products.getProduct(dnLine.productId);
        const isWholeLine = Math.abs(sel.quantity - dnLine.quantity) <= EPSILON;
        const rate = (dnLine.lineTotal ?? 0) > 0 ? (dnLine.taxAmount ?? 0) / (dnLine.lineTotal as number) : 0;
        const lineTotal = isWholeLine ? round2(dnLine.lineTotal ?? 0) : round2(sel.quantity * (dnLine.unitPrice ?? 0));
        const taxAmount = isWholeLine ? round2(dnLine.taxAmount ?? 0) : round2(lineTotal * rate);
        lineItems.push({
          id: existingLine?.id ?? newUuid(),
          deliveryNoteLineId: dnLine.id,
          salesOrderLineId: dnLine.salesOrderLineId,
          productId: dnLine.productId,
          description: dnLine.description,
          quantity: sel.quantity,
          unitCost: product?.costPrice ?? 0,
          unitPrice: dnLine.unitPrice,
          taxRateId: dnLine.taxRateId,
          taxAmount,
          lineTotal,
        });
      }
    }

    const updated = await this.repository.update(id, {
      returnDate: patch.returnDate ?? rn.returnDate,
      lineItems,
      notes: patch.notes ?? rn.notes,
    });
    await this.auditLog.log({
      userId: updatedBy,
      action: 'return_note_updated',
      module: 'sales',
      recordType: 'ReturnNote',
      recordId: id,
      newValue: { lineCount: updated.lineItems.length },
    });
    return updated;
  }

  /** Cancels a DRAFT Return Note — never a posted one. */
  async cancelDraft(id: ID, cancelledBy: ID = SYSTEM_USER_ID): Promise<ReturnNote> {
    const rn = await this.requireReturnNote(id);
    if (rn.status !== 'draft') {
      throw new Error(
        `Cannot cancel return note "${rn.returnNoteNumber}": only a draft can be cancelled (current status: ${rn.status}).`,
      );
    }
    const updated = await this.repository.update(id, { status: 'cancelled' });
    await this.auditLog.log({
      userId: cancelledBy,
      action: 'return_note_cancelled',
      module: 'sales',
      recordType: 'ReturnNote',
      recordId: id,
      newValue: { returnNoteNumber: rn.returnNoteNumber },
    });
    return updated;
  }

  /** Permanently removes a draft (mirrors `DeliveryNoteService.deleteDraft`). */
  async deleteDraft(id: ID): Promise<void> {
    const rn = await this.requireReturnNote(id);
    if (rn.status !== 'draft') {
      throw new Error(`Cannot delete return note "${rn.returnNoteNumber}": only a draft can be deleted (current status: ${rn.status}). Cancel it instead.`);
    }
    return this.repository.delete(id);
  }

  /**
   * Posts a draft Return Note. Friendly pre-validation here gives a fast,
   * readable error — it does NOT replace the database transaction guard:
   * `post_return_note` (0058, live) independently re-locks and re-derives
   * everything (including the FROZEN historical cost) inside its own atomic
   * transaction, which remains the final authority.
   */
  async postReturnNote(id: ID, postedBy: ID = SYSTEM_USER_ID): Promise<ReturnNote> {
    const rn = await this.requireReturnNote(id);
    if (rn.status !== 'draft') {
      throw new Error(`Cannot post return note "${rn.returnNoteNumber}": only a draft can be posted (current status: ${rn.status}).`);
    }
    if (rn.lineItems.length === 0) {
      throw new Error(`Cannot post return note "${rn.returnNoteNumber}": it has no lines.`);
    }

    const dn = await this.requireDeliveryNote(rn.deliveryNoteId);
    if (dn.status !== 'posted') {
      throw new Error(`Cannot post return note "${rn.returnNoteNumber}": delivery note "${dn.deliveryNoteNumber}" is ${dn.status}.`);
    }

    const returnable = await this.computeReturnableForDeliveryNote(dn.id);
    const returnableByLine = new Map(returnable.map((l) => [l.deliveryNoteLineId, l]));

    const contraAccountId = await this.accounts.getAccountId('GOODS_DELIVERED_NOT_INVOICED');
    const lineAccounts: ReturnNotePosterLineAccount[] = [];
    for (const line of rn.lineItems) {
      const returnableQty = returnableByLine.get(line.deliveryNoteLineId)?.returnableQty ?? 0;
      if (line.quantity > returnableQty + EPSILON) {
        throw new Error(
          `Cannot post return note "${rn.returnNoteNumber}": line "${line.description}" requests ${roundQty(line.quantity)} — only ${roundQty(returnableQty)} remain returnable (concurrent activity may have changed the available quantity).`,
        );
      }
      const product = await this.products.getProduct(line.productId);
      if (!product) {
        throw new Error(`Cannot post return note "${rn.returnNoteNumber}": product "${line.productId}" was not found.`);
      }
      const inventoryAccountId = await this.inventoryAccounts.resolveForProduct(product, 'inventory');
      lineAccounts.push({ returnNoteLineId: line.id, inventoryAccountId });
    }

    const result = await this.poster.post({ returnNoteId: rn.id, contraAccountId, lineAccounts, postedBy });
    const posted = await this.repository.update(id, { status: 'posted', journalEntryId: result.journalEntryId });

    await this.auditLog.log({
      userId: postedBy,
      action: 'return_note_posted',
      module: 'sales',
      recordType: 'ReturnNote',
      recordId: id,
      newValue: {
        returnNoteNumber: rn.returnNoteNumber,
        deliveryNoteId: dn.id,
        deliveryNoteNumber: dn.deliveryNoteNumber,
        lineCount: rn.lineItems.length,
        journalEntryId: result.journalEntryId,
      },
    });

    return posted;
  }

  private async requireReturnNote(id: ID): Promise<ReturnNote> {
    const rn = await this.repository.getById(id);
    if (!rn) throw new Error(`Return note "${id}" not found`);
    return rn;
  }

  private async requireDeliveryNote(id: ID): Promise<DeliveryNote> {
    const dn = await this.deliveryNoteRepository.getById(id);
    if (!dn) throw new Error(`Delivery note "${id}" not found`);
    return dn;
  }
}
