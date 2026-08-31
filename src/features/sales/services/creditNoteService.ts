import type { CreditNote, ID, Invoice, Product } from '@/types';
import type { ICreditNoteRepository } from '@/repositories/ICreditNoteRepository';
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

export type CreateCreditNoteDTO = Omit<CreditNote, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Minimal surface of InvoiceService this service depends on — allocating a
 * credit note against an invoice reuses InvoiceService.recordPayment(), and
 * the "returned qty ≤ invoiced qty" guard reads the linked invoice's lines.
 */
export interface InvoicePaymentRecorder {
  recordPayment(invoiceId: string, amount: number): Promise<unknown>;
  getInvoice(id: string): Promise<Invoice | undefined>;
}

const BALANCE_EPSILON = 0.01;

/**
 * Business-logic layer for Credit Notes (Accounts Receivable contra
 * documents). Issuing one posts the reverse of an Invoice posting; see
 * docs/LEDGER_ARCHITECTURE.md. There is no separate "Sales Returns"
 * contra-account in the Chart of Accounts — reusing Sales Revenue for the
 * debit leg is a deliberate, flagged simplification for this wave.
 */
export class CreditNoteService {
  constructor(
    private readonly repository: ICreditNoteRepository,
    /**
     * The ONE atomic inventory posting engine. `issueCreditNote()` hands it
     * the revenue-reversal / VAT / AR lines as `extraJournal`; for a
     * `reason === 'return'` note it also passes one `return_in` line per
     * product line — the engine computes the COGS reversal from current WAC
     * (DR Inventory / CR COGS), restores stock, and posts ONE balanced
     * entry in a single RPC.
     */
    private readonly engine: InventoryTransactionPoster,
    private readonly invoiceService: InvoicePaymentRecorder,
    private readonly accounts: AccountMapper,
    /** Product → category → generic-key resolution for revenue / inventory / COGS accounts. */
    private readonly inventoryAccounts: InventoryAccountResolver,
    private readonly products: DocumentProductLookup,
    private readonly warehouses: DocumentWarehouseResolver,
  ) {}

  async getCreditNotes(): Promise<CreditNote[]> {
    return this.repository.getAll();
  }

  async getCreditNote(id: string): Promise<CreditNote | undefined> {
    return this.repository.getById(id);
  }

  async createCreditNote(data: CreateCreditNoteDTO): Promise<CreditNote> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateCreditNote(id: string, patch: Partial<CreditNote>): Promise<CreditNote> {
    return this.repository.update(id, patch);
  }

  /**
   * Permanently removes a draft credit note. An issued/allocated credit
   * note has already posted to the GL — per SA_ACCOUNTING_MASTER_SPEC.md
   * §14/§36/§72/§79 it must never be deleted.
   */
  async deleteCreditNote(id: string): Promise<void> {
    const creditNote = await this.requireCreditNote(id);
    if (creditNote.status !== 'draft') {
      throw new Error(
        `Cannot delete credit note "${id}": only a draft credit note can be deleted (current status: ${creditNote.status}).`,
      );
    }
    return this.repository.delete(id);
  }

