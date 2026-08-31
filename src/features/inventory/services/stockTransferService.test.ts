import { describe, it, expect, beforeEach } from 'vitest';
import { StockTransferService, type CreateStockTransferDTO } from './stockTransferService';
import { MockStockTransferRepository } from '../repositories/MockStockTransferRepository';
import type { StockTransferLine } from '@/types';
import { makePostingTestKit, makeProduct } from './inventoryPostingEngine.testkit';

function line(overrides: Partial<StockTransferLine> = {}): StockTransferLine {
  const quantity = overrides.quantity ?? 4;
  const unitCost = overrides.unitCost ?? 100;
  return {
    id: overrides.id ?? 'stl_1',
    transferId: overrides.transferId ?? 'trf_1',
    productId: overrides.productId ?? 'prod_1',
    quantity,
    unitCost,
    totalCost: overrides.totalCost ?? quantity * unitCost,
  };
}

function makeTransfer(overrides: Partial<CreateStockTransferDTO> = {}): CreateStockTransferDTO {
  return {
    fromWarehouseId: 'wh_00000001',
    toWarehouseId: 'wh_00000002',
    transferDate: '2026-06-01',
    expectedReceiptDate: '2026-06-05',
    notes: 'Rebalancing stock',
    lineItems: [line({ id: 'stl_1' }), line({ id: 'stl_2', quantity: 2, unitCost: 100 })],
    ...overrides,
  };
}

