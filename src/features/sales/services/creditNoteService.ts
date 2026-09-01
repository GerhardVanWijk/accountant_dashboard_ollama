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
  projectDocumentLinesBestEffort,
  requireWarehouseId,
  resolveWarehouseId,
  toMovementDate,
} from '@/features/inventory/services/documentInventoryPosting';
import type { IDocumentLineProjector } from '@/repositories/IDocumentLineProjector';
import { NoopDocumentLineProjector } from '@/repositories/NoopDocumentLineProjector';

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
    /** Phase 9B (docs/ACCOUNTING_RELATIONSHIPS.md §17-18) — see InvoiceService's identical parameter for the full rationale. */
    private readonly lineProjector: IDocumentLineProjector = new NoopDocumentLineProjector(),
  ) {}

  async getCreditNotes(): Promise<CreditNote[]> {
    return this.repository.getAll();
  }

  async getCreditNote(id: string): Promise<CreditNote | undefined> {
    return this.repository.getById(id);
  }

  async createCreditNote(data: CreateCreditNoteDTO): Promise<CreditNote> {
    const now = new Date().toISOString();
    const creditNote = await this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
    await projectDocumentLinesBestEffort(this.lineProjector, creditNote.id, creditNote.lineItems, `Credit Note ${creditNote.creditNoteNumber}`);
    return creditNote;
  }

  async updateCreditNote(id: string, patch: Partial<CreditNote>): Promise<CreditNote> {
    const updated = await this.repository.update(id, patch);
    if ('lineItems' in patch) {
      await projectDocumentLinesBestEffort(this.lineProjector, updated.id, updated.lineItems, `Credit Note ${updated.creditNoteNumber}`);
    }
    return updated;
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

    // Return-quantity guard. Phase 9B (docs/ACCOUNTING_RELATIONSHIPS.md §4):
    // a line that carries `originalInvoiceLineId` is validated against THAT
    // specific invoice line (plus whatever any other already-posted credit
    // note already returned against that same line) — the fix for two
    // lines on one invoice sharing a product, which the old
    // whole-invoice/whole-product aggregate below could not tell apart. A
    // line with no `originalInvoiceLineId` (older data, or a credit note
    // that deliberately targets the product rather than one line) falls
    // back to that same aggregate check as before, ALSO now netted against
    // prior posted credit notes' aggregate returns — the old version only
    // ever compared against the current credit note's own lines, so two
    // separate credit notes could together over-return a product with
    // neither one alone tripping the guard.
    if (isReturn && creditNote.invoiceId) {
      const invoice = await this.invoiceService.getInvoice(creditNote.invoiceId);
      if (invoice) {
        const invoiceLineById = new Map(invoice.lineItems.map((line) => [line.id, line]));

        const priorPostedNotes = (await this.repository.getAll()).filter(
          (cn) => cn.id !== creditNote.id && cn.invoiceId === creditNote.invoiceId && cn.status !== 'draft' && cn.status !== 'void',
        );
        const priorReturnedByLine = new Map<ID, number>();
        const priorReturnedByProduct = new Map<ID, number>();
        for (const priorNote of priorPostedNotes) {
          for (const line of priorNote.lineItems) {
            if (!line.productId) continue;
            if (line.originalInvoiceLineId) {
              priorReturnedByLine.set(
                line.originalInvoiceLineId,
                (priorReturnedByLine.get(line.originalInvoiceLineId) ?? 0) + line.quantity,
              );
            } else {
              priorReturnedByProduct.set(line.productId, (priorReturnedByProduct.get(line.productId) ?? 0) + line.quantity);
            }
          }
        }

        const returningByLine = new Map<ID, number>();
        const returningByProduct = new Map<ID, number>();
        for (const line of creditNote.lineItems) {
          if (!line.productId) continue;
          if (line.originalInvoiceLineId) {
            returningByLine.set(line.originalInvoiceLineId, (returningByLine.get(line.originalInvoiceLineId) ?? 0) + line.quantity);
          } else {
            returningByProduct.set(line.productId, (returningByProduct.get(line.productId) ?? 0) + line.quantity);
          }
        }

        // Line-specific check.
        for (const [invoiceLineId, returningQty] of returningByLine) {
          const invoiceLine = invoiceLineById.get(invoiceLineId);
          if (!invoiceLine) {
            throw new Error(
              `${docLabel}: original invoice line "${invoiceLineId}" not found on invoice "${creditNote.invoiceId}".`,
            );
          }
          const alreadyReturned = priorReturnedByLine.get(invoiceLineId) ?? 0;
          if (alreadyReturned + returningQty > invoiceLine.quantity + 1e-9) {
            throw new Error(
              `${docLabel}: return quantity ${returningQty} for invoice line "${invoiceLineId}" (already ${alreadyReturned} ` +
                `returned against that line) exceeds the ${invoiceLine.quantity} invoiced on that line.`,
            );
          }
        }

        // Legacy/no-line-link fallback: aggregate by product across the whole invoice.
        if (returningByProduct.size > 0) {
          const invoicedByProduct = new Map<ID, number>();
          for (const line of invoice.lineItems) {
            if (line.productId) {
              invoicedByProduct.set(line.productId, (invoicedByProduct.get(line.productId) ?? 0) + line.quantity);
            }
          }
          for (const [productId, returningQty] of returningByProduct) {
            const invoicedQty = invoicedByProduct.get(productId) ?? 0;
            const alreadyReturned = priorReturnedByProduct.get(productId) ?? 0;
            if (alreadyReturned + returningQty > invoicedQty + 1e-9) {
              throw new Error(
                `${docLabel}: return quantity ${returningQty} for product "${productId}" (already ${alreadyReturned} returned) ` +
                  `exceeds the ${invoicedQty} invoiced on invoice "${creditNote.invoiceId}".`,
              );
            }
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
