import type { ID } from '@/types';
import type { RelatedPartySourceDocumentType } from '@/types/relatedParty';
import type { ResolvedSourceDocument, SourceDocumentLookup } from './relatedPartyTransactionService';

/** Narrow surfaces of each real document service this lookup composites — same "narrow interface" pattern every other cross-feature dependency in this codebase uses. */
export interface RealSourceDocumentLookupDeps {
  invoices: { getInvoice(id: ID): Promise<{ invoiceNumber: string; issueDate: string; total: number } | undefined> };
  bills: { getBill(id: ID): Promise<{ billNumber: string; issueDate: string; total: number } | undefined> };
  journalEntries: { getEntry(id: ID): Promise<{ entryNumber: string; date: string; lines: { debit: number; credit: number }[] } | undefined> };
  customerReceipts: { getReceipt(id: ID): Promise<{ receiptNumber: string; date: string; amount: number } | undefined> };
  payments: { getPayment(id: ID): Promise<{ paymentNumber: string; date: string; amount: number } | undefined> };
}

/**
 * Production `SourceDocumentLookup` — resolves a related-party
 * transaction's linked source across the five real, existing accounting
 * tables `RelatedPartySourceDocumentType` names (Tax & Compliance
 * integrity audit continuation, 2026-09-12, §10). A journal entry has no
 * single "amount" — its debit total (== credit total, since it balances)
 * is used, read off the first line's side that makes both sums agree, so
 * this never needs its own balancing logic duplicated from
 * JournalEntryService.
 */
export class RealSourceDocumentLookup implements SourceDocumentLookup {
  constructor(private readonly deps: RealSourceDocumentLookupDeps) {}

  async resolve(type: RelatedPartySourceDocumentType, id: ID): Promise<ResolvedSourceDocument | undefined> {
    switch (type) {
      case 'invoice': {
        const invoice = await this.deps.invoices.getInvoice(id);
        return invoice ? { amount: invoice.total, date: invoice.issueDate, reference: invoice.invoiceNumber } : undefined;
      }
      case 'bill': {
        const bill = await this.deps.bills.getBill(id);
        return bill ? { amount: bill.total, date: bill.issueDate, reference: bill.billNumber } : undefined;
      }
      case 'journal_entry': {
        const entry = await this.deps.journalEntries.getEntry(id);
        if (!entry) return undefined;
        const total = entry.lines.reduce((sum, line) => sum + line.debit, 0);
        return { amount: total, date: entry.date, reference: entry.entryNumber };
      }
      case 'customer_receipt': {
        const receipt = await this.deps.customerReceipts.getReceipt(id);
        return receipt ? { amount: receipt.amount, date: receipt.date, reference: receipt.receiptNumber } : undefined;
      }
      case 'payment': {
        const payment = await this.deps.payments.getPayment(id);
        return payment ? { amount: payment.amount, date: payment.date, reference: payment.paymentNumber } : undefined;
      }
    }
  }
}
