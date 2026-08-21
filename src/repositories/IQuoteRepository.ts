import type { Quote } from '@/types';
import type { IRepository } from './IRepository';

/**
 * Quote-specific repository contract. Extends the generic IRepository
 * so it stays interchangeable with any future backend-backed implementation.
 */
export type IQuoteRepository = IRepository<Quote>;
