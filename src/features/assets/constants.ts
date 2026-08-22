import type { AssetCategory, DepreciationMethod } from '@/types';

export const ASSETS_CURRENCY = 'ZAR';

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  land: 'Land',
  buildings: 'Buildings',
  plant_and_machinery: 'Plant & Machinery',
  furniture_and_fittings: 'Furniture & Fittings',
  motor_vehicles: 'Motor Vehicles',
  computer_equipment: 'Computer Equipment',
  office_equipment: 'Office Equipment',
  leasehold_improvements: 'Leasehold Improvements',
  other: 'Other',
};

export const DEPRECIATION_METHOD_LABELS: Record<DepreciationMethod, string> = {
  straight_line: 'Straight Line',
  reducing_balance: 'Reducing Balance',
};

/**
 * Typical SARS wear-and-tear allowance rates by asset category, per
 * Binding General Practice Note 7 write-off periods — a starting-point
 * default only, prefilled on AssetForm and always editable.
 * IMPORTANT — not independently verified: same caution as
 * src/mock-data/taxRates.ts's sourceReference. Treat every value here as
 * "user-supplied, pending professional/accounting review", not a
 * confirmed statutory rate for any specific asset. Land is never
 * depreciable for tax purposes, hence 0.
 */
export const WEAR_TEAR_RATE_DEFAULTS: Record<AssetCategory, number> = {
  land: 0,
  buildings: 5,
  plant_and_machinery: 20,
  furniture_and_fittings: 16.67,
  motor_vehicles: 20,
  computer_equipment: 33.3,
  office_equipment: 16.67,
  leasehold_improvements: 20,
  other: 10,
};
