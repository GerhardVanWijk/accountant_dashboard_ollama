import type { ID, StockLot } from '@/types';
import type { IStockLotRepository } from '../repositories/IStockLotRepository';
import { stockLotRepository } from '../repositories/instances';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `stklot_${Math.random().toString(36).slice(2, 10)}`;
}

export interface CreateLotInput {
  productId: ID;
  warehouseId: ID;
  unitCost: number;
  quantity: number;
  receivedAt: string;
  sourceMovementId: ID;
}

interface LotConsumption {
  lotId: ID;
  remainingAfter: number;
}

/**
 * FIFO costing engine (SA_ACCOUNTING_MASTER_SPEC.md §23) — an alternative
 * to weighted-average cost for products with `valuationMethod: 'fifo'`.
 * Consumes `StockLot` records (src/types/stockLot.ts) oldest-received
 * first. `InventoryPostingAdapter` is the only caller — this stays
 * ignorant of GL posting, StockMovement, or Product entirely, mirroring
 * StockService's own narrow scope.
 */
export class StockLotService {
  constructor(private readonly repository: IStockLotRepository) {}

  /** Open (partially or fully unconsumed) lots for a product at one warehouse, oldest-received first. */
  async getOpenLots(productId: ID, warehouseId: ID): Promise<StockLot[]> {
    const all = await this.repository.getAll();
    return all
      .filter((l) => l.productId === productId && l.warehouseId === warehouseId && l.quantityRemaining > 0)
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.createdAt.localeCompare(b.createdAt));
  }

  /** Creates a new lot — stock coming IN (a receipt, or a customer return re-entering stock). */
  async createLot(input: CreateLotInput): Promise<StockLot> {
    if (input.quantity <= 0) {
      throw new Error('Stock lot quantity must be greater than zero.');
    }
    const now = nowISO();
    return this.repository.create({
      id: generateId(),
      productId: input.productId,
      warehouseId: input.warehouseId,
      unitCost: input.unitCost,
      quantityReceived: input.quantity,
      quantityRemaining: input.quantity,
      receivedAt: input.receivedAt,
      sourceMovementId: input.sourceMovementId,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Walks open lots oldest-first, allocating `quantity` across them and
   * summing the real cost — shared by previewFifoCost() (read-only) and
   * consumeFifoLots() (which actually applies the mutation). Throws if
   * open lots can't cover the full quantity — a real cost cannot be
   * computed from thin air, and posting a wrong/partial number would be
   * worse than failing the sale, matching this codebase's "don't guess"
   * principle (see splitDeductibleVat()'s conservative-default doc).
   */
  private async walkLots(
    productId: ID,
    warehouseId: ID,
    quantity: number,
  ): Promise<{ cost: number; consumptions: LotConsumption[] }> {
    if (quantity <= 0) return { cost: 0, consumptions: [] };

    const lots = await this.getOpenLots(productId, warehouseId);
    let stillNeeded = quantity;
    let cost = 0;
    const consumptions: LotConsumption[] = [];

    for (const lot of lots) {
      if (stillNeeded <= 0) break;
      const take = Math.min(lot.quantityRemaining, stillNeeded);
      cost += take * lot.unitCost;
      consumptions.push({ lotId: lot.id, remainingAfter: lot.quantityRemaining - take });
      stillNeeded -= take;
    }

    if (stillNeeded > 0) {
      throw new Error(
        `Insufficient FIFO lot quantity for product "${productId}" at warehouse "${warehouseId}": ` +
          `needed ${quantity}, only ${quantity - stillNeeded} available across open lots.`,
      );
    }

    return { cost, consumptions };
  }

  /**
   * Read-only dry run — the cost `quantity` units WOULD be sold at right
   * now under FIFO. Never mutates a lot. Used to preview Cost of Sales
   * before a GL entry posts (mirrors calculateCogs()'s WAC contract).
   */
  async previewFifoCost(productId: ID, warehouseId: ID, quantity: number): Promise<number> {
    const { cost } = await this.walkLots(productId, warehouseId, quantity);
    return cost;
  }

  /**
   * Actually consumes `quantity` units of open lots oldest-first,
   * decrementing `quantityRemaining`. Call ONLY after the GL entry it
   * contributes to has posted successfully, mirroring every other
   * stock-mutating method in this module. Returns the real cost consumed
   * — identical to what previewFifoCost() would have returned moments
   * earlier, since nothing else touches lot state in between within one
   * synchronous posting flow (this mock backend has no concurrent
   * writers — see docs/KNOWN_ISSUES.md's storage-layer-enforcement entry).
   */
  async consumeFifoLots(productId: ID, warehouseId: ID, quantity: number): Promise<number> {
    const { cost, consumptions } = await this.walkLots(productId, warehouseId, quantity);
    for (const c of consumptions) {
      await this.repository.update(c.lotId, { quantityRemaining: c.remainingAfter });
    }
    return cost;
  }
}

/** Singleton wired to Inventory's real shared repository (see ../repositories/instances.ts). */
export const stockLotService = new StockLotService(stockLotRepository);
