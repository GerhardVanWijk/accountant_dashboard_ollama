import type { FixedAsset } from '@/types';

/**
 * Seed data for MockFixedAssetRepository (src/features/assets/repositories/).
 * Deliberately seeded as 'draft' — no journalEntryId, zero
 * accumulatedDepreciation — rather than fabricating an 'active' asset with
 * depreciation history that has no real matching JournalEntry behind it.
 * Phase 5's VAT reconciliation work found and fixed exactly that kind of
 * "status claims posted but no real GL entry exists" gap for seeded
 * Invoices/Bills (docs/KNOWN_ISSUES.md) — not repeating it here. Use the
 * Asset Register's "Post Acquisition" action to capitalize these for real
 * through fixedAssetService, then "Run Depreciation" to build genuine
 * ledger/JournalEntry history.
 */
export const seedFixedAssets: FixedAsset[] = [
  {
    id: 'fa_00000001',
    assetNumber: 'FA-0001',
    name: 'Toyota Hilux 2.4 GD-6 (Delivery Vehicle)',
    description: 'Delivery bakkie, registration to be confirmed on capitalization.',
    category: 'motor_vehicles',
    acquisitionDate: '2026-02-01',
    cost: 485000,
    residualValue: 80000,
    usefulLifeYears: 5,
    depreciationMethod: 'straight_line',
    glAssetAccountId: 'acc_1500',
    glAccumulatedDepreciationAccountId: 'acc_1590',
    glDepreciationExpenseAccountId: 'acc_5200',
    accumulatedDepreciation: 0,
    status: 'draft',
    taxWearTearRatePercent: 20,
    taxWearTearRateSource:
      'SARS Binding General Practice Note 7 (motor vehicles, 5-year write-off, typical rate) — user-supplied, pending professional verification.',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 'fa_00000002',
    assetNumber: 'FA-0002',
    name: 'Office Computer Workstations (x6)',
    description: 'Six Dell OptiPlex workstations for the accounts and admin team.',
    category: 'computer_equipment',
    acquisitionDate: '2026-03-15',
    cost: 84000,
    residualValue: 0,
    usefulLifeYears: 3,
    depreciationMethod: 'straight_line',
    glAssetAccountId: 'acc_1500',
    glAccumulatedDepreciationAccountId: 'acc_1590',
    glDepreciationExpenseAccountId: 'acc_5200',
    accumulatedDepreciation: 0,
    status: 'draft',
    taxWearTearRatePercent: 33.3,
    taxWearTearRateSource:
      'SARS Binding General Practice Note 7 (computers, 3-year write-off, typical rate) — user-supplied, pending professional verification.',
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
  },
  {
    id: 'fa_00000003',
    assetNumber: 'FA-0003',
    name: 'Warehouse Racking & Shelving',
    description: 'Steel pallet racking installed in the main warehouse.',
    category: 'furniture_and_fittings',
    acquisitionDate: '2026-01-20',
    cost: 62000,
    residualValue: 5000,
    usefulLifeYears: 6,
    depreciationMethod: 'reducing_balance',
    reducingBalanceRatePercent: 16.67,
    glAssetAccountId: 'acc_1500',
    glAccumulatedDepreciationAccountId: 'acc_1590',
    glDepreciationExpenseAccountId: 'acc_5200',
    accumulatedDepreciation: 0,
    status: 'draft',
    taxWearTearRatePercent: 16.67,
    taxWearTearRateSource:
      'SARS Binding General Practice Note 7 (furniture & fittings, 6-year write-off, typical rate) — user-supplied, pending professional verification.',
    createdAt: '2026-01-20T00:00:00.000Z',
    updatedAt: '2026-01-20T00:00:00.000Z',
  },
];
