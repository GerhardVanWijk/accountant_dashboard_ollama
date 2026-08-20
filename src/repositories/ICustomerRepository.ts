import type { Customer } from '@/types';
import type { IRepository } from './IRepository';

/**
 * Customer-specific repository contract. Extends the generic IRepository
 * so it stays interchangeable with any future backend-backed
 * implementation (e.g. src/repositories/supabase/SupabaseCustomerRepository.ts).
 */
export type ICustomerRepository = IRepository<Customer>;
