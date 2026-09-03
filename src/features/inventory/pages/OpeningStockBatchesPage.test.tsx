import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { Account, OpeningStockBatch, Product, Warehouse } from '@/types';
import { OpeningStockBatchesPage } from './OpeningStockBatchesPage';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { openingStockBatchService } from '../services/openingStockBatchService';
import { productService } from '../services/productService';
import { warehouseService } from '../services/warehouseService';
import { accountService } from '@/features/accounting/services';

function Loc() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function renderPage(entry = '/inventory/opening-stock') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/inventory/opening-stock" element={<><OpeningStockBatchesPage /><Loc /></>} />
        <Route path="/inventory/opening-stock/:batchId" element={<Loc />} />
      </Routes>
    </MemoryRouter>,
  );
}

vi.mock('@/features/auth/hooks/useCanAccess', () => ({ useCanAccess: vi.fn(() => true) }));

vi.mock('../services/openingStockBatchService', () => ({
  openingStockBatchService: {
    getOpeningStockBatches: vi.fn(),
    getOpeningStockBatch: vi.fn(),
    createOpeningStockBatch: vi.fn(),
    updateOpeningStockBatch: vi.fn(),
    deleteOpeningStockBatch: vi.fn(),
    confirmBatch: vi.fn(),
    cancelBatch: vi.fn(),
    previewAccountingEffect: vi.fn().mockResolvedValue({ lines: [], balanced: true }),
  },
}));

vi.mock('../services/productService', () => ({
  productService: { getProducts: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../services/warehouseService', () => ({
  warehouseService: { getWarehouses: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/features/accounting/services', () => ({
  accountService: { getAccounts: vi.fn().mockResolvedValue([]) },
}));

const mockedGetBatches = openingStockBatchService.getOpeningStockBatches as unknown as ReturnType<typeof vi.fn>;
const mockedCreateBatch = openingStockBatchService.createOpeningStockBatch as unknown as ReturnType<typeof vi.fn>;
const mockedDeleteBatch = openingStockBatchService.deleteOpeningStockBatch as unknown as ReturnType<typeof vi.fn>;
const mockedGetProducts = productService.getProducts as unknown as ReturnType<typeof vi.fn>;
const mockedGetWarehouses = warehouseService.getWarehouses as unknown as ReturnType<typeof vi.fn>;
const mockedGetAccounts = accountService.getAccounts as unknown as ReturnType<typeof vi.fn>;

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod_1',
    sku: 'SKU-1',
    name: 'Widget',
    trackInventory: true,
    quantityOnHand: 0,
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

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc_1200',
    code: '1200',
    name: 'Inventory',
    type: 'asset',
    normalBalance: 'debit',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Account;
}

function makeBatch(overrides: Partial<OpeningStockBatch> = {}): OpeningStockBatch {
  return {
    id: 'osb_1',
    batchNumber: 'OSB-0001',
    effectiveDate: '2026-08-01',
    warehouseId: 'wh_1',
    lineItems: [{ id: 'line_1', openingStockBatchId: 'osb_1', productId: 'prod_1', warehouseId: 'wh_1', quantity: 10, unitCost: 5, totalCost: 50 }],
    totalCost: 50,
    status: 'draft',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('OpeningStockBatchesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetProducts.mockResolvedValue([makeProduct()]);
    mockedGetWarehouses.mockResolvedValue([makeWarehouse()]);
    mockedGetAccounts.mockResolvedValue([makeAccount()]);
  });

  it('shows a loading state while batches are being fetched', () => {
    mockedGetBatches.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading opening stock batches/i)).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    mockedGetBatches.mockRejectedValue(new Error('Network unreachable'));
    renderPage();
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no batches', async () => {
    mockedGetBatches.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no opening stock batches yet/i)).toBeInTheDocument();
  });

  it('renders batch rows once data loads', async () => {
    mockedGetBatches.mockResolvedValue([makeBatch()]);
    renderPage();
    expect(await screen.findByText('OSB-0001')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('creates a new draft batch through the form', async () => {
    mockedGetBatches.mockResolvedValue([]);
    mockedCreateBatch.mockResolvedValue(makeBatch());
    renderPage();
    await screen.findByText(/no opening stock batches yet/i);

    fireEvent.click(screen.getAllByRole('button', { name: /new batch/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /add line/i }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Product' }));
    fireEvent.click(screen.getByRole('option', { name: /Widget/ }));

    mockedGetBatches.mockResolvedValue([makeBatch()]);
    fireEvent.click(screen.getByRole('button', { name: /create draft/i }));

    await waitFor(() => expect(mockedCreateBatch).toHaveBeenCalledTimes(1));
    expect(mockedCreateBatch.mock.calls[0][0]).toMatchObject({ warehouseId: 'wh_1' });
  });

  it('deletes a draft batch', async () => {
    mockedGetBatches.mockResolvedValue([makeBatch()]);
    mockedDeleteBatch.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await screen.findByText('OSB-0001');

    mockedGetBatches.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(mockedDeleteBatch).toHaveBeenCalledWith('osb_1'));
  });

  it('navigates to the full-page record on row click — no detail sheet', async () => {
    mockedGetBatches.mockResolvedValue([makeBatch()]);
    renderPage();
    await screen.findByText('OSB-0001');

    fireEvent.click(screen.getByText('OSB-0001'));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/inventory/opening-stock/osb_1'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('redirects a legacy ?record=<id> deep link to the canonical record route', async () => {
    mockedGetBatches.mockResolvedValue([makeBatch()]);
    renderPage('/inventory/opening-stock?record=osb_1');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/inventory/opening-stock/osb_1'));
  });

  it('hides create/manage actions for a user without inventory write permission', async () => {
    (useCanAccess as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    mockedGetBatches.mockResolvedValue([makeBatch()]);
    renderPage();
    await screen.findByText('OSB-0001');

    expect(screen.queryByRole('button', { name: /new batch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
});
