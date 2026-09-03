import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { Account, Product, StockTake, Warehouse } from '@/types';
import { StockTakesPage } from './StockTakesPage';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { stockTakeService } from '../services/stockTakeService';
import { productService } from '../services/productService';
import { warehouseService } from '../services/warehouseService';
import { accountService } from '@/features/accounting/services';

function Loc() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function renderPage(entry = '/inventory/stock-takes') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/inventory/stock-takes" element={<><StockTakesPage /><Loc /></>} />
        <Route path="/inventory/stock-takes/:stockTakeId" element={<Loc />} />
      </Routes>
    </MemoryRouter>,
  );
}

vi.mock('@/features/auth/hooks/useCanAccess', () => ({ useCanAccess: vi.fn(() => true) }));

vi.mock('../services/stockTakeService', () => ({
  stockTakeService: {
    getStockTakes: vi.fn(),
    getStockTake: vi.fn(),
    createStockTake: vi.fn(),
    updateStockTake: vi.fn(),
    deleteStockTake: vi.fn(),
    freeze: vi.fn(),
    enterCounts: vi.fn(),
    markReadyForReview: vi.fn(),
    postStockTake: vi.fn(),
    cancelStockTake: vi.fn(),
    previewPostEffect: vi.fn().mockResolvedValue({ lines: [], balanced: true }),
  },
}));

vi.mock('../services/productService', () => ({
  productService: { getProducts: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../services/warehouseService', () => ({
  warehouseService: { getWarehouses: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../services/productCategoryService', () => ({
  productCategoryService: { getCategories: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/features/accounting/services', () => ({
  accountService: { getAccounts: vi.fn().mockResolvedValue([]) },
}));

const mockedGetStockTakes = stockTakeService.getStockTakes as unknown as ReturnType<typeof vi.fn>;
const mockedCreateStockTake = stockTakeService.createStockTake as unknown as ReturnType<typeof vi.fn>;
const mockedDeleteStockTake = stockTakeService.deleteStockTake as unknown as ReturnType<typeof vi.fn>;
const mockedGetProducts = productService.getProducts as unknown as ReturnType<typeof vi.fn>;
const mockedGetWarehouses = warehouseService.getWarehouses as unknown as ReturnType<typeof vi.fn>;
const mockedGetAccounts = accountService.getAccounts as unknown as ReturnType<typeof vi.fn>;

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod_1',
    sku: 'SKU-1',
    name: 'Widget',
    trackInventory: true,
    costPrice: 10,
    unitPrice: 20,
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
    id: 'acc_5050',
    code: '5050',
    name: 'Inventory Adjustments',
    type: 'expense',
    normalBalance: 'debit',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Account;
}

function makeStockTake(overrides: Partial<StockTake> = {}): StockTake {
  return {
    id: 'stk_1',
    stockTakeNumber: 'STK-0001',
    warehouseId: 'wh_1',
    scope: 'all',
    scopeRef: {},
    countDate: '2026-08-01',
    lineItems: [],
    totalVarianceValue: 0,
    status: 'draft',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('StockTakesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetProducts.mockResolvedValue([makeProduct()]);
    mockedGetWarehouses.mockResolvedValue([makeWarehouse()]);
    mockedGetAccounts.mockResolvedValue([makeAccount()]);
  });

  it('shows a loading state while stock takes are being fetched', () => {
    mockedGetStockTakes.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading stock takes/i)).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    mockedGetStockTakes.mockRejectedValue(new Error('Network unreachable'));
    renderPage();
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no stock takes', async () => {
    mockedGetStockTakes.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no stock takes yet/i)).toBeInTheDocument();
  });

  it('renders stock take rows once data loads', async () => {
    mockedGetStockTakes.mockResolvedValue([makeStockTake()]);
    renderPage();
    expect(await screen.findByText('STK-0001')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('creates a new draft stock take through the form', async () => {
    mockedGetStockTakes.mockResolvedValue([]);
    mockedCreateStockTake.mockResolvedValue(makeStockTake());
    renderPage();
    await screen.findByText(/no stock takes yet/i);

    fireEvent.click(screen.getAllByRole('button', { name: /new stock take/i })[0]);
    fireEvent.change(screen.getByLabelText(/^warehouse$/i), { target: { value: 'wh_1' } });

    mockedGetStockTakes.mockResolvedValue([makeStockTake()]);
    fireEvent.click(screen.getByRole('button', { name: /create draft/i }));

    await waitFor(() => expect(mockedCreateStockTake).toHaveBeenCalledTimes(1));
    expect(mockedCreateStockTake.mock.calls[0][0]).toMatchObject({ warehouseId: 'wh_1', scope: 'all' });
  });

  it('deletes a draft stock take', async () => {
    mockedGetStockTakes.mockResolvedValue([makeStockTake()]);
    mockedDeleteStockTake.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await screen.findByText('STK-0001');

    mockedGetStockTakes.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(mockedDeleteStockTake).toHaveBeenCalledWith('stk_1'));
  });

  it('navigates to the full-page record on row click — no detail sheet', async () => {
    mockedGetStockTakes.mockResolvedValue([makeStockTake()]);
    renderPage();
    await screen.findByText('STK-0001');

    fireEvent.click(screen.getByText('STK-0001'));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/inventory/stock-takes/stk_1'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('redirects a legacy ?record=<id> deep link to the canonical record route', async () => {
    mockedGetStockTakes.mockResolvedValue([makeStockTake()]);
    renderPage('/inventory/stock-takes?record=stk_1');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/inventory/stock-takes/stk_1'));
  });

  it('hides create/manage actions for a user without inventory write permission', async () => {
    (useCanAccess as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    mockedGetStockTakes.mockResolvedValue([makeStockTake()]);
    renderPage();
    await screen.findByText('STK-0001');

    expect(screen.queryByRole('button', { name: /new stock take/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
});
