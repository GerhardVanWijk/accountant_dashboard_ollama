import type { SupplierReturn } from '@/types';

/**
 * Seed data for MockSupplierReturnRepository (migration 0029, Inventory
 * Accounting Phase 2). Intentionally empty — supplier returns are the
 * purchase-side mirror of a credit note (draft → posted) and are created
 * through the return workflow, never hand-seeded. Phase 3 wires the
 * reversing GL entry and `purchase_return` movements.
 */
export const seedSupplierReturns: SupplierReturn[] = [];
