import type { Bill, ID, Product, PurchaseOrder } from '@/types';
import type { IPurchaseOrderRepository } from '@/repositories/IPurchaseOrderRepository';
import { SYSTEM_USER_ID } from '@/features/accounting/services';
import type { InventoryAccountResolver } from '@/features/inventory/services/inventoryAccountResolver';
import type { InventoryTransactionLine } from '@/features/inventory/services/inventoryPostingEngine';
import {
  type DocumentProductLookup,
  type DocumentWarehouseResolver,
  type InventoryTransactionPoster,
  projectDocumentLinesBestEffort,
  requireWarehouseId,
  toMovementDate,
} from '@/features/inventory/services/documentInventoryPosting';
import type { IDocumentLineProjector } from '@/repositories/IDocumentLineProjector';
import { NoopDocumentLineProjector } from '@/repositories/NoopDocumentLineProjector';
import { newUuid } from '@/lib/uuid';
import { auditLogService, type AuditLogService } from '@/services/auditLogService';
import { documentNumberPrefix, nextDocumentNumber } from '../utils/nextDocumentNumber';

export type CreatePurchaseOrderDTO = Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Business-logic layer for purchase orders.
 * Handles PO creation, updates, status changes, goods receipt (3-way
 * matching), and PO to Bill conversion.
 */
export class PurchaseOrderService {
  constructor(
    private readonly repository: IPurchaseOrderRepository,
    /**
     * The ONE atomic inventory posting engine. `recordReceipt()` hands it
     * one `receipt` line per tracked-inventory line — the engine posts
     * DR <category Inventory> / CR GRNI, blends WAC and moves stock in a
     * single RPC. No separate journal post, no separate stock call.
     */
    private readonly engine: InventoryTransactionPoster,
    /** Product → category → generic-key resolution for the Inventory / GRNI accounts (now category-aware). */
    private readonly inventoryAccounts: InventoryAccountResolver,
    private readonly products: DocumentProductLookup,
    private readonly warehouses: DocumentWarehouseResolver,
    /** Phase 9B (docs/ACCOUNTING_RELATIONSHIPS.md §17-18) — see InvoiceService's identical parameter for the full rationale. */
    private readonly lineProjector: IDocumentLineProjector = new NoopDocumentLineProjector(),
    /** Phase 4B-2: records a "created" audit row for a duplicated purchase order. Defaults to the shared singleton. */
    private readonly auditLog: AuditLogService = auditLogService,
  ) {}

  async getPurchaseOrders(): Promise<PurchaseOrder[]> {
    return this.repository.getAll();
  }

