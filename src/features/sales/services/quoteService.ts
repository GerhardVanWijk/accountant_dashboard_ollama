import type { Quote, SalesOrder } from '@/types';
import type { IQuoteRepository } from '@/repositories/IQuoteRepository';
import type { ISalesOrderRepository } from '@/repositories/ISalesOrderRepository';

export type CreateQuoteDTO = Omit<Quote, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Business-logic layer for Quotes. Quotes are pre-accounting commitment
 * documents (same treatment as Purchase Orders on the other side) — NO
 * journal entry is ever posted for a Quote, see docs/LEDGER_ARCHITECTURE.md.
 */
export class QuoteService {
  constructor(
    private readonly repository: IQuoteRepository,
    private readonly salesOrderRepository: ISalesOrderRepository,
  ) {}

  async getQuotes(): Promise<Quote[]> {
    return this.repository.getAll();
  }

  async getQuote(id: string): Promise<Quote | undefined> {
    return this.repository.getById(id);
  }

  async createQuote(data: CreateQuoteDTO): Promise<Quote> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateQuote(id: string, patch: Partial<Quote>): Promise<Quote> {
    return this.repository.update(id, patch);
  }

  async deleteQuote(id: string): Promise<void> {
    return this.repository.delete(id);
  }

  /** Sends a quote to the customer. Transitions 'draft' -> 'sent'. */
  async markAsSent(id: string): Promise<Quote> {
    const quote = await this.requireQuote(id);
    if (quote.status !== 'draft') {
      throw new Error(`Cannot send quote "${id}": only a draft quote can be sent (current status: ${quote.status}).`);
    }
    return this.repository.update(id, { status: 'sent' });
  }

  /** Records the customer accepting the quote. Transitions 'sent' -> 'accepted'. */
  async markAsAccepted(id: string): Promise<Quote> {
    const quote = await this.requireQuote(id);
    if (quote.status !== 'sent') {
      throw new Error(
        `Cannot accept quote "${id}": only a sent quote can be accepted (current status: ${quote.status}).`,
      );
    }
    return this.repository.update(id, { status: 'accepted' });
  }

  /** Records the customer declining the quote. Transitions 'sent' -> 'declined'. */
  async markAsDeclined(id: string): Promise<Quote> {
    const quote = await this.requireQuote(id);
    if (quote.status !== 'sent') {
      throw new Error(
        `Cannot decline quote "${id}": only a sent quote can be declined (current status: ${quote.status}).`,
      );
    }
    return this.repository.update(id, { status: 'declined' });
  }

  /** Marks a quote as expired (typically called once expiryDate has passed). */
  async markAsExpired(id: string): Promise<Quote> {
    return this.repository.update(id, { status: 'expired' });
  }

  /**
   * Converts an accepted Quote into a new Sales Order, carrying over the
   * customer, line items, and totals, and setting
   * `salesOrder.quoteId = quote.id`. Requires the quote to be 'accepted' —
   * no GL posting is involved (Sales Orders never post, see class doc).
   */
  async convertToSalesOrder(quoteId: string): Promise<SalesOrder> {
    const quote = await this.requireQuote(quoteId);
    if (quote.status !== 'accepted') {
      throw new Error(
        `Cannot convert quote "${quoteId}" to a sales order: quote must be 'accepted' (current status: ${quote.status}).`,
      );
    }

    const orderNumber = quote.quoteNumber.startsWith('QUO-')
      ? quote.quoteNumber.replace('QUO-', 'SO-')
      : `SO-${Date.now()}`;

    return this.salesOrderRepository.create({
      id: '',
      orderNumber,
      customerId: quote.customerId,
      quoteId: quote.id,
      orderDate: new Date().toISOString(),
      lineItems: quote.lineItems,
      subtotal: quote.subtotal,
      taxTotal: quote.taxTotal,
      total: quote.total,
      currency: quote.currency,
      status: 'pending',
      notes: `Converted from ${quote.quoteNumber}`,
      createdAt: '',
      updatedAt: '',
    });
  }

  /** Get quotes for a specific customer. */
  async getQuotesByCustomer(customerId: string): Promise<Quote[]> {
    const all = await this.repository.getAll();
    return all.filter((q) => q.customerId === customerId);
  }

  /** Get quotes filtered by status. */
  async getQuotesByStatus(status: Quote['status']): Promise<Quote[]> {
    const all = await this.repository.getAll();
    return all.filter((q) => q.status === status);
  }

  /** Search quotes by quote number or customer ID. */
  async searchQuotes(query: string): Promise<Quote[]> {
    const all = await this.repository.getAll();
    const lowerQuery = query.toLowerCase();
    return all.filter(
      (q) =>
        q.quoteNumber.toLowerCase().includes(lowerQuery) || q.customerId.toLowerCase().includes(lowerQuery),
    );
  }

  private async requireQuote(id: string): Promise<Quote> {
    const quote = await this.repository.getById(id);
    if (!quote) {
      throw new Error(`Quote "${id}" not found`);
    }
    return quote;
  }
}
