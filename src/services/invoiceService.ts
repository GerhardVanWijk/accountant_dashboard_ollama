import type { ID, Invoice, Product } from '@/types';
import type { IInvoiceRepository } from '@/repositories/IInvoiceRepository';
import type { AccountMapper } from '@/features/accounting/services';
import { bucketByAccount, SYSTEM_USER_ID } from '@/features/accounting/services';
import type { InventoryAccountResolver } from '@/features/inventory/services/inventoryAccountResolver';
import type {
  ExtraJournalLine,
  InventoryTransactionLine,
} from '@/features/inventory/services/inventoryPostingEngine';
import {
  type DocumentProductLookup,
  type DocumentWarehouseResolver,
  type InventoryTransactionPoster,
  requireWarehouseId,
  resolveWarehouseId,
  toMovementDate,
} from '@/features/inventory/services/documentInventoryPosting';

export type CreateInvoiceDTO = Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Every field that either fed the journal entry `postInvoice()` created
 * (invoiceNumber/issueDate/lineItems/subtotal/taxTotal/total/currency —
 * see its doc comment for the exact debit/credit mapping) or is otherwise
 * exclusively owned by a dedicated, already-guarded transition
 * (status/amountPaid by postInvoice()/recordPayment(); journalEntryId/
 * salesOrderId are provenance, never user-editable). updateInvoice()
 * refuses to change any of these once the invoice is no longer 'draft' —
 * see its doc comment.
 */
const ACCOUNTING_RELEVANT_FIELDS: (keyof Invoice)[] = [
  'invoiceNumber',
  'customerId',
  'salesOrderId',
  'issueDate',
  'lineItems',
  'subtotal',
  'taxTotal',
  'total',
  'amountPaid',
  'currency',
  'status',
  'journalEntryId',
];

/**
 * True only if `patch` actually attempts to change `key`'s value — a
 * caller submitting a full Invoice-shaped object where a protected field
 * happens to already match what's stored is not an edit, so it's not
 * blocked. Arrays (`lineItems`) are compared by value, not reference.
 */
function fieldChanged<K extends keyof Invoice>(current: Invoice, patch: Partial<Invoice>, key: K): boolean {
  if (!(key in patch)) return false;
  const nextValue = patch[key];
  const currentValue = current[key];
  if (Array.isArray(nextValue) || Array.isArray(currentValue)) {
    return JSON.stringify(nextValue) !== JSON.stringify(currentValue);
  }
  return nextValue !== currentValue;
}

/**
 * Business-logic layer between hooks/components and the repository.
 * Handles invoice operations including CRUD, status transitions, payment
 * tracking, and GL posting for the draft -> sent transition.
 */
export class InvoiceService {
  constructor(
    private readonly repository: IInvoiceRepository,
    /**
     * The ONE atomic inventory posting engine. `postInvoice()` hands it the
     * revenue/AR/VAT lines as `extraJournal` plus one inventory `line` per
     * product line — the engine computes COGS from WAC, merges, and posts a
     * SINGLE balanced journal entry + the stock movements + WAC in one RPC.
     */
    private readonly engine: InventoryTransactionPoster,
    /** Product → category → generic-key resolution for the revenue / inventory / COGS accounts. */
    private readonly inventoryAccounts: InventoryAccountResolver,
    private readonly accounts: AccountMapper,
    private readonly products: DocumentProductLookup,
    private readonly warehouses: DocumentWarehouseResolver,
  ) {}

  async getInvoices(): Promise<Invoice[]> {
    return this.repository.getAll();
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    return this.repository.getById(id);
  }

