import type { Payment } from '@/types';
import type { IRepository } from './IRepository';

/**
 * Payment-specific repository contract. Extends the generic IRepository
 * so it stays interchangeable with any future backend-backed
 * implementation (e.g. SupabasePaymentRepository). Mirrors IBillRepository.
 */
export type IPaymentRepository = IRepository<Payment>;
