import { describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/types';

vi.mock('@/features/customers/utils/calculateAging', () => ({
  calculateAgingForCustomer: vi.fn(),
}));

import { calculateAgingForCustomer } from '@/features/customers/utils/calculateAging';
import { calculateArAgingForCustomers } from './calculateArAging';

const mockedCalculateAgingForCustomer = vi.mocked(calculateAgingForCustomer);

function customer(id: string): Customer {
  return {
    id,
    customerNumber: `CUST-${id}`,
    name: `Customer ${id}`,
    currency: 'ZAR',
    balance: 0,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('calculateArAgingForCustomers', () => {
  it('returns all-zero buckets for an empty customer list', () => {
    expect(calculateArAgingForCustomers([])).toEqual({
      current: 0,
      bucket30: 0,
      bucket60: 0,
      bucket90Plus: 0,
      total: 0,
    });
    expect(mockedCalculateAgingForCustomer).not.toHaveBeenCalled();
  });

  it('sums each customer bucket into the fleet-wide total, normalizing bucket key names', () => {
    mockedCalculateAgingForCustomer.mockImplementation((id) => {
      if (id === 'c1') return { current: 100, days1to30: 50, days31to60: 20, days61Plus: 10, total: 180 };
      return { current: 200, days1to30: 0, days31to60: 5, days61Plus: 15, total: 220 };
    });

    const result = calculateArAgingForCustomers([customer('c1'), customer('c2')]);

    expect(result).toEqual({ current: 300, bucket30: 50, bucket60: 25, bucket90Plus: 25, total: 400 });
    expect(mockedCalculateAgingForCustomer).toHaveBeenCalledTimes(2);
  });
});
