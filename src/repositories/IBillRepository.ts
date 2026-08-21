import type { Bill } from '@/types';
import type { IRepository } from './IRepository';

/**
 * Bill-specific repository contract. Extends the generic IRepository
 * so it stays interchangeable with any future backend-backed
 * implementation (e.g. SupabaseBillRepository).
 */
export type IBillRepository = IRepository<Bill>;
