import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMigrationPackage, validateMigrationPackageFile, extractSectionAsFile, MIGRATION_PACKAGE_SCHEMA_VERSION } from './migrationPackage';
import { accountService } from '@/features/accounting/services';
import { customerService } from '@/features/customers/services/customerService';
import { supplierService } from '@/features/suppliers/services/supplierService';
import { productService } from '@/features/inventory/services/productService';

vi.mock('@/features/accounting/services', () => ({ accountService: { getAccounts: vi.fn() } }));
vi.mock('@/features/customers/services/customerService', () => ({ customerService: { getCustomers: vi.fn() } }));
vi.mock('@/features/suppliers/services/supplierService', () => ({ supplierService: { getSuppliers: vi.fn() } }));
vi.mock('@/features/inventory/services/productService', () => ({ productService: { getProducts: vi.fn() } }));

const mockedGetAccounts = accountService.getAccounts as unknown as ReturnType<typeof vi.fn>;
const mockedGetCustomers = customerService.getCustomers as unknown as ReturnType<typeof vi.fn>;
const mockedGetSuppliers = supplierService.getSuppliers as unknown as ReturnType<typeof vi.fn>;
const mockedGetProducts = productService.getProducts as unknown as ReturnType<typeof vi.fn>;

/** jsdom's own `File` doesn't implement `.text()` — same workaround `ImportWizard.test.tsx`'s `fakeCsvFile` uses. */
function fakeFile(name: string, content: string, type: string): File {
  const file = new File([content], name, { type });
  Object.defineProperty(file, 'text', { value: async () => content });
  return file;
}

describe('migrationPackage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAccounts.mockResolvedValue([{ id: 'a1', code: '1000', name: 'Bank', type: 'asset', normalBalance: 'debit', isActive: true, createdAt: '', updatedAt: '' }]);
    mockedGetCustomers.mockResolvedValue([{ id: 'c1', customerNumber: 'CUST-0001', name: 'Acme', currency: 'ZAR', balance: 0, status: 'active', createdAt: '', updatedAt: '' }]);
    mockedGetSuppliers.mockResolvedValue([]);
    mockedGetProducts.mockResolvedValue([]);
  });

  it('builds a package with a manifest hash per section and no secrets', async () => {
    const pkg = await buildMigrationPackage('co_1', 'Acme Co');
    expect(pkg.manifest.schemaVersion).toBe(MIGRATION_PACKAGE_SCHEMA_VERSION);
    expect(pkg.manifest.sections.find((s) => s.key === 'chart_of_accounts')?.recordCount).toBe(1);
    expect(pkg.sections.chart_of_accounts).toContain('1000');
    expect(JSON.stringify(pkg)).not.toMatch(/apikey|service_role|supabase/i);
  });

  it('round-trips through validation successfully for a package it just built', async () => {
    const pkg = await buildMigrationPackage('co_1', 'Acme Co');
    const file = fakeFile('pkg.json', JSON.stringify(pkg), 'application/json');
    const { result } = await validateMigrationPackageFile(file);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a package with a tampered section (hash mismatch)', async () => {
    const pkg = await buildMigrationPackage('co_1', 'Acme Co');
    pkg.sections.chart_of_accounts += '\r\nFAKE,ROW,INJECTED';
    const file = fakeFile('pkg.json', JSON.stringify(pkg), 'application/json');
    const { result } = await validateMigrationPackageFile(file);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /integrity check/.test(e))).toBe(true);
  });

  it('rejects a file that is not valid JSON', async () => {
    const file = fakeFile('pkg.json', 'not json', 'application/json');
    const { result } = await validateMigrationPackageFile(file);
    expect(result.valid).toBe(false);
  });

  it('rejects an incompatible schema version', async () => {
    const pkg = await buildMigrationPackage('co_1', 'Acme Co');
    pkg.manifest.schemaVersion = '99.0.0';
    const file = fakeFile('pkg.json', JSON.stringify(pkg), 'application/json');
    const { result } = await validateMigrationPackageFile(file);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /schema version/.test(e))).toBe(true);
  });

  it('extracts a section as a re-importable File', async () => {
    const pkg = await buildMigrationPackage('co_1', 'Acme Co');
    const file = extractSectionAsFile(pkg, 'chart_of_accounts');
    expect(file.name).toBe('chart_of_accounts.csv');
    expect(file.type).toBe('text/csv');
    expect(file.size).toBeGreaterThan(0);
  });

  it('throws for a section not present in the package', async () => {
    const pkg = await buildMigrationPackage('co_1', 'Acme Co');
    expect(() => extractSectionAsFile(pkg, 'does_not_exist')).toThrow();
  });
});
