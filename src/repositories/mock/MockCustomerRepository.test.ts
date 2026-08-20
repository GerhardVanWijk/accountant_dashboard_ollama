import { describe, expect, it } from 'vitest';
import { MockCustomerRepository } from './MockCustomerRepository';
import { CustomerService } from '@/services/customerService';

describe('MockCustomerRepository + CustomerService (repository pattern smoke test)', () => {
  it('lists seeded customers', async () => {
    const repo = new MockCustomerRepository();
    const customers = await repo.getAll();
    expect(customers.length).toBeGreaterThan(0);
  });

  it('creates, updates, and deletes a customer through the service layer', async () => {
    const service = new CustomerService(new MockCustomerRepository());

    const created = await service.createCustomer({
      customerNumber: 'CUST-9999',
      name: 'Test Customer',
      currency: 'USD',
      balance: 0,
      status: 'active',
    });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe('Test Customer');

    const updated = await service.updateCustomer(created.id, { name: 'Renamed Customer' });
    expect(updated.name).toBe('Renamed Customer');

    await service.deleteCustomer(created.id);
    const remaining = await service.getCustomer(created.id);
    expect(remaining).toBeUndefined();
  });

  it('inactivates and reactivates a customer without deleting it (never hard-delete)', async () => {
    const service = new CustomerService(new MockCustomerRepository());

    const created = await service.createCustomer({
      customerNumber: 'CUST-9998',
      name: 'Hold Test Customer',
      currency: 'ZAR',
      balance: 0,
      status: 'active',
    });

    const inactivated = await service.inactivateCustomer(created.id);
    expect(inactivated.status).toBe('inactive');

    const reactivated = await service.activateCustomer(created.id);
    expect(reactivated.status).toBe('active');

    // still present — inactivating never removes the record
    const stillThere = await service.getCustomer(created.id);
    expect(stillThere).toBeDefined();
  });

  it('toggles credit hold', async () => {
    const service = new CustomerService(new MockCustomerRepository());
    const created = await service.createCustomer({
      customerNumber: 'CUST-9997',
      name: 'Credit Hold Test Customer',
      currency: 'ZAR',
      balance: 0,
      status: 'active',
    });

    const held = await service.setCreditHold(created.id, true);
    expect(held.creditHold).toBe(true);

    const released = await service.setCreditHold(created.id, false);
    expect(released.creditHold).toBe(false);
  });
});
