import type { Quote } from '@/types';
import { seedQuotes } from '@/mock-data/quotes';
import type { IQuoteRepository } from '../IQuoteRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `quo_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of IQuoteRepository.
 * Stores quotes in memory with CRUD operations following the repository pattern.
 */
export class MockQuoteRepository implements IQuoteRepository {
  private quotes: Quote[];

  constructor(initialData: Quote[] = seedQuotes) {
    // Copy so mutations never leak into the shared seed array.
    this.quotes = initialData.map((q) => ({ ...q }));
  }

  async getAll(): Promise<Quote[]> {
    return [...this.quotes];
  }

  async getById(id: string): Promise<Quote | undefined> {
    return this.quotes.find((q) => q.id === id);
  }

  async create(entity: Quote): Promise<Quote> {
    const record: Quote = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.quotes.push(record);
    return record;
  }

  async update(id: string, patch: Partial<Quote>): Promise<Quote> {
    const index = this.quotes.findIndex((q) => q.id === id);
    if (index === -1) {
      throw new Error(`MockQuoteRepository: quote "${id}" not found`);
    }
    const updated: Quote = {
      ...this.quotes[index],
      ...patch,
      id: this.quotes[index].id,
      updatedAt: nowISO(),
    };
    this.quotes[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.quotes = this.quotes.filter((q) => q.id !== id);
  }
}
