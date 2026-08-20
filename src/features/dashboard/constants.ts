import type { CurrencyCode } from '@/types';

/**
 * Reporting currency for the Executive Dashboard. There is no global
 * company-settings/currency module yet, so this is a single named
 * constant (mirroring src/features/inventory/constants.ts's
 * INVENTORY_CURRENCY convention) rather than a value scattered inline
 * across components — matches the seeded mock data across the
 * Customers/Suppliers/Inventory modules ('ZAR' throughout). Swap for a
 * real settings-driven value once one exists.
 */
export const DASHBOARD_CURRENCY: CurrencyCode = 'ZAR';
