import type { CustomerReceipt } from '@/types';
import type { IRepository } from './IRepository';

/**
 * CustomerReceipt-specific repository contract. Extends the generic
 * IRepository so it stays interchangeable with any future backend-backed
 * implementation.
 */
export type ICustomerReceiptRepository = IRepository<CustomerReceipt>;