  /**
   * Posts a credit note to the ledger and transitions it from 'draft' to
   * 'issued'. Posts BEFORE updating the domain record and BEFORE restoring
   * stock — see docs/LEDGER_ARCHITECTURE.md and bankTransactionService.ts's
   * postAllocationsToLedger — so a failed post never leaves an orphaned
   * "issued" credit note row or stock restored with no matching journal
   * entry.
   *
   * debit  Sales Revenue        for creditNote.subtotal
   * debit  VAT Output           for creditNote.taxTotal (only if > 0)
   * credit Accounts Receivable  for creditNote.total
   * debit  Inventory  credit Cost of Goods Sold, for the total Cost of
   *        Sales reversal across every tracked-inventory line item — only
   *        when `reason === 'return'`
   *        (the goods are physically coming back; a pricing_error/discount/
   *        other credit note is a value adjustment with nothing to put back
   *        on the shelf). Cost is recalculated at the product's CURRENT
   *        weighted-average cost, the same simplification
   *        InvoiceService.postInvoice() already makes — not necessarily the
   *        exact cost the goods left at if the WAC has since moved. Stock
   *        itself is only restored AFTER this entry posts successfully.
   */
  async issueCreditNote(id: string, postedByUserId?: ID): Promise<CreditNote> {
    const creditNote = await this.requireCreditNote(id);
    if (creditNote.status !== 'draft') {
      throw new Error(
        `Cannot issue credit note "${id}": only a draft credit note can be issued (current status: ${creditNote.status}).`,
      );
    }

    const docLabel = `Credit Note ${creditNote.creditNoteNumber}`;
    const isReturn = creditNote.reason === 'return';
    const genericRevenueId = await this.accounts.getAccountId('SALES_REVENUE');

    // Resolve every product line's Product once.
    const productById = new Map<ID, Product>();
    for (const line of creditNote.lineItems) {
      if (line.productId && !productById.has(line.productId)) {
        const product = await this.products.getProduct(line.productId);
        if (!product) {
          throw new Error(`${docLabel}: product "${line.productId}" not found — cannot issue.`);
        }
        productById.set(line.productId, product);
      }
    }

    // New guard: a return line's quantity may not exceed what was invoiced
    // for that product on the linked invoice.
    if (isReturn && creditNote.invoiceId) {
      const invoice = await this.invoiceService.getInvoice(creditNote.invoiceId);
      if (invoice) {
        const invoicedByProduct = new Map<ID, number>();
        for (const line of invoice.lineItems) {
          if (line.productId) {
            invoicedByProduct.set(line.productId, (invoicedByProduct.get(line.productId) ?? 0) + line.quantity);
          }
        }
        const returnedByProduct = new Map<ID, number>();
        for (const line of creditNote.lineItems) {
          if (line.productId) {
            returnedByProduct.set(line.productId, (returnedByProduct.get(line.productId) ?? 0) + line.quantity);
          }
        }
        for (const [productId, returnedQty] of returnedByProduct) {
          const invoicedQty = invoicedByProduct.get(productId) ?? 0;
          if (returnedQty > invoicedQty + 1e-9) {
            throw new Error(
              `${docLabel}: return quantity ${returnedQty} for product "${productId}" exceeds the ${invoicedQty} invoiced on invoice "${creditNote.invoiceId}".`,
            );
          }
        }
      }
    }

    // --- extraJournal: the value reversal (always) ---
    const revenueContributions: { accountId: ID; amount: number }[] = [];
    for (const line of creditNote.lineItems) {
      const product = line.productId ? productById.get(line.productId) : undefined;
      const accountId = product
        ? await this.inventoryAccounts.resolveForProduct(product, 'revenue')
        : genericRevenueId;
      revenueContributions.push({ accountId, amount: line.lineTotal });
    }
    const revenueBuckets =
      revenueContributions.length > 0
        ? bucketByAccount(revenueContributions, creditNote.subtotal)
        : [{ accountId: genericRevenueId, amount: creditNote.subtotal }];

    const extraJournal: ExtraJournalLine[] = revenueBuckets.map((bucket) => ({
      accountId: bucket.accountId,
      debit: bucket.amount,
      credit: 0,
      description: docLabel,
    }));
    if (creditNote.taxTotal > 0) {
      extraJournal.push({
        accountId: await this.accounts.getAccountId('VAT_OUTPUT'),
        debit: creditNote.taxTotal,
        credit: 0,
        description: 'VAT Output reversal',
      });
    }
    extraJournal.push({
      accountId: await this.accounts.getAccountId('AR'),
      debit: 0,
      credit: creditNote.total,
      description: docLabel,
    });

    // --- inventory lines: only for a genuine goods return ---
    const lines: InventoryTransactionLine[] = [];
    if (isReturn) {
      for (const line of creditNote.lineItems) {
        if (!line.productId) continue;
        const product = productById.get(line.productId)!;
        const tracked = Boolean(product.trackInventory);
        const warehouseId = tracked
          ? await requireWarehouseId(this.warehouses, line.warehouseId, docLabel)
          : ((await resolveWarehouseId(this.warehouses, line.warehouseId)) ?? line.warehouseId ?? '');
        lines.push({
          productId: product.id,
          warehouseId,
          quantityDelta: line.quantity,
          costingMode: 'return_in',
          movementType: 'sales_return',
          inventoryAccountId: await this.inventoryAccounts.resolveForProduct(product, 'inventory'),
          contraAccountId: await this.inventoryAccounts.resolveForProduct(product, 'cogs'),
          sourceDocumentLineId: line.id,
          nonStock: !tracked,
        });
      }
    }

    const result = await this.engine.applyInventoryTransaction({
      postingKey: `credit_note:${creditNote.id}:issue`,
      sourceType: 'credit_note',
      sourceId: creditNote.id,
      movementDate: toMovementDate(creditNote.issueDate),
      createdBy: postedByUserId ?? SYSTEM_USER_ID,
      lines,
      extraJournal,
      journal: { source: 'credit_note', memo: docLabel },
    });

    return this.repository.update(id, { status: 'issued', journalEntryId: result.journalEntryId });
  }

