import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Account, Product, Supplier, SupplierReturn, Warehouse } from '@/types';
import { SupplierReturnsPage } from './SupplierReturnsPage';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { supplierReturnService } from '../services/supplierReturnService';
import { productService } from '../services/productService';
import { warehouseService } from '../services/warehouseService';
import { supplierService } from '@/features/suppliers/services/supplierService';
import { accountService } from '@/features/accounting/services';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/supplier-returns']}>
      <SupplierReturnsPage />
    </MemoryRouter>,
  );
}

vi.mock('@/features/auth/hooks/useCanAccess', () => ({ useCanAccess: vi.fn(() => true) }));

vi.mock('../services/supplierReturnService', () => ({
  supplierReturnService: {
    getSupplierReturns: vi.fn(),
    getSupplierReturn: vi.fn(),
    createSupplierReturn: vi.fn(),
    updateSupplierReturn: vi.fn(),
    deleteSupplierReturn: vi.fn(),
    postSupplierReturn: vi.fn(),
    cancelSupplierReturn: vi.fn(),
    previewPostEffect: vi.fn().mockResolvedValue({ lines: [], balanced: true }),
  },
}));

vi.mock('../services/productService', () => ({
  productService: { getProducts: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../services/warehouseService', () => ({
  warehouseService: { getWarehouses: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/features/suppliers/services/supplierService', () => ({
  supplierService: { getSuppliers: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/features/tax/services', () => ({
  taxRateService: { getCurrentlyEffectiveRates: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/features/accounting/services', () => ({
  accountService: { getAccounts: vi.fn().mockResolvedValue([]) },
}));

const mockedGetSupplierReturns = supplierReturnService.getSupplierReturns as unknown as ReturnType<typeof vi.fn>;
const mockedCreateSupplierReturn = supplierReturnService.createSupplierReturn as unknown as ReturnType<typeof vi.fn>;
const mockedDeleteSupplierReturn = supplierReturnService.deleteSupplierReturn as unknown as ReturnType<typeof vi.fn>;
const mockedPostSupplierReturn = supplierReturnService.postSupplierReturn as unknown as ReturnType<typeof vi.fn>;
const mockedGetProducts = productService.getProducts as unknown as ReturnType<typeof vi.fn>;
const mockedGetWarehouses = warehouseService.getWarehouses as unknown as ReturnType<typeof vi.fn>;
const mockedGetSuppliers = supplierService.getSuppliers as unknown as ReturnType<typeof vi.fn>;
const mockedGetAccounts = accountService.getAccounts as unknown as ReturnType<typeof vi.fn>;

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod_1',
    sku: 'SKU-1',
    name: 'Widget',
    trackInventory: true,
    quantityOnHand: 25,
    costPrice: 10,
    unitPrice: 20,
    status: 'active',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Product;
}

function makeWarehouse(overrides: Partial<Warehouse> = {}): Warehouse {
  return {
    id: 'wh_1',
    name: 'Main Warehouse',
    isDefault: true,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Warehouse;
}

function makeSupplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 'sup_1',
    name: 'Acme Supplies',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Supplier;
}

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc_5060',
    code: '5060',
    name: 'Purchase Price Variance',
    type: 'expense',
    normalBalance: 'debit',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Account;
}

function makeSupplierReturn(overrides: Partial<SupplierReturn> = {}): SupplierReturn {
  return {
    id: 'sret_1',
    returnNumber: 'SRET-0001',
    supplierId: 'sup_1',
    returnDate: '2026-08-01',
    lineItems: [
      { id: 'line_1', supplierReturnId: 'sret_1', productId: 'prod_1', warehouseId: 'wh_1', description: 'Widget', quantity: 2, unitPrice: 10, taxAmount: 0, lineTotal: 20 },
    ],
    subtotal: 20,
    taxTotal: 0,
    total: 20,
    status: 'draft',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('SupplierReturnsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetProducts.mockResolvedValue([makeProduct()]);
    mockedGetWarehouses.mockResolvedValue([makeWarehouse()]);
    mockedGetSuppliers.mockResolvedValue([makeSupplier()]);
    mockedGetAccounts.mockResolvedValue([makeAccount()]);
  });

  it('shows a loading state while returns are being fetched', () => {
    mockedGetSupplierReturns.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading supplier returns/i)).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    mockedGetSupplierReturns.mockRejectedValue(new Error('Network unreachable'));
    renderPage();
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no returns', async () => {
    mockedGetSupplierReturns.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no supplier returns yet/i)).toBeInTheDocument();
  });

  it('renders return rows once data loads', async () => {
    mockedGetSupplierReturns.mockResolvedValue([makeSupplierReturn()]);
    renderPage();
    expect(await screen.findByText('SRET-0001')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('creates a new draft return through the form', async () => {
    mockedGetSupplierReturns.mockResolvedValue([]);
    mockedCreateSupplierReturn.mockResolvedValue(makeSupplierReturn());
    renderPage();
    await screen.findByText(/no supplier returns yet/i);

    fireEvent.click(screen.getAllByRole('button', { name: /new return/i })[0]);
    // Supplier defaults to the first (and only) supplier — the shared SupplierCombobox
    // is not a native <select>, so there is nothing to fire a change event at here.
    fireEvent.click(screen.getByRole('button', { name: /add line/i }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Product' }));
    fireEvent.click(screen.getByRole('option', { name: /Widget/ }));

    mockedGetSupplierReturns.mockResolvedValue([makeSupplierReturn()]);
    fireEvent.click(screen.getByRole('button', { name: /create draft/i }));

    await waitFor(() => expect(mockedCreateSupplierReturn).toHaveBeenCalledTimes(1));
    expect(mockedCreateSupplierReturn.mock.calls[0][0]).toMatchObject({ supplierId: 'sup_1' });
  });

  it('deletes a draft return', async () => {
    mockedGetSupplierReturns.mockResolvedValue([makeSupplierReturn()]);
    mockedDeleteSupplierReturn.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await screen.findByText('SRET-0001');

    mockedGetSupplierReturns.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(mockedDeleteSupplierReturn).toHaveBeenCalledWith('sret_1'));
  });

  it('posts a draft return from the detail sheet', async () => {
    mockedGetSupplierReturns.mockResolvedValue([makeSupplierReturn()]);
    mockedPostSupplierReturn.mockResolvedValue(makeSupplierReturn({ status: 'posted', journalEntryId: 'je_1' }));
    renderPage();
    await screen.findByText('SRET-0001');

    fireEvent.click(screen.getByText('SRET-0001'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^post$/i }));

    await waitFor(() => expect(mockedPostSupplierReturn).toHaveBeenCalledWith('sret_1'));
  });

  it('hides create/manage actions for a user without inventory write permission', async () => {
    (useCanAccess as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    mockedGetSupplierReturns.mockResolvedValue([makeSupplierReturn()]);
    renderPage();
    await screen.findByText('SRET-0001');

    expect(screen.queryByRole('button', { name: /new return/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('SRET-0001'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: /^post$/i })).not.toBeInTheDocument();
  });
});
