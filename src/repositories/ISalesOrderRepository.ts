import type { SalesOrder } from '@/types';
import type { IRepository } from './IRepository';

/**
 * SalesOrder-specific repository contract. Extends the generic IRepository
 * so it stays interchangeable with any future backend-backed implementation.
 */
export type ISalesOrderRepository = IRepository<SalesOrder>;
