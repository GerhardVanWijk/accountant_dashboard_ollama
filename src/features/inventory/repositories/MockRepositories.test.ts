import { describe, expect, it } from 'vitest';
import { MockProductRepository } from './MockProductRepository';
import { MockWarehouseRepository } from './MockWarehouseRepository';
import { MockStockMovementRepository } from './MockStockMovementRepository';

describe('MockProductRepository', () => {
  it('lists seeded products', async () => {
    const repo = new MockProductRepository();
    const products = await repo.getAll();
    expect(products.length).toBeGreaterThan(0);
  });

  it('creates, updates, and deletes a product', async () => {
    const repo = new MockProductRepository([]);

    const created = await repo.create({
      id: '',
      sku: 'NEW-001',
      name: 'New Product',
      type: 'good',
      unitPrice: 10,
      costPrice: 5,
      trackInventory: true,
      quantityOnHand: 0,
      status: 'active',
      createdAt: '',
      updatedAt: '',
    });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe('New Product');

    const updated = await repo.update(created.id, { name: 'Renamed Product' });
    expect(updated.name).toBe('Renamed Product');

    await repo.delete(created.id);
    await expect(repo.getById(created.id)).resolves.toBeUndefined();
  });

  it('does not leak mutations back into the shared seed array', async () => {
    const repoA = new MockProductRepository();
    const repoB = new MockProductRepository();
    const [first] = await repoA.getAll();

    await repoA.update(first.id, { name: 'Mutated in repoA only' });

    const [firstFromB] = await repoB.getAll();
    expect(firstFromB.name).not.toBe('Mutated in repoA only');
  });
});

describe('MockWarehouseRepository', () => {
  it('lists seeded warehouses', async () => {
    const repo = new MockWarehouseRepository();
    const warehouses = await repo.getAll();
    expect(warehouses.length).toBeGreaterThan(0);
  });

  it('creates, updates, and deletes a warehouse', async () => {
    const repo = new MockWarehouseRepository([]);

    const created = await repo.create({
      id: '',
      name: 'New Warehouse',
      code: 'NEW-WH',
      isDefault: false,
      status: 'active',
      createdAt: '',
      updatedAt: '',
    });
    expect(created.id).toBeTruthy();

    const updated = await repo.update(created.id, { status: 'inactive' });
    expect(updated.status).toBe('inactive');

    await repo.delete(created.id);
    await expect(repo.getById(created.id)).resolves.toBeUndefined();
  });
});

describe('MockStockMovementRepository', () => {
  it('lists seeded movements', async () => {
    const repo = new MockStockMovementRepository();
    const movements = await repo.getAll();
    expect(movements.length).toBeGreaterThan(0);
  });

  it('append-only: create() is the only write method exposed (no update/delete on the type)', async () => {
    const repo = new MockStockMovementRepository([]);
    expect('update' in repo).toBe(false);
    expect('delete' in repo).toBe(false);

    const created = await repo.create({
      id: '',
      productId: 'prod_x',
      warehouseId: 'wh_x',
      type: 'opening',
      quantityDelta: 10,
      createdAt: '',
      updatedAt: '',
    });
    expect(created.id).toBeTruthy();

    const all = await repo.getAll();
    expect(all).toHaveLength(1);
  });

  it('does not leak mutations back into the shared seed array', async () => {
    const repoA = new MockStockMovementRepository();
    const before = (await new MockStockMovementRepository().getAll()).length;

    await repoA.create({
      id: '',
      productId: 'prod_x',
      warehouseId: 'wh_x',
      type: 'adjustment',
      quantityDelta: -1,
      createdAt: '',
      updatedAt: '',
    });

    const repoB = new MockStockMovementRepository();
    expect((await repoB.getAll()).length).toBe(before);
  });
});
