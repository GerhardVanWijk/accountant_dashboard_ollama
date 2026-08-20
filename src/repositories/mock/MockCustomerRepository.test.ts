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
});