describe('StockTransferService', () => {
  let service: StockTransferService;
  let repository: MockStockTransferRepository;

  beforeEach(() => {
    repository = new MockStockTransferRepository([]);
    service = new StockTransferService(repository);
  });

  describe('createTransfer', () => {
    it('creates a draft with a generated number and recomputed totalCost', async () => {
      const transfer = await service.createTransfer(makeTransfer());
      expect(transfer.status).toBe('draft');
      expect(transfer.transferNumber).toBe('TRF-0001');
      expect(transfer.totalCost).toBe(600);
      expect(transfer.dispatchedJournalEntryId).toBeUndefined();
      expect(transfer.receivedJournalEntryId).toBeUndefined();
    });

    it('rejects a transfer whose from and to warehouse are the same', async () => {
      await expect(
        service.createTransfer(makeTransfer({ fromWarehouseId: 'wh_x', toWarehouseId: 'wh_x' })),
      ).rejects.toThrow(/different warehouses/i);
    });

    it('assigns sequential transfer numbers', async () => {
      const first = await service.createTransfer(makeTransfer());
      const second = await service.createTransfer(makeTransfer());
      expect(first.transferNumber).toBe('TRF-0001');
      expect(second.transferNumber).toBe('TRF-0002');
    });
  });

  describe('updateTransfer', () => {
    it('edits a draft and recomputes totalCost from the new lines', async () => {
      const transfer = await service.createTransfer(makeTransfer());
      const updated = await service.updateTransfer(transfer.id, {
        lineItems: [line({ id: 'stl_1', quantity: 1, unitCost: 250, totalCost: 250 })],
      });
      expect(updated.totalCost).toBe(250);
    });

    it('rejects an edit once dispatched', async () => {
      const transfer = await service.createTransfer(makeTransfer());
      await service.dispatch(transfer.id);
      await expect(service.updateTransfer(transfer.id, { notes: 'nope' })).rejects.toThrow(/only a draft/i);
    });

    it('rejects an edit that would make from === to', async () => {
      const transfer = await service.createTransfer(makeTransfer());
      await expect(
        service.updateTransfer(transfer.id, { toWarehouseId: 'wh_00000001' }),
      ).rejects.toThrow(/different warehouses/i);
    });
  });

  describe('deleteTransfer', () => {
    it('deletes a draft', async () => {
      const transfer = await service.createTransfer(makeTransfer());
      await service.deleteTransfer(transfer.id);
      expect(await service.getTransfer(transfer.id)).toBeUndefined();
    });

    it('rejects deleting a dispatched transfer', async () => {
      const transfer = await service.createTransfer(makeTransfer());
      await service.dispatch(transfer.id);
      await expect(service.deleteTransfer(transfer.id)).rejects.toThrow(/only a draft/i);
    });
  });

  describe('dispatch / receive lifecycle', () => {
    it('walks draft → in_transit → completed and stamps receivedDate', async () => {
      const transfer = await service.createTransfer(makeTransfer());

      const dispatched = await service.dispatch(transfer.id);
      expect(dispatched.status).toBe('in_transit');
      expect(dispatched.receivedDate).toBeUndefined();

      const received = await service.receive(transfer.id);
      expect(received.status).toBe('completed');
      expect(received.receivedDate).toBeDefined();
    });

    it('rejects dispatching anything that is not a draft', async () => {
      const transfer = await service.createTransfer(makeTransfer());
      await service.dispatch(transfer.id);
      await expect(service.dispatch(transfer.id)).rejects.toThrow(/expected a draft transfer/i);
    });

    it('rejects receiving a transfer that was never dispatched', async () => {
      const transfer = await service.createTransfer(makeTransfer());
      await expect(service.receive(transfer.id)).rejects.toThrow(/expected an in-transit transfer/i);
    });
  });

  describe('cancelTransfer', () => {
    it('cancels from draft and from in_transit, but not from completed', async () => {
      const draftTransfer = await service.createTransfer(makeTransfer());
      expect((await service.cancelTransfer(draftTransfer.id)).status).toBe('cancelled');

      const inTransit = await service.createTransfer(makeTransfer());
      await service.dispatch(inTransit.id);
      expect((await service.cancelTransfer(inTransit.id)).status).toBe('cancelled');

      const completed = await service.createTransfer(makeTransfer());
      await service.dispatch(completed.id);
      await service.receive(completed.id);
      await expect(service.cancelTransfer(completed.id)).rejects.toThrow(/only a draft or in-transit/i);
    });

    it('throws for an unknown id', async () => {
      await expect(service.cancelTransfer('missing')).rejects.toThrow(/not found/i);
    });
  });

  describe('Phase 3 — GL posting via the inventory posting engine', () => {
    const A = 'wh_00000001';
    const B = 'wh_00000002';
    let kit: ReturnType<typeof makePostingTestKit>;
    let posting: StockTransferService;

    beforeEach(() => {
      kit = makePostingTestKit();
      posting = new StockTransferService(repository, kit.engine, kit.resolver, kit.products);
      kit.seed(makeProduct({ id: 'prod_1' }), { quantityOnHand: 20, costPrice: 3, warehouseId: A });
    });

    it('completeImmediate: GL-neutral, company qty unchanged, per-warehouse balances move', async () => {
      const transfer = await posting.createTransfer(makeTransfer()); // 4 + 2 of prod_1
      const done = await posting.completeImmediate(transfer.id);

      expect(done.status).toBe('completed');
      expect(done.receivedDate).toBeDefined();
      expect(kit.store.journalEntries).toHaveLength(0);
      expect(kit.store.products.get('prod_1')!.quantityOnHand).toBe(20);
      expect(kit.store.balance('prod_1', A)).toBe(14);
      expect(kit.store.balance('prod_1', B)).toBe(6);
      expect(kit.store.movements.map((m) => m.type).sort()).toEqual(['transfer_in', 'transfer_in', 'transfer_out', 'transfer_out']);
    });

    it('dispatch posts DR 1210 / CR 1200; receive posts the reverse; company qty unchanged', async () => {
      const transfer = await posting.createTransfer(makeTransfer());

      const dispatched = await posting.dispatch(transfer.id);
      expect(dispatched.status).toBe('in_transit');
      expect(dispatched.dispatchedJournalEntryId).toBeDefined();
      const jeD = kit.store.journalEntries[0];
      expect(jeD.lines.find((l) => l.accountId === 'acc-INVENTORY_IN_TRANSIT')).toEqual({ accountId: 'acc-INVENTORY_IN_TRANSIT', debit: 18, credit: 0 });
      expect(jeD.lines.find((l) => l.accountId === 'acc-INVENTORY')).toEqual({ accountId: 'acc-INVENTORY', debit: 0, credit: 18 });

      const received = await posting.receive(transfer.id);
      expect(received.status).toBe('completed');
      expect(received.receivedJournalEntryId).toBeDefined();
      const jeR = kit.store.journalEntries[1];
      expect(jeR.lines.find((l) => l.accountId === 'acc-INVENTORY')).toEqual({ accountId: 'acc-INVENTORY', debit: 18, credit: 0 });
      expect(jeR.lines.find((l) => l.accountId === 'acc-INVENTORY_IN_TRANSIT')).toEqual({ accountId: 'acc-INVENTORY_IN_TRANSIT', debit: 0, credit: 18 });

      expect(kit.store.products.get('prod_1')!.quantityOnHand).toBe(20);
      expect(kit.store.balance('prod_1', A)).toBe(14);
      expect(kit.store.balance('prod_1', B)).toBe(6);
    });

    it('cannot receive before dispatch, and cannot dispatch twice', async () => {
      const transfer = await posting.createTransfer(makeTransfer());
      await expect(posting.receive(transfer.id)).rejects.toThrow(/in-transit/i);
      await posting.dispatch(transfer.id);
      await expect(posting.dispatch(transfer.id)).rejects.toThrow(/expected a draft transfer/i);
      expect(kit.store.journalEntries).toHaveLength(1); // only the one dispatch entry
    });

    it('dispatch is idempotent at the engine on stock_transfer:<id>:dispatch', async () => {
      const transfer = await posting.createTransfer(makeTransfer());
      await posting.dispatch(transfer.id);
      const again = await kit.engine.applyInventoryTransaction({
        postingKey: `stock_transfer:${transfer.id}:dispatch`,
        sourceType: 'stock_transfer',
        sourceId: transfer.id,
        movementDate: '2026-06-01',
        createdBy: 'system',
        lines: [{ productId: 'prod_1', warehouseId: A, quantityDelta: -6, costingMode: 'transfer_out', inventoryAccountId: 'acc-INVENTORY', contraAccountId: 'acc-INVENTORY_IN_TRANSIT' }],
      });
      expect(again.idempotent).toBe(true);
      expect(kit.store.journalEntries).toHaveLength(1);
      expect(kit.store.movements.filter((m) => m.type === 'transfer_out')).toHaveLength(2);
    });
  });
});
