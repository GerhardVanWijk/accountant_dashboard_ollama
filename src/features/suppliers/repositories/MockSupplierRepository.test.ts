import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MockSupplierRepository } from './MockSupplierRepository';
import { SupplierService } from '../services/supplierService';
import { billService } from '@/features/purchases/services';
import type { Bill } from '@/types';

/**
 * SupplierService.deleteSupplier()'s accounts-payable guard reaches through
 * to the REAL, Supabase-backed `billService` singleton (Purchases module,
 * shipped after this Mock repository's own tests were first written) — not
 * a second, supplier-local copy of bill data. Mocking it here is required
 * for this to be a real unit test rather than an accidental live-network
 * integration test: the guard previously appeared to pass only because a
 * hardcoded Mock-era supplier id (`sup_00000004`) happened to still match a
 * seed row in `src/mock-data/bills.ts`, a dataset `billService` stopped
 * reading from once it moved to Supabase (M8) — the live database has no
 * bill for that non-UUID id, so the guard silently found nothing to block
 * and the delete went through, which is what M11's inspection traced this
 * to (a stale test fixture, not a business-logic bug: the guard's own
 * logic — block delete whenever real open bills exist — is correct and
 * unchanged; it's exercised directly below instead of depending on
 * whatever real data happens to exist in Supabase today, which the
 * original test silently did and which would only get more fragile as
 * real data changes).
 */
vi.mock('@/features/purchases/services', () => ({
  billService: { getBillsBySupplier: vi.fn() },
}));

const mockedGetBillsBySupplier = vi.mocked(billService.getBillsBySupplier);

function makeOpenBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill_1',
    billNumber: 'BILL-0001',
    supplierId: 'sup_00000004',
    issueDate: '2026-07-01',
    dueDate: '2026-07-31',
    lineItems: [],
    subtotal: 1000,
    taxTotal: 150,
    total: 1150,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'awaiting_payment',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('MockSupplierRepository + SupplierService (repository pattern)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no linked bills, so delete-related tests unrelated to the
    // guard itself aren't accidentally blocked by a leftover mock return value.
    mockedGetBillsBySupplier.mockResolvedValue([]);
  });

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
    mockedGetBillsBySupplier.mockResolvedValue([makeOpenBill()]);

    const service = new SupplierService(new MockSupplierRepository());
    await expect(service.deleteSupplier('sup_00000004')).rejects.toThrow(/linked financial history/i);
    expect(mockedGetBillsBySupplier).toHaveBeenCalledWith('sup_00000004');

    const stillThere = await service.getSupplier('sup_00000004');
    expect(stillThere).toBeDefined();
  });

  it('allows deleting a supplier once its only bill is fully paid (not just present)', async () => {
    mockedGetBillsBySupplier.mockResolvedValue([makeOpenBill({ status: 'paid', amountPaid: 1150 })]);

    const service = new SupplierService(new MockSupplierRepository());
    await expect(service.deleteSupplier('sup_00000004')).resolves.toBeUndefined();
  });

  it('allows setStatus and setOnHold to toggle a supplier without deleting it', async () => {
    const service = new SupplierService(new MockSupplierRepository());
    const inactivated = await service.setStatus('sup_00000001', 'inactive');
    expect(inactivated.status).toBe('inactive');

    const onHold = await service.setOnHold('sup_00000001', true);
    expect(onHold.onHold).toBe(true);
  });
});
