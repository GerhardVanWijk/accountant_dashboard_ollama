import type { Bill, ID, PurchaseOrder } from '@/types';
import type { IPurchaseOrderRepository } from '@/repositories/IPurchaseOrderRepository';
import type { NewJournalLineInput } from '@/features/accounting/services';

export type CreatePurchaseOrderDTO = Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Minimal surface of JournalEntryService this service depends on. Mirrors
 * src/features/sales/services/creditNoteService.ts's JournalPoster.
 */
export interface JournalPoster {
  postJournalEntry(input: {
    date: string;
    memo?: string;
    source: string;
    lines: NewJournalLineInput[];
    postedByUserId?: ID;
  }): Promise<{ id: ID }>;
}

/**
 * Minimal surface of InventoryPoster this service depends on
 * (src/features/inventory/services/inventoryPostingAdapter.ts) — recording
 * the physical stock receipt and its GL value at PO-receipt time, per
 * SA_ACCOUNTING_MASTER_SPEC.md §22's 3-way PO/GRN/Invoice matching.
 */
export interface InventoryReceiver {
  isTrackedInventory(productId: ID): Promise<boolean>;
  recordReceiptMovement(productId: ID, quantity: number, unitCost: number, reference: string, warehouseId?: ID): Promise<void>;
}

/** Fixed Chart of Accounts ids this service posts against (src/mock-data/accounts.ts). */
const INVENTORY_ACCOUNT_ID = 'acc_1200'; // Inventory
const GRNI_ACCOUNT_ID = 'acc_2050'; // Goods Received Not Invoiced

/**
 * Business-logic layer for purchase orders.
 * Handles PO creation, updates, status changes, goods receipt (3-way
 * matching), and PO to Bill conversion.
 */
export class PurchaseOrderService {
  constructor(
    private readonly repository: IPurchaseOrderRepository,
    private readonly journalEntryService: JournalPoster,
    private readonly inventoryReceiver: InventoryReceiver,
  ) {}

  async getPurchaseOrders(): Promise<PurchaseOrder[]> {
    return this.repository.getAll();
  }

  async getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
    return this.repository.getById(id);
  }

  async createPurchaseOrder(data: CreatePurchaseOrderDTO): Promise<PurchaseOrder> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  async updatePurchaseOrder(id: string, patch: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    return this.repository.update(id, patch);
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

    const inventoryLines = [];
    for (const line of po.lineItems) {
      if (line.productId && (await this.inventoryReceiver.isTrackedInventory(line.productId))) {
        inventoryLines.push(line);
      }
    }
    const inventoryValue = inventoryLines.reduce((sum, line) => sum + line.lineTotal, 0);
    const receivedDate = new Date().toISOString();

    let journalEntryId: ID | undefined;
    if (inventoryValue > 0) {
      const lines: NewJournalLineInput[] = [
        { accountId: INVENTORY_ACCOUNT_ID, description: `PO ${po.poNumber} - Goods Received`, debit: inventoryValue, credit: 0 },
        { accountId: GRNI_ACCOUNT_ID, description: `PO ${po.poNumber} - GRNI`, debit: 0, credit: inventoryValue },
      ];
      const entry = await this.journalEntryService.postJournalEntry({
        date: receivedDate,
        memo: `Goods Received - PO ${po.poNumber}`,
        source: 'purchase_order_receipt',
        postedByUserId,
        lines,
      });
      journalEntryId = entry.id;

      await Promise.all(
        inventoryLines.map((line) =>
          this.inventoryReceiver.recordReceiptMovement(
            line.productId!,
            line.quantity,
            line.unitPrice,
            `PO ${po.poNumber}`,
            line.warehouseId,
          ),
        ),
      );
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
