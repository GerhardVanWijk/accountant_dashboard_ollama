import type { ProductCategory } from '@/types';
import type { IRepository } from '@/repositories/IRepository';

/**
 * ProductCategory repository contract (fork B; migration 0024). Extends the
 * generic IRepository so the Mock and Supabase implementations stay
 * interchangeable, mirroring IProductRepository / IWarehouseRepository.
 */
export type IProductCategoryRepository = IRepository<ProductCategory>;
