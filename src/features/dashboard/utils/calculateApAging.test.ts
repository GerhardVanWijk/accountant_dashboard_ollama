import { describe, expect, it, vi } from 'vitest';
import type { Supplier } from '@/types';

vi.mock('@/features/suppliers/utils/calculateAging', () => ({
  calculateAging: vi.fn(),
}));

import { calculateAging } from '@/features/suppliers/utils/calculateAging';
import { calculateApAgingForSuppliers } from './calculateApAging';

const mockedCalculateAging = vi.mocked(calculateAging);

function supplier(id: string): Supplier {
  return {
    id,
    supplierNumber: `SUP-${id}`,
    name: `Supplier ${id}`,
    currency: 'ZAR',
    balance: 0,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('calculateApAgingForSuppliers', () => {
  it('returns all-zero buckets for an empty supplier list', () => {
    expect(calculateApAgingForSuppliers([])).toEqual({
      current: 0,
      bucket30: 0,
      bucket60: 0,
      bucket90Plus: 0,
      total: 0,
    });
    expect(mockedCalculateAging).not.toHaveBeenCalled();
  });

  it('sums each supplier bucket into the fleet-wide total, normalizing bucket key names', () => {
    mockedCalculateAging.mockImplementation((id) => {
      if (id === 's1') return { current: 300, days30: 40, days60: 0, days90Plus: 10, total: 350 };
      return { current: 100, days30: 0, days60: 25, days90Plus: 5, total: 130 };
    });

    const result = calculateApAgingForSuppliers([supplier('s1'), supplier('s2')]);

    expect(result).toEqual({ current: 400, bucket30: 40, bucket60: 25, bucket90Plus: 15, total: 480 });
    expect(mockedCalculateAging).toHaveBeenCalledTimes(2);
  });
});
