import { describe, expect, it, vi } from 'vitest';
import { MockCustomerRepository } from './MockCustomerRepository';
import { CustomerService } from '@/services/customerService';

/**
 * `CustomerService.deleteCustomer()` calls the shared `invoiceService`
 * singleton (`@/services/index`), which is wired to the LIVE-connected
 * `SupabaseInvoiceRepository`. Without this mock, `deleteCustomer()` in the
 * test below issues a real `invoices` query against production every run
 * (it passed only because the throwaway test customer happens to have no
 * invoices there). The fail-closed Supabase guard (tests/setup.ts,
 * docs/TESTING_SUPABASE.md) surfaced this; stub the boundary the same way
 * every other service test does.
 */
vi.mock('@/services/index', () => ({
  invoiceService: { getInvoicesByCustomer: vi.fn().mockResolvedValue([]) },
}));

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
