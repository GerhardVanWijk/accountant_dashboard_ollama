import { describe, it, expect, beforeEach } from 'vitest';
import { QuoteService } from './quoteService';
import { MockQuoteRepository } from '@/repositories/mock/MockQuoteRepository';
import { MockSalesOrderRepository } from '@/repositories/mock/MockSalesOrderRepository';
import { seedQuotes } from '@/mock-data/quotes';

describe('QuoteService', () => {
  let quoteService: QuoteService;
  let quoteRepository: MockQuoteRepository;
  let salesOrderRepository: MockSalesOrderRepository;

  beforeEach(() => {
    quoteRepository = new MockQuoteRepository();
    salesOrderRepository = new MockSalesOrderRepository([]);
    quoteService = new QuoteService(quoteRepository, salesOrderRepository);
  });

  describe('getQuotes', () => {
    it('should return all quotes', async () => {
      const quotes = await quoteService.getQuotes();
      expect(quotes.length).toBe(seedQuotes.length);
    });
  });

  describe('createQuote', () => {
    it('should create a new quote', async () => {
      const quote = await quoteService.createQuote({
        quoteNumber: 'QUO-2026-TEST',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        expiryDate: '2026-09-20T00:00:00.000Z',
        lineItems: [],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        currency: 'ZAR',
        status: 'draft',
      });

      expect(quote.id).toBeDefined();
      expect(quote.status).toBe('draft');
    });
  });

  describe('lifecycle transitions', () => {
    it('sends a draft quote', async () => {
      const draft = await quoteService.createQuote({
        quoteNumber: 'QUO-2026-TEST-2',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        expiryDate: '2026-09-20T00:00:00.000Z',
        lineItems: [],
        subtotal: 100,
        taxTotal: 15,
        total: 115,
        currency: 'ZAR',
        status: 'draft',
      });

      const sent = await quoteService.markAsSent(draft.id);
      expect(sent.status).toBe('sent');
    });

    it('rejects sending a quote that is not draft', async () => {
      const quotes = await quoteService.getQuotes();
      const nonDraft = quotes.find((q) => q.status !== 'draft')!;
      await expect(quoteService.markAsSent(nonDraft.id)).rejects.toThrow(/draft/i);
    });

    it('accepts a sent quote', async () => {
      const quotes = await quoteService.getQuotes();
      const sentQuote = quotes.find((q) => q.status === 'sent')!;
      const accepted = await quoteService.markAsAccepted(sentQuote.id);
      expect(accepted.status).toBe('accepted');
    });

    it('declines a sent quote', async () => {
      const quotes = await quoteService.getQuotes();
      const sentQuote = quotes.find((q) => q.status === 'sent')!;
      const declined = await quoteService.markAsDeclined(sentQuote.id);
      expect(declined.status).toBe('declined');
    });
  });

  describe('convertToSalesOrder', () => {
    it('creates a sales order carrying over totals and quoteId', async () => {
      const quotes = await quoteService.getQuotes();
      const accepted = quotes.find((q) => q.status === 'accepted')!;

      const order = await quoteService.convertToSalesOrder(accepted.id);

      expect(order.id).toBeDefined();
      expect(order.quoteId).toBe(accepted.id);
      expect(order.customerId).toBe(accepted.customerId);
      expect(order.total).toBe(accepted.total);
      expect(order.subtotal).toBe(accepted.subtotal);
      expect(order.status).toBe('pending');

      const persisted = await salesOrderRepository.getById(order.id);
      expect(persisted).toBeDefined();
    });

    it('rejects converting a quote that is not accepted', async () => {
      const quotes = await quoteService.getQuotes();
      const draftQuote = quotes.find((q) => q.status === 'draft')!;
      await expect(quoteService.convertToSalesOrder(draftQuote.id)).rejects.toThrow(/accepted/i);
    });
  });

  describe('getQuotesByCustomer', () => {
    it('filters by customer', async () => {
      const quotes = await quoteService.getQuotes();
      const customerId = quotes[0].customerId;
      const filtered = await quoteService.getQuotesByCustomer(customerId);
      expect(filtered.every((q) => q.customerId === customerId)).toBe(true);
    });
  });

  describe('searchQuotes', () => {
    it('finds a quote by number', async () => {
      const quotes = await quoteService.getQuotes();
      const results = await quoteService.searchQuotes(quotes[0].quoteNumber);
      expect(results.some((q) => q.id === quotes[0].id)).toBe(true);
    });
  });
});
