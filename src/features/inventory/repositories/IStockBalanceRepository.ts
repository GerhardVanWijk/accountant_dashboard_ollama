import type { StockBalance } from '@/types';
import type { IRepository } from '@/repositories/IRepository';

/**
 * StockBalance repository contract (fork D; migration 0026) — the
 * per-(product, warehouse) balance cache. Extends the generic IRepository so
 * the Mock and Supabase implementations stay interchangeable, mirroring
 * IStockMovementRepository / IWarehouseRepository.
 */
export type IStockBalanceRepository = IRepository<StockBalance>;
