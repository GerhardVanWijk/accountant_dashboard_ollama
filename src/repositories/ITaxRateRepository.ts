import type { TaxRate } from '@/types';
import type { IRepository } from './IRepository';

/**
 * TaxRate-specific repository contract. Shared cross-cutting entity (like
 * Customer/Invoice), not owned by one feature — Sales, Purchases,
 * Banking, and Inventory all reference `TaxRate` records.
 */
export type ITaxRateRepository = IRepository<TaxRate>;