  async createInvoice(data: CreateInvoiceDTO): Promise<Invoice> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Updates an invoice, refusing any change to a field that fed the
   * already-posted GL entry once the invoice is past 'draft' — see
   * ACCOUNTING_RELEVANT_FIELDS' doc comment. A draft invoice (never
   * posted, no `journalEntryId`) may still be edited freely, matching
   * `deleteInvoice()`'s own draft/posted distinction. Only `dueDate` and
   * `notes` remain editable after posting — neither feeds the journal
   * entry (postInvoice() posts against `issueDate`, not `dueDate`, and
   * never reads `notes`) — everything else must go through a Credit Note
   * instead, the same correction path `deleteInvoice()` already points
   * callers to. Enforced here, not just hidden in the UI, so no other
   * caller (a future API route, a script, a different page) can bypass it.
   */
  async updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice> {
    const invoice = await this.requireInvoice(id);
    if (invoice.status !== 'draft') {
      const changedField = ACCOUNTING_RELEVANT_FIELDS.find((key) => fieldChanged(invoice, patch, key));
      if (changedField) {
        throw new Error(
          `Cannot edit invoice "${id}": "${changedField}" cannot be changed once the invoice has posted to the ledger ` +
            `(current status: ${invoice.status}). Only dueDate and notes may still be changed here — correct the ` +
            `invoiced amount with a credit note instead.`,
        );
      }
    }
    return this.repository.update(id, patch);
  }

  /**
   * Permanently removes a draft invoice. A posted invoice (anything past
   * 'draft') is accounting history — per SA_ACCOUNTING_MASTER_SPEC.md §14/
   * §36/§72/§79 it must never be deleted, only reversed via a credit note.
   */
  async deleteInvoice(id: string): Promise<void> {
    const invoice = await this.requireInvoice(id);
    if (invoice.status !== 'draft') {
      throw new Error(
        `Cannot delete invoice "${id}": only a draft invoice can be deleted (current status: ${invoice.status}). Issue a credit note instead.`,
      );
    }
    return this.repository.delete(id);
  }

  private async requireInvoice(id: string): Promise<Invoice> {
    const invoice = await this.repository.getById(id);
    if (!invoice) {
      throw new Error(`Invoice "${id}" not found`);
    }
    return invoice;
  }

  /**
   * Posts an invoice to the ledger and transitions it from 'draft' to
   * 'sent'. Posts BEFORE updating the domain record — a failed post
   * (unbalanced entry, closed accounting period, no warehouse for a
   * tracked line) never leaves an orphaned "posted" invoice row.
   *
   * Everything is now ONE atomic call to the inventory posting engine —
   * no separate `journalEntryService` post, no separate per-line stock
   * call, no `Promise.all` fan-out. The single journal entry the engine
   * builds is:
   *
   *   DR Accounts Receivable                    invoice.total
   *   CR Sales Revenue (per resolved account)   bucketed to invoice.subtotal
   *   CR VAT Output                             invoice.taxTotal   (only if > 0)
   *   DR Cost of Goods Sold (per product)       Σ WAC × qty        (engine-computed)
   *   CR Inventory (per product)                Σ WAC × qty        (engine-computed)
   *
   * The AR / revenue / VAT lines are passed as `extraJournal`; the engine
   * computes the COGS / inventory legs from each product's current
   * weighted-average cost inside the atomic RPC and merges them in.
   * Service (non-tracked-product) lines pass a `nonStock` line — the
   * engine records neither a movement nor a COGS leg for it.
   */
  async postInvoice(id: string, postedByUserId?: ID): Promise<Invoice> {
    const invoice = await this.repository.getById(id);
    if (!invoice) {
      throw new Error(`Invoice "${id}" not found`);
    }
    if (invoice.status !== 'draft') {
      throw new Error(
        `Cannot post invoice "${id}": only a draft invoice can be posted (current status: ${invoice.status}).`,
      );
    }

    const docLabel = `Invoice ${invoice.invoiceNumber}`;
    const genericRevenueId = await this.accounts.getAccountId('SALES_REVENUE');

    // Resolve every product line's Product once (needed for account
    // resolution + trackInventory + warehouse).
    const productById = new Map<ID, Product>();
    for (const line of invoice.lineItems) {
      if (line.productId && !productById.has(line.productId)) {
        const product = await this.products.getProduct(line.productId);
        if (!product) {
          throw new Error(`${docLabel}: product "${line.productId}" not found — cannot post.`);
        }
        productById.set(line.productId, product);
      }
    }

    // --- extraJournal: AR / revenue / VAT (the non-inventory side) ---
    const revenueContributions: { accountId: ID; amount: number }[] = [];
    for (const line of invoice.lineItems) {
      const product = line.productId ? productById.get(line.productId) : undefined;
      const accountId = product
        ? await this.inventoryAccounts.resolveForProduct(product, 'revenue')
        : genericRevenueId;
      revenueContributions.push({ accountId, amount: line.lineTotal });
    }
    const revenueBuckets =
      revenueContributions.length > 0
        ? bucketByAccount(revenueContributions, invoice.subtotal)
        : [{ accountId: genericRevenueId, amount: invoice.subtotal }];

    const extraJournal: ExtraJournalLine[] = [
      { accountId: await this.accounts.getAccountId('AR'), debit: invoice.total, credit: 0, description: docLabel },
      ...revenueBuckets.map((bucket) => ({
        accountId: bucket.accountId,
        debit: 0,
        credit: bucket.amount,
        description: docLabel,
      })),
    ];
    if (invoice.taxTotal > 0) {
      extraJournal.push({
        accountId: await this.accounts.getAccountId('VAT_OUTPUT'),
        debit: 0,
        credit: invoice.taxTotal,
        description: 'VAT Output',
      });
    }

    // --- inventory lines: one per product line (issue at WAC) ---
    const lines: InventoryTransactionLine[] = [];
    for (const line of invoice.lineItems) {
      if (!line.productId) continue;
      const product = productById.get(line.productId)!;
      const tracked = Boolean(product.trackInventory);
      const warehouseId = tracked
        ? await requireWarehouseId(this.warehouses, line.warehouseId, docLabel)
        : ((await resolveWarehouseId(this.warehouses, line.warehouseId)) ?? line.warehouseId ?? '');
      lines.push({
        productId: product.id,
        warehouseId,
        quantityDelta: -line.quantity,
        costingMode: 'issue',
        movementType: 'sale',
        inventoryAccountId: await this.inventoryAccounts.resolveForProduct(product, 'inventory'),
        contraAccountId: await this.inventoryAccounts.resolveForProduct(product, 'cogs'),
        sourceDocumentLineId: line.id,
        nonStock: !tracked,
      });
    }

    const result = await this.engine.applyInventoryTransaction({
      postingKey: `invoice:${invoice.id}:post`,
      sourceType: 'invoice',
      sourceId: invoice.id,
      movementDate: toMovementDate(invoice.issueDate),
      createdBy: postedByUserId ?? SYSTEM_USER_ID,
      lines,
      extraJournal,
      journal: { source: 'invoice', memo: docLabel },
    });

    return this.repository.update(id, { status: 'sent', journalEntryId: result.journalEntryId });
  }

  /**
   * Mark an invoice as sent (sent to customer). Delegates to postInvoice()
   * so "sent" always means "posted to the GL" — there is no
   * status-only path that skips the ledger.
   */
  async markInvoiceAsSent(id: string, postedByUserId?: ID): Promise<Invoice> {
    return this.postInvoice(id, postedByUserId);
  }

  /**
   * Record a payment against an invoice.
   * Updates amountPaid and recalculates status.
   */
  async recordPayment(id: string, amount: number): Promise<Invoice> {
    const invoice = await this.repository.getById(id);
    if (!invoice) {
      throw new Error(`Invoice ${id} not found`);
    }

    const newAmountPaid = Math.min(invoice.amountPaid + amount, invoice.total);
    let status = invoice.status;

    if (newAmountPaid >= invoice.total) {
      status = 'paid';
    } else if (newAmountPaid > 0) {
      status = 'partially_paid';
    }

    return this.repository.update(id, {
      amountPaid: newAmountPaid,
      status,
    });
  }

  /**
   * Calculate the outstanding amount (total - amountPaid).
   */
  getOutstandingAmount(invoice: Invoice): number {
    return Math.max(0, invoice.total - invoice.amountPaid);
  }

  /**
   * Calculate the collection percentage.
   */
  getCollectionPercentage(invoice: Invoice): number {
    if (invoice.total === 0) return 0;
    return (invoice.amountPaid / invoice.total) * 100;
  }

  /**
   * Check if invoice is overdue (dueDate has passed and status is not 'paid').
   */
  isOverdue(invoice: Invoice): boolean {
    if (invoice.status === 'paid') return false;
    const dueDate = new Date(invoice.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  }

  /**
   * Get invoices filtered by status.
   */
  async getInvoicesByStatus(status: string): Promise<Invoice[]> {
    const invoices = await this.repository.getAll();
    return invoices.filter((inv) => inv.status === status);
  }

  /**
   * Get invoices for a specific customer.
   */
  async getInvoicesByCustomer(customerId: string): Promise<Invoice[]> {
    const invoices = await this.repository.getAll();
    return invoices.filter((inv) => inv.customerId === customerId);
  }

  /**
   * Search invoices by invoice number or customer ID.
   */
  async searchInvoices(query: string): Promise<Invoice[]> {
    const invoices = await this.repository.getAll();
    const lowerQuery = query.toLowerCase();
    return invoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(lowerQuery) ||
        inv.customerId.toLowerCase().includes(lowerQuery),
    );
  }
}