  async getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
    return this.repository.getById(id);
  }

  async createPurchaseOrder(data: CreatePurchaseOrderDTO): Promise<PurchaseOrder> {
    const now = new Date().toISOString();
    const po = await this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
    await projectDocumentLinesBestEffort(this.lineProjector, po.id, po.lineItems, `Purchase Order ${po.poNumber}`);
    return po;
  }

  async updatePurchaseOrder(id: string, patch: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    const updated = await this.repository.update(id, patch);
    if ('lineItems' in patch) {
      await projectDocumentLinesBestEffort(this.lineProjector, updated.id, updated.lineItems, `Purchase Order ${updated.poNumber}`);
    }
    return updated;
  }

  /** Permanently removes a draft purchase order. Once sent/received/converted it's a real commitment and must be cancelled instead of deleted. */
  async deletePurchaseOrder(id: string): Promise<void> {
    const po = await this.repository.getById(id);
    if (!po) {
      throw new Error(`Purchase order "${id}" not found`);
    }
    if (po.status !== 'draft') {
      throw new Error(
        `Cannot delete purchase order "${id}": only a draft PO can be deleted (current status: ${po.status}). Cancel it instead.`,
      );
    }
    return this.repository.delete(id);
  }

  /**
   * Copies a purchase order into a brand-new DRAFT PO — new number,
   * today's order date, fresh line-item ids, supplier + notes carried
   * over. `billId` / `journalEntryId` / `receivedDate` / `expectedDate`
   * are all dropped (the copy has received nothing and is linked to
   * nothing). NO GL posting. Throws if the source does not exist. Writes a
   * `created` audit row naming the source PO number.
   */
  async duplicatePurchaseOrder(id: string, duplicatedBy: ID = SYSTEM_USER_ID): Promise<PurchaseOrder> {
    const source = await this.repository.getById(id);
    if (!source) {
      throw new Error(`Purchase order "${id}" not found`);
    }
    const existing = await this.repository.getAll();
    const copy = await this.createPurchaseOrder({
      poNumber: nextDocumentNumber(
        existing.map((p) => p.poNumber),
        documentNumberPrefix(source.poNumber, 'PO'),
      ),
      supplierId: source.supplierId,
      orderDate: new Date().toISOString(),
      lineItems: source.lineItems.map((line) => ({ ...line, id: newUuid() })),
      subtotal: source.subtotal,
      taxTotal: source.taxTotal,
      total: source.total,
      currency: source.currency,
      status: 'draft',
      notes: source.notes,
    });
    await this.auditLog.log({
      userId: duplicatedBy,
      action: 'created',
      module: 'purchases',
      recordType: 'PurchaseOrder',
      recordId: copy.id,
      reason: `Duplicated from ${source.poNumber}`,
      newValue: { copiedFromNumber: source.poNumber },
    });
    return copy;
  }

  /**
   * Sends a purchase order to the supplier.
   * Transitions status from 'draft' to 'sent'.
   */
  async sendPurchaseOrder(id: string): Promise<PurchaseOrder> {
    return this.repository.update(id, { status: 'sent' });
  }

  /**
   * Records receipt of goods for a purchase order — real 3-way (PO/GRN/
   * Invoice) matching, per SA_ACCOUNTING_MASTER_SPEC.md §22. Until
   * 2026-08-22 this was status-only: stock and the Inventory GL value were
   * only ever recognized at Bill-posting time, so goods physically
   * received well before the bill posted were invisible on the books
   * during that window (see docs/KNOWN_ISSUES.md's now-resolved entry).
   *
   * Now, for every tracked-inventory line item:
   *   debit  Inventory (acc_1200)                for the received value
   *   credit GRNI      (acc_2050, a clearing/liability account) — goods
   *          are in, but the supplier hasn't been formally invoiced yet,
   *          so this is not yet an Accounts Payable amount
   * then increases stock via `InventoryPostingAdapter.recordReceiptMovement()`
   * (recalculating weighted-average cost), same as a Bill-triggered
   * receipt — GL posts FIRST, stock only mutates after it succeeds.
   *
   * `billService.postBill()` checks this PO's `journalEntryId`: if set, the
   * matching Bill clears GRNI (debit GRNI, not Inventory) and does NOT
   * call `recordReceiptMovement()` again — stock/value were already
   * recognized here, so re-recording would double-count. VAT is
   * deliberately NOT touched here — input VAT is only claimable against a
   * real supplier tax invoice (the Bill), never at goods-receipt time.
   *
   * No-op for non-tracked/service lines — there's nothing physical to
   * receive into stock, they still just post as an expense when the Bill
   * arrives, exactly as before.
   *
   * Rejects a PO that's already been received (idempotency — this posts a
   * real GL entry, so running it twice would double-post GRNI/Inventory)
   * or one that's cancelled. Still all-or-nothing per PO — a genuine
   * partial receipt (only some of a line's ordered quantity arriving) is
   * not modeled; `PurchaseOrderStatus.partially_received` exists on the
   * type but nothing produces it yet.
   */
  async recordReceipt(id: string, postedByUserId?: ID): Promise<PurchaseOrder> {
    const po = await this.repository.getById(id);
    if (!po) {
      throw new Error(`Purchase order "${id}" not found`);
    }
    if (po.status === 'received') {
      throw new Error(`Purchase order "${id}" has already been received.`);
    }
    if (po.status === 'cancelled') {
      throw new Error(`Cannot record receipt for cancelled purchase order "${id}".`);
    }

    const docLabel = `PO ${po.poNumber}`;
    const trackedLines: { line: PurchaseOrder['lineItems'][number]; product: Product }[] = [];
    for (const line of po.lineItems) {
      if (!line.productId) continue;
      const product = await this.products.getProduct(line.productId);
      if (product?.trackInventory) trackedLines.push({ line, product });
    }
    const receivedDate = new Date().toISOString();

    let journalEntryId: ID | undefined;
    if (trackedLines.length > 0) {
      const lines: InventoryTransactionLine[] = [];
      for (const { line, product } of trackedLines) {
        lines.push({
          productId: product.id,
          warehouseId: await requireWarehouseId(this.warehouses, line.warehouseId, docLabel),
          quantityDelta: line.quantity,
          costingMode: 'receipt',
          unitCostIn: line.unitPrice,
          inventoryAccountId: await this.inventoryAccounts.resolveForProduct(product, 'inventory'),
          contraAccountId: await this.inventoryAccounts.resolveKey('GRNI'),
          sourceDocumentLineId: line.id,
          nonStock: false,
        });
      }
      const result = await this.engine.applyInventoryTransaction({
        postingKey: `purchase_order:${po.id}:receipt`,
        sourceType: 'purchase_order',
        sourceId: po.id,
        movementDate: toMovementDate(receivedDate),
        createdBy: postedByUserId ?? SYSTEM_USER_ID,
        lines,
        extraJournal: [],
        journal: { source: 'purchase_order_receipt', memo: `Goods Received - ${docLabel}` },
      });
      journalEntryId = result.journalEntryId;
    }

    return this.repository.update(id, { status: 'received', receivedDate, journalEntryId });
  }

  /**
   * Cancels a purchase order.
   */
  async cancelPurchaseOrder(id: string): Promise<PurchaseOrder> {
    return this.repository.update(id, { status: 'cancelled' });
  }

  /**
   * Converts a purchase order to a bill.
   * Creates a new Bill record with the same line items and totals.
   * In a real system, this would call billService.createBill().
   * Rejects a PO that's already been converted (`billId` set) — enforced
   * here, not just in the UI, so it can't be bypassed by calling this
   * twice in quick succession.
   */
  async convertToBill(poId: string): Promise<Omit<Bill, 'id' | 'createdAt' | 'updatedAt'>> {
    const po = await this.repository.getById(poId);
    if (!po) {
      throw new Error(`Purchase order "${poId}" not found`);
    }
    if (po.billId) {
      throw new Error(`Purchase order "${poId}" has already been converted to a bill (${po.billId}).`);
    }

    // Generate bill number from PO number
    const billNumber = po.poNumber.replace('PO-', 'BILL-');

    return {
      billNumber,
      supplierId: po.supplierId,
      purchaseOrderId: poId,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
      lineItems: po.lineItems,
      subtotal: po.subtotal,
      taxTotal: po.taxTotal,
      total: po.total,
      amountPaid: 0,
      currency: po.currency,
      status: 'awaiting_payment',
      notes: `Bill from ${po.poNumber}`,
    };
  }

  /**
   * Get purchase orders by status.
   */
  async getPurchaseOrdersByStatus(status: PurchaseOrder['status']): Promise<PurchaseOrder[]> {
    const all = await this.repository.getAll();
    return all.filter((po) => po.status === status);
  }

  /**
   * Get purchase orders for a specific supplier.
   */
  async getPurchaseOrdersBySupplier(supplierId: string): Promise<PurchaseOrder[]> {
    const all = await this.repository.getAll();
    return all.filter((po) => po.supplierId === supplierId);
  }

  /**
   * Get purchase orders that haven't been invoiced yet.
   */
  async getUninvoicedPurchaseOrders(): Promise<PurchaseOrder[]> {
    const all = await this.repository.getAll();
    return all.filter((po) => po.status !== 'cancelled' && po.status !== 'draft');
  }

  /**
   * Calculate total value of purchase orders by status.
   */
  async calculateOrderValue(status?: PurchaseOrder['status']): Promise<number> {
    let orders = await this.repository.getAll();
    if (status) {
      orders = orders.filter((po) => po.status === status);
    }
    return orders.reduce((sum, po) => sum + po.total, 0);
  }
}
