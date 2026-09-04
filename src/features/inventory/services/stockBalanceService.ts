import type { ID, StockBalance, StockMovement } from '@/types';
import type { IStockBalanceRepository } from '../repositories/IStockBalanceRepository';
import { stockBalanceRepository } from '../repositories/instances';
import {
  commitmentKey,
  stockCommitmentService,
  type StockCommitmentLookup,
} from './stockCommitmentService';

export interface ApplyStockDeltaInput {
  /**
   * Accepted for forward-compatibility with the multi-tenant
   * `stock_balances.company_id` column (migration 0026); the single-tenant
   * Supabase repo resolves "the" company itself and the Mock repo ignores
   * it, exactly as the other Phase-D repos do.
   */
  companyId?: ID;
  productId: ID;
  warehouseId: ID;
  /** Signed change to `quantityOnHand`. Positive = stock in, negative = stock out. */
  quantityDelta: number;
}

/**
 * A recomputed (product, warehouse) balance — the quantity fields of
 * `StockBalance` without the persistence envelope. What
 * `rebuildFromMovements` returns.
 */
export type StockBalanceSnapshot = Pick<
  StockBalance,
  'productId' | 'warehouseId' | 'quantityOnHand' | 'quantityCommitted' | 'quantityOnOrder'
>;

function balanceKey(productId: ID, warehouseId: ID): string {
  return `${productId}__${warehouseId}`;
}

/**
 * Maintains the per-(product, warehouse) balance cache (`stock_balances`,
 * fork D; migration 0026). The `stock_movements` ledger stays the SOURCE OF
 * TRUTH (see stockService.ts) — this service keeps a queryable cache in step
 * with it so the read path never has to sum the whole ledger, and
 * `rebuildFromMovements` lets an invariant test prove the cache matches the
 * ledger.
 *
 * Mirrors `warehouseService.ts`'s shape (class + singleton wired to a shared
 * repo instance, docs/ARCHITECTURE.md).
 */
export class StockBalanceService {
  constructor(
    private readonly repository: IStockBalanceRepository,
    /**
     * Derived stock commitment (Phase 5A) — `stock_balances.quantity_committed`
     * stays 0 in storage; `getAvailable` nets the real committed quantity here
     * on read. Defaults to the shared singleton; a test injects a fake.
     */
    private readonly commitmentSource: StockCommitmentLookup = stockCommitmentService,
  ) {}

  /** Every maintained balance row. */
  async getBalances(): Promise<StockBalance[]> {
    return this.repository.getAll();
  }

  /** The single balance row for one (product, warehouse), or `undefined` if none exists yet. */
  async getBalance(productId: ID, warehouseId: ID): Promise<StockBalance | undefined> {
    const balances = await this.repository.getAll();
    return balances.find((b) => b.productId === productId && b.warehouseId === warehouseId);
  }

  /** Every warehouse's balance row for one product. */
  async getBalancesForProduct(productId: ID): Promise<StockBalance[]> {
    const balances = await this.repository.getAll();
    return balances.filter((b) => b.productId === productId);
  }

  /**
   * Upserts the (product, warehouse) row, adding `quantityDelta` to
   * `quantityOnHand`. Called by the inventory posting layer in Phase 3
   * alongside every `stockService.recordStockMovement`; for now it just
   * maintains the cache. Negative resulting on-hand is allowed (an
   * over-committed adjustment is a real state) — never throws on sign.
   */
  async applyDelta(input: ApplyStockDeltaInput): Promise<StockBalance> {
    const existing = await this.getBalance(input.productId, input.warehouseId);
    if (existing) {
      return this.repository.update(existing.id, {
        quantityOnHand: existing.quantityOnHand + input.quantityDelta,
      });
    }
    const now = new Date().toISOString();
    return this.repository.create({
      id: '',
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantityOnHand: input.quantityDelta,
      quantityCommitted: 0,
      quantityOnOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Quantity Available = onHand − committed + onOrder. `onHand` / `onOrder`
   * come from the balance-cache row; `committed` is the DERIVED stock
   * commitment (Phase 5A, confirmed Sales Order lines for this
   * product + warehouse) — the row's own `quantityCommitted` is ignored
   * because it is always 0 in storage. Returns 0 when no balance row exists
   * yet for the pair.
   */
  async getAvailable(productId: ID, warehouseId: ID): Promise<number> {
    const balance = await this.getBalance(productId, warehouseId);
    if (!balance) return 0;
    const commitments = await this.commitmentSource.getCommitmentMap();
    const committed = commitments.get(commitmentKey(productId, warehouseId)) ?? 0;
    return balance.quantityOnHand - committed + balance.quantityOnOrder;
  }

  /**
   * Pure recompute of every (product, warehouse) balance from a movement
   * list, by summing `quantityDelta` per pair. Does NOT touch the
   * repository — the reconciliation invariant test compares this against
   * `getBalances()` to prove the maintained cache never drifts from the
   * ledger. `committed` / `onOrder` are 0 (not derivable from movements).
   */
  rebuildFromMovements(movements: StockMovement[]): StockBalanceSnapshot[] {
    const byKey = new Map<string, StockBalanceSnapshot>();
    for (const m of movements) {
      const key = balanceKey(m.productId, m.warehouseId);
      const existing = byKey.get(key);
      if (existing) {
        existing.quantityOnHand += m.quantityDelta;
      } else {
        byKey.set(key, {
          productId: m.productId,
          warehouseId: m.warehouseId,
          quantityOnHand: m.quantityDelta,
          quantityCommitted: 0,
          quantityOnOrder: 0,
        });
      }
    }
    return [...byKey.values()];
  }
}

/**
 * Singleton (Phase 3). Migration 0026 is applied and `stock_balances` is
 * backfilled from the movement ledger, so this is Supabase-backed via the
 * shared `stockBalanceRepository`.
 */
export const stockBalanceService = new StockBalanceService(stockBalanceRepository);
