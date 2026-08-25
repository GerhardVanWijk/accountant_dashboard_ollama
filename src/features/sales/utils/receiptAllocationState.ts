import type { CustomerReceipt } from '@/types';

/** Half a cent — tolerance for floating-point rounding, matching CustomerReceiptService.BALANCE_EPSILON. */
const EPSILON = 0.01;

/**
 * Presentation-only allocation state for a CustomerReceipt — the real
 * domain (src/types/customerReceipt.ts) has no `status` field at all, only
 * `unallocatedAmount`. This just compares two already-known numbers; it
 * decides nothing about accounting (that stays in
 * CustomerReceiptService), only which of three fixed labels to show.
 */
export function receiptAllocationState(receipt: Pick<CustomerReceipt, 'amount' | 'unallocatedAmount'>): 'unallocated' | 'partially-allocated' | 'allocated' {
  if (receipt.unallocatedAmount <= EPSILON) return 'allocated';
  if (receipt.unallocatedAmount >= receipt.amount - EPSILON) return 'unallocated';
  return 'partially-allocated';
}
