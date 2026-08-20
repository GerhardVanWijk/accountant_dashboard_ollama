import { describe, expect, it } from 'vitest';
import { MockSupplierRepository } from './MockSupplierRepository';
import { SupplierService } from '../services/supplierService';

describe('MockSupplierRepository + SupplierService (repository pattern)', () => {
  it('lists seeded suppliers', async () => {
    const repo = new MockSupplierRepository();
    const suppliers = await repo.getAll();
    expect(suppliers.length).toBeGreaterThan(0);
  });

  it('getAll returns a copy — mutating the result never leaks into the store', async () => {
    const repo = new MockSupplierRepository();
    const first = await repo.getAll();
    first.pop();
    const second = await repo.getAll();
    expect(second.length).not.toBe(first.length);
  });

  it('getById finds a seeded supplier by id', async () => {
    const repo = new MockSupplierRepository();
    const all = await repo.getAll();
    const found = await repo.getById(all[0].id);
    expect(found?.id).toBe(all[0].id);
  });

  it('getById returns undefined for an unknown id', async () => {
    const repo = new MockSupplierRepository();
    const found = await repo.getById('sup_does_not_exist');
    expect(found).toBeUndefined();
  });

  it('creates, updates, and deletes a supplier through the service layer', async () => {
    const service = new SupplierService(new MockSupplierRepository());

    const created = await service.createSupplier({
      supplierNumber: 'SUP-9999',
      name: 'Test Supplier',
      currency: 'ZAR',
      balance: 0,
      status: 'active',
    });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe('Test Supplier');

    const updated = await service.updateSupplier(created.id, { name: 'Renamed Supplier' });
    expect(updated.name).toBe('Renamed Supplier');

    await service.deleteSupplier(created.id);
    const remaining = await service.getSupplier(created.id);
    expect(remaining).toBeUndefined();
  });

  it('update throws for an unknown supplier id', async () => {
    const repo = new MockSupplierRepository();
    await expect(repo.update('sup_does_not_exist', { name: 'x' })).rejects.toThrow();
  });

  it('refuses to hard-delete a supplier with linked open bills (accounts-payable guard)', async () => {
    // sup_00000001 (Highveld Steel) has mock open bills in calculateAging.ts.
    const service = new SupplierService(new MockSupplierRepository());
    await expect(service.deleteSupplier('sup_00000001')).rejects.toThrow(/linked financial history/i);

    const stillThere = await service.getSupplier('sup_00000001');
    expect(stillThere).toBeDefined();
  });

  it('allows setStatus and setOnHold to toggle a supplier without deleting it', async () => {
    const service = new SupplierService(new MockSupplierRepository());
    const inactivated = await service.setStatus('sup_00000001', 'inactive');
    expect(inactivated.status).toBe('inactive');

    const onHold = await service.setOnHold('sup_00000001', true);
    expect(onHold.onHold).toBe(true);
  });
});
