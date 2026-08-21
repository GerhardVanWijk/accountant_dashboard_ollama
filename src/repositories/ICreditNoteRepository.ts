import type { CreditNote } from '@/types';
import type { IRepository } from './IRepository';

/**
 * CreditNote-specific repository contract. Extends the generic IRepository
 * so it stays interchangeable with any future backend-backed implementation.
 */
export type ICreditNoteRepository = IRepository<CreditNote>;
