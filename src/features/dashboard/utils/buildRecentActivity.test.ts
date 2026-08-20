import { describe, expect, it } from 'vitest';
import type { Customer, Supplier, Product } from '@/types';
import { buildRecentActivity } from './buildRecentActivity';

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust_1',
    customerNumber: 'CUST-0001',
    name: 'Acme Trading Co.',
    currency: 'ZAR',
    balance: 0,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function supplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 'sup_1',
    supplierNumber: 'SUP-0001',
    name: 'Highveld Steel',
    currency: 'ZAR',
    balance: 0,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod_1',
    sku: 'TST-001',
    name: 'Test Widget',
    type: 'good',
    unitPrice: 100,
    costPrice: 40,
    trackInventory: true,
    quantityOnHand: 10,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildRecentActivity', () => {
  it('returns an empty array when there is no data at all', () => {
    expect(buildRecentActivity([], [], [])).toEqual([]);
  });

  it('maps each entity type to its own icon and title', () => {
    const result = buildRecentActivity([customer()], [supplier()], [product()]);
    expect(result).toHaveLength(3);
    expect(result.find((i) => i.id === 'customer_cust_1')).toMatchObject({ icon: 'customers', title: 'Acme Trading Co.' });
    expect(result.find((i) => i.id === 'supplier_sup_1')).toMatchObject({ icon: 'suppliers', title: 'Highveld Steel' });
    expect(result.find((i) => i.id === 'product_prod_1')).toMatchObject({ icon: 'products', title: 'Test Widget' });
  });

  it('sorts by most recently updated first', () => {
    const older = customer({ id: 'c_old', name: 'Older', updatedAt: '2026-01-01T00:00:00.000Z' });
    const newer = supplier({ id: 's_new', name: 'Newer', updatedAt: '2026-08-01T00:00:00.000Z' });
    const result = buildRecentActivity([older], [newer], []);
    expect(result[0].title).toBe('Newer');
    expect(result[1].title).toBe('Older');
  });

  it('respects the limit parameter', () => {
    const customers = Array.from({ length: 5 }, (_, i) => customer({ id: `c${i}`, name: `Customer ${i}` }));
    const result = buildRecentActivity(customers, [], [], 3);
    expect(result).toHaveLength(3);
  });

  it('describes an item as "new" when createdAt equals updatedAt, otherwise "updated"', () => {
    const created = customer({ id: 'c_new', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    const updated = customer({ id: 'c_upd', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' });
    const result = buildRecentActivity([created, updated], [], []);
    expect(result.find((i) => i.id === 'customer_c_new')?.description).toMatch(/added/i);
    expect(result.find((i) => i.id === 'customer_c_upd')?.description).toMatch(/updated/i);
  });
});
