import type { Invoice } from '@/types';
import type { IRepository } from './IRepository';

/**
 * Invoice-specific repository contract. Extends the generic IRepository
 * so it stays interchangeable with any future backend-backed implementation.
 */
export type IInvoiceRepository = IRepository<Invoice>;
