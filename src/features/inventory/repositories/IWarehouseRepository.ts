import type { Warehouse } from '@/types';
import type { IRepository } from '@/repositories/IRepository';

/** Warehouse repository contract — see IProductRepository.ts for the pattern. */
export type IWarehouseRepository = IRepository<Warehouse>;
