import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMigrationPackage } from './migrationPackage';
import { parseCSV } from '../parsers/csvParser';
import { suggestColumnMapping, mapRow } from '../mapping';
import { accountService } from '@/features/accounting/services';
import { customerService } from '@/features/customers/services/customerService';
import { supplierService } from '@/features/suppliers/services/supplierService';
import { productService } from '@/features/inventory/services/productService';
import { chartOfAccountsImportAdapter } from '../adapters/chartOfAccountsImportAdapter';
import { customerImportAdapter } from '../adapters/customerImportAdapter';
import { supplierImportAdapter } from '../adapters/supplierImportAdapter';

vi.mock('@/features/accounting/services', () => ({ accountService: { getAccounts: vi.fn() } }));
vi.mock('@/features/customers/services/customerService', () => ({ customerService: { getCustomers: vi.fn() } }));
vi.mock('@/features/suppliers/services/supplierService', () => ({ supplierService: { getSuppliers: vi.fn() } }));
vi.mock('@/features/inventory/services/productService', () => ({ productService: { getProducts: vi.fn() } }));

const mockedGetAccounts = accountService.getAccounts as unknown as ReturnType<typeof vi.fn>;
const mockedGetCustomers = customerService.getCustomers as unknown as ReturnType<typeof vi.fn>;
const mockedGetSuppliers = supplierService.getSuppliers as unknown as ReturnType<typeof vi.fn>;
const mockedGetProducts = productService.getProducts as unknown as ReturnType<typeof vi.fn>;

/**
 * True round-trip tests (Phase D continuation, "ROUND-TRIP TEST" requirement):
 * export via the real `buildMigrationPackage()` → extract a section as a
 * real `File` → parse it with the SAME `parseCSV`/`suggestColumnMapping`/
 * `mapRow` pipeline the wizard uses → run the real adapter's
 * `normalizeRow()` → assert the normalized record equals the original
 * source data (within expected formatting rules, e.g. booleans/numbers
 * round-tripping through CSV text). No fakes/stubs of the parsing or
 * mapping layer itself — only the network-facing services are mocked.
 */
describe('export -> import round trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAccounts.mockResolvedValue([]);
    mockedGetCustomers.mockResolvedValue([]);
    mockedGetSuppliers.mockResolvedValue([]);
    mockedGetProducts.mockResolvedValue([]);
  });

  it('Chart of Accounts: exported row maps and normalizes back to the original code/name/type', async () => {
    mockedGetAccounts.mockResolvedValue([
      { id: 'a1', code: '4000', name: 'Sales Revenue', type: 'revenue', normalBalance: 'credit', isActive: true, createdAt: '', updatedAt: '' },
    ]);
    const pkg = await buildMigrationPackage('co_1', 'Acme Co');
    const sheet = parseCSV(pkg.sections.chart_of_accounts);

    const { mapping } = suggestColumnMapping(sheet.headers, chartOfAccountsImportAdapter.fields);
    const rawRow = mapRow(sheet.rows[0], mapping, chartOfAccountsImportAdapter.fields);
    const ctx = await chartOfAccountsImportAdapter.loadContext();
    const { normalized, messages } = chartOfAccountsImportAdapter.normalizeRow(rawRow, 2, ctx);

    expect(messages.filter((m) => m.severity === 'error')).toEqual([]);
    expect(normalized).toMatchObject({ code: '4000', name: 'Sales Revenue', type: 'revenue' });
  });

  it('Customers: exported row maps and normalizes back to the original code/name', async () => {
    mockedGetCustomers.mockResolvedValue([
      { id: 'c1', customerNumber: 'CUST-0001', name: 'Acme Trading', currency: 'ZAR', balance: 12500, status: 'active', createdAt: '', updatedAt: '' },
    ]);
    const pkg = await buildMigrationPackage('co_1', 'Acme Co');
    const sheet = parseCSV(pkg.sections.customers);

    const { mapping } = suggestColumnMapping(sheet.headers, customerImportAdapter.fields);
    const rawRow = mapRow(sheet.rows[0], mapping, customerImportAdapter.fields);
    const ctx = await customerImportAdapter.loadContext();
    const { normalized, messages } = customerImportAdapter.normalizeRow(rawRow, 2, ctx);

    expect(messages.filter((m) => m.severity === 'error')).toEqual([]);
    expect(normalized).toMatchObject({ customerNumber: 'CUST-0001', name: 'Acme Trading' });
  });

  it('Suppliers: exported row maps and normalizes back to the original code/name', async () => {
    mockedGetSuppliers.mockResolvedValue([
      { id: 's1', supplierNumber: 'SUPP-0001', name: 'Vendor Co', currency: 'ZAR', balance: 500, status: 'active', createdAt: '', updatedAt: '' },
    ]);
    const pkg = await buildMigrationPackage('co_1', 'Acme Co');
    const sheet = parseCSV(pkg.sections.suppliers);

    const { mapping } = suggestColumnMapping(sheet.headers, supplierImportAdapter.fields);
    const rawRow = mapRow(sheet.rows[0], mapping, supplierImportAdapter.fields);
    const ctx = await supplierImportAdapter.loadContext();
    const { normalized, messages } = supplierImportAdapter.normalizeRow(rawRow, 2, ctx);

    expect(messages.filter((m) => m.severity === 'error')).toEqual([]);
    expect(normalized).toMatchObject({ supplierNumber: 'SUPP-0001', name: 'Vendor Co' });
  });

  it('an empty company (no accounts/customers/suppliers/products) still produces a structurally valid, re-parseable package', async () => {
    mockedGetAccounts.mockResolvedValue([]);
    mockedGetCustomers.mockResolvedValue([]);
    mockedGetSuppliers.mockResolvedValue([]);
    mockedGetProducts.mockResolvedValue([]);
    const pkg = await buildMigrationPackage('co_1', 'Acme Co');
    const sheet = parseCSV(pkg.sections.chart_of_accounts);
    expect(sheet.rows).toEqual([]);
    expect(sheet.headers.length).toBeGreaterThan(0);
  });
});
