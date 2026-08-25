import { describe, it, expect } from 'vitest';
import { receiptAllocationState } from './receiptAllocationState';

describe('receiptAllocationState', () => {
  it('returns "unallocated" when nothing has been applied yet', () => {
    expect(receiptAllocationState({ amount: 500, unallocatedAmount: 500 })).toBe('unallocated');
  });

  it('returns "partially-allocated" when some but not all has been applied', () => {
    expect(receiptAllocationState({ amount: 500, unallocatedAmount: 200 })).toBe('partially-allocated');
  });

  it('returns "allocated" when nothing remains unallocated', () => {
    expect(receiptAllocationState({ amount: 500, unallocatedAmount: 0 })).toBe('allocated');
  });

  it('treats a sub-cent remainder as fully allocated', () => {
    expect(receiptAllocationState({ amount: 500, unallocatedAmount: 0.005 })).toBe('allocated');
  });

  it('treats a receipt with zero amount and zero unallocated as allocated, not unallocated', () => {
    expect(receiptAllocationState({ amount: 0, unallocatedAmount: 0 })).toBe('allocated');
  });
});