  /**
   * Allocates part (or all) of an already-issued credit note's value
   * against a specific invoice. Reuses InvoiceService.recordPayment() —
   * see class doc — then records the allocation on the credit note itself
   * and moves it to 'allocated' once its full value has been applied.
   */
  async allocateToInvoice(id: string, invoiceId: string, amount: number): Promise<CreditNote> {
    const creditNote = await this.requireCreditNote(id);
    if (creditNote.status !== 'issued' && creditNote.status !== 'allocated') {
      throw new Error(
        `Cannot allocate credit note "${id}": it must be issued first (current status: ${creditNote.status}).`,
      );
    }
    if (amount <= 0) {
      throw new Error('Allocation amount must be greater than zero.');
    }
    const remaining = creditNote.total - creditNote.amountAllocated;
    if (amount - remaining > BALANCE_EPSILON) {
      throw new Error(
        `Cannot allocate ${amount.toFixed(2)}: only ${remaining.toFixed(2)} remains unallocated on credit note "${id}".`,
      );
    }

    await this.invoiceService.recordPayment(invoiceId, amount);

    const newAmountAllocated = Math.min(creditNote.amountAllocated + amount, creditNote.total);
    const status: CreditNote['status'] = newAmountAllocated >= creditNote.total - BALANCE_EPSILON ? 'allocated' : 'issued';

    return this.repository.update(id, {
      amountAllocated: newAmountAllocated,
      status,
      allocations: [
        ...creditNote.allocations,
        { invoiceId, amount, allocatedAt: new Date().toISOString() },
      ],
    });
  }

  /** Voids a draft credit note (soft delete — marks as void instead of removing). Issued credit notes are already posted and cannot be voided from here — see docs/LEDGER_ARCHITECTURE.md's reversal-only correction path. */
  async voidCreditNote(id: string): Promise<CreditNote> {
    const creditNote = await this.requireCreditNote(id);
    if (creditNote.status !== 'draft') {
      throw new Error(`Cannot void credit note "${id}": only a draft credit note can be voided directly (current status: ${creditNote.status}).`);
    }
    return this.repository.update(id, { status: 'void' });
  }

  /** Get credit notes for a specific customer. */
  async getCreditNotesByCustomer(customerId: string): Promise<CreditNote[]> {
    const all = await this.repository.getAll();
    return all.filter((cn) => cn.customerId === customerId);
  }

  /** Search credit notes by credit note number or customer ID. */
  async searchCreditNotes(query: string): Promise<CreditNote[]> {
    const all = await this.repository.getAll();
    const lowerQuery = query.toLowerCase();
    return all.filter(
      (cn) =>
        cn.creditNoteNumber.toLowerCase().includes(lowerQuery) || cn.customerId.toLowerCase().includes(lowerQuery),
    );
  }

  private async requireCreditNote(id: string): Promise<CreditNote> {
    const creditNote = await this.repository.getById(id);
    if (!creditNote) {
      throw new Error(`Credit note "${id}" not found`);
    }
    return creditNote;
  }
}
