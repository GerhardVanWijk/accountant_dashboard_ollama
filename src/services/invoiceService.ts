import type { ID, Invoice } from '@/types';
import type { IInvoiceRepository } from '@/repositories/IInvoiceRepository';
import type { AccountMapper, CategoryAccountResolver, NewJournalLineInput } from '@/features/accounting/services';
import { bucketByAccount, nullCategoryAccountResolver, roundToCents } from '@/features/accounting/services';

export type CreateInvoiceDTO = Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Minimal surface of JournalEntryService that InvoiceService depends on —
 * an interface, not the concrete class, so this service stays
 * unit-testable with a stub and never needs to reach into
 * src/features/accounting internals beyond its published service API
 * (@/features/accounting/services). Mirrors
 * src/features/banking/services/bankTransactionService.ts's JournalPoster.
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
 * (src/features/inventory/services/inventoryPostingAdapter.ts) — resolving
 * Cost of Sales and reducing stock for a sale, per
 * SA_ACCOUNTING_MASTER_SPEC.md §24.
 */
export interface InventoryMover {
  calculateCogs(productId: ID, quantity: number, warehouseId?: ID): Promise<number>;
  recordSaleMovement(productId: ID, quantity: number, reference: string, warehouseId?: ID): Promise<void>;
  /**
   * This product's category, for per-line revenue/COGS account resolution
   * (Phase 21.3). Optional so existing stubs don't need it — a stub that
   * omits it behaves exactly as before (every line → generic account).
   */
  getProductCategory?(productId: ID): Promise<string | undefined>;
}

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
    private readonly journalEntryService: JournalPoster,
    private readonly inventoryMover: InventoryMover,
    private readonly accounts: AccountMapper,
    /**
     * Resolves a line's product category to granular revenue / COGS /
     * inventory accounts (Phase 21.3). Defaults to the null resolver, so a
     * caller that doesn't wire it keeps the pre-21.3 single-line-per-leg
     * behaviour (every line → generic `SALES_REVENUE` / `COGS` /
     * `INVENTORY`).
     */
    private readonly categoryAccounts: CategoryAccountResolver = nullCategoryAccountResolver,
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
   * 'sent'. Posts BEFORE updating the domain record and BEFORE reducing
   * stock — see docs/LEDGER_ARCHITECTURE.md and
   * bankTransactionService.ts's postAllocationsToLedger — so a failed
   * post (unbalanced entry, closed accounting period) never leaves an
   * orphaned "posted" invoice row or stock reduced with no matching
   * journal entry.
   *
   * debit  Accounts Receivable for invoice.total
   * credit Sales Revenue      for invoice.subtotal — split into one line
   *        per resolved revenue account when line items map to different
   *        product categories (Phase 21.3); the buckets are reconciled to
   *        invoice.subtotal so the entry still balances to the cent.
   * credit VAT Output         for invoice.taxTotal (only if > 0)
   * debit  Cost of Goods Sold  credit Inventory, for
   *        the total Cost of Sales across every tracked-inventory line
   *        item (only if > 0) — SA_ACCOUNTING_MASTER_SPEC.md §24: revenue
   *        must never post without the corresponding inventory/cost
   *        treatment where inventory is involved. Both legs are likewise
   *        split by the line's resolved category account. Stock itself is
   *        only reduced AFTER this entry posts successfully.
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

    const genericRevenueId = await this.accounts.getAccountId('SALES_REVENUE');

    // Per-line category -> granular account resolution (Phase 21.3). A line
    // with no product, no category, or an unmapped category resolves to the
    // generic account, reproducing the pre-21.3 single-line behaviour. A
    // mixed-category invoice gets one revenue line per resolved account,
    // the buckets reconciled to `invoice.subtotal` so the entry still
    // balances to the cent despite per-line rounding.
    const lineCategoryAccounts = await Promise.all(
      invoice.lineItems.map(async (line) => {
        const category =
          line.productId && this.inventoryMover.getProductCategory
            ? await this.inventoryMover.getProductCategory(line.productId)
            : undefined;
        return this.categoryAccounts.resolveForCategory(category);
      }),
    );

    const revenueContributions = invoice.lineItems.map((line, index) => ({
      accountId: lineCategoryAccounts[index].revenueAccountId ?? genericRevenueId,
      amount: line.lineTotal,
    }));
    const revenueBuckets =
      revenueContributions.length > 0
        ? bucketByAccount(revenueContributions, invoice.subtotal)
        : [{ accountId: genericRevenueId, amount: invoice.subtotal }];

    const lines: NewJournalLineInput[] = [
      {
        accountId: await this.accounts.getAccountId('AR'),
        description: `Invoice ${invoice.invoiceNumber}`,
        debit: invoice.total,
        credit: 0,
      },
      ...revenueBuckets.map((bucket) => ({
        accountId: bucket.accountId,
        description: `Invoice ${invoice.invoiceNumber}`,
        debit: 0,
        credit: bucket.amount,
      })),
    ];
    if (invoice.taxTotal > 0) {
      lines.push({
        accountId: await this.accounts.getAccountId('VAT_OUTPUT'),
        description: 'VAT Output',
        debit: 0,
        credit: invoice.taxTotal,
      });
    }

    const inventoryLines = invoice.lineItems.filter((line) => line.productId);
    const inventoryLineAccounts = invoice.lineItems
      .map((line, index) => ({ line, resolved: lineCategoryAccounts[index] }))
      .filter((entry) => entry.line.productId);
    const cogsByLine = await Promise.all(
      inventoryLines.map((line) => this.inventoryMover.calculateCogs(line.productId!, line.quantity, line.warehouseId)),
    );
    const roundedCogs = cogsByLine.map(roundToCents);
    const totalCogs = roundToCents(roundedCogs.reduce((sum, c) => sum + c, 0));
    if (totalCogs > 0) {
      const genericCogsId = await this.accounts.getAccountId('COGS');
      const genericInventoryId = await this.accounts.getAccountId('INVENTORY');
      const cogsBuckets = bucketByAccount(
        inventoryLineAccounts.map((entry, i) => ({
          accountId: entry.resolved.cogsAccountId ?? genericCogsId,
          amount: roundedCogs[i],
        })),
      );
      const inventoryBuckets = bucketByAccount(
        inventoryLineAccounts.map((entry, i) => ({
          accountId: entry.resolved.inventoryAccountId ?? genericInventoryId,
          amount: roundedCogs[i],
        })),
      );
      for (const bucket of cogsBuckets) {
        lines.push({
          accountId: bucket.accountId,
          description: `Invoice ${invoice.invoiceNumber} - Cost of Sales`,
          debit: bucket.amount,
          credit: 0,
        });
      }
      for (const bucket of inventoryBuckets) {
        lines.push({
          accountId: bucket.accountId,
          description: `Invoice ${invoice.invoiceNumber} - Inventory`,
          debit: 0,
          credit: bucket.amount,
        });
      }
    }

    const entry = await this.journalEntryService.postJournalEntry({
      date: invoice.issueDate,
      memo: `Invoice ${invoice.invoiceNumber}`,
      source: 'invoice',
      postedByUserId,
      lines,
    });

    await Promise.all(
      inventoryLines.map((line) =>
        this.inventoryMover.recordSaleMovement(
          line.productId!,
          line.quantity,
          `Invoice ${invoice.invoiceNumber}`,
          line.warehouseId,
        ),
      ),
    );

    return this.repository.update(id, { status: 'sent', journalEntryId: entry.id });
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
