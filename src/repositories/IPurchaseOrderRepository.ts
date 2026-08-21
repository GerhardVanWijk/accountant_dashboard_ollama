import type { PurchaseOrder } from '@/types';
import type { IRepository } from './IRepository';

/**
 * PurchaseOrder-specific repository contract. Extends the generic IRepository
 * so it stays interchangeable with any future backend-backed implementation.
 */
export type IPurchaseOrderRepository = IRepository<PurchaseOrder>;
