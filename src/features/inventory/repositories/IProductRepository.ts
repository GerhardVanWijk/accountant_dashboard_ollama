import type { Product } from '@/types';
import type { IRepository } from '@/repositories/IRepository';

/**
 * Product repository contract. Extends the generic IRepository so it stays
 * interchangeable with a future backend-backed implementation, mirroring
 * ICustomerRepository (src/repositories/ICustomerRepository.ts).
 */
export type IProductRepository = IRepository<Product>;
