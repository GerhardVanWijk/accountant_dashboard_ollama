import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { Account, Product, StockAdjustment, Warehouse } from '@/types';
import { StockAdjustmentsPage } from './StockAdjustmentsPage';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { stockAdjustmentService } from '../services/stockAdjustmentService';
import { productService } from '../services/productService';
import { warehouseService } from '../services/warehouseService';
import { accountService } from '@/features/accounting/services';

function Loc() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function renderPage(entry = '/inventory/adjustments') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/inventory/adjustments" element={<><StockAdjustmentsPage /><Loc /></>} />
        <Route path="/inventory/adjustments/:adjustmentId" element={<Loc />} />
      </Routes>
    </MemoryRouter>,
  );
}

vi.mock('@/features/auth/hooks/useCanAccess', () => ({ useCanAccess: vi.fn(() => true) }));

vi.mock('../services/stockAdjustmentService', () => ({
  stockAdjustmentService: {
    getAdjustments: vi.fn(),
    getAdjustment: vi.fn(),
    createAdjustment: vi.fn(),
    updateAdjustment: vi.fn(),
    deleteAdjustment: vi.fn(),
    submitForApproval: vi.fn(),
    approve: vi.fn(),
    postAdjustment: vi.fn(),
    cancelAdjustment: vi.fn(),
    reverseAdjustment: vi.fn(),
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

const mockedGetAdjustments = stockAdjustmentService.getAdjustments as unknown as ReturnType<typeof vi.fn>;
const mockedCreateAdjustment = stockAdjustmentService.createAdjustment as unknown as ReturnType<typeof vi.fn>;
const mockedDeleteAdjustment = stockAdjustmentService.deleteAdjustment as unknown as ReturnType<typeof vi.fn>;
const mockedGetProducts = productService.getProducts as unknown as ReturnType<typeof vi.fn>;
const mockedGetWarehouses = warehouseService.getWarehouses as unknown as ReturnType<typeof vi.fn>;
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

function makeAdjustment(overrides: Partial<StockAdjustment> = {}): StockAdjustment {
  return {
    id: 'adj_1',
    adjustmentNumber: 'ADJ-0001',
    warehouseId: 'wh_1',
    adjustmentDate: '2026-08-01',
    reason: 'write_off',
    lineItems: [
      { id: 'line_1', adjustmentId: 'adj_1', productId: 'prod_1', warehouseId: 'wh_1', quantityDelta: -2, unitCost: 10, costEffect: -20 },
    ],
    totalCostEffect: -20,
    status: 'draft',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('StockAdjustmentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetProducts.mockResolvedValue([makeProduct()]);
    mockedGetWarehouses.mockResolvedValue([makeWarehouse()]);
    mockedGetAccounts.mockResolvedValue([makeAccount()]);
  });

  it('shows a loading state while adjustments are being fetched', () => {
    mockedGetAdjustments.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading stock adjustments/i)).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    mockedGetAdjustments.mockRejectedValue(new Error('Network unreachable'));
    renderPage();
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no adjustments', async () => {
    mockedGetAdjustments.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no stock adjustments yet/i)).toBeInTheDocument();
  });

  it('renders adjustment rows once data loads', async () => {
    mockedGetAdjustments.mockResolvedValue([makeAdjustment()]);
    renderPage();
    expect(await screen.findByText('ADJ-0001')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('creates a new draft adjustment through the form', async () => {
    mockedGetAdjustments.mockResolvedValue([]);
    mockedCreateAdjustment.mockResolvedValue(makeAdjustment());
    renderPage();
    await screen.findByText(/no stock adjustments yet/i);

    fireEvent.click(screen.getAllByRole('button', { name: /new adjustment/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /add line/i }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Product' }));
    fireEvent.click(screen.getByRole('option', { name: /Widget/ }));

    mockedGetAdjustments.mockResolvedValue([makeAdjustment()]);
    fireEvent.click(screen.getByRole('button', { name: /create draft/i }));

    await waitFor(() => expect(mockedCreateAdjustment).toHaveBeenCalledTimes(1));
    expect(mockedCreateAdjustment.mock.calls[0][0]).toMatchObject({ reason: 'write_off', warehouseId: 'wh_1' });
  });

  it('deletes a draft adjustment', async () => {
    mockedGetAdjustments.mockResolvedValue([makeAdjustment()]);
    mockedDeleteAdjustment.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await screen.findByText('ADJ-0001');

    mockedGetAdjustments.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(mockedDeleteAdjustment).toHaveBeenCalledWith('adj_1'));
  });

  it('navigates to the full-page record on row click — no detail sheet', async () => {
    mockedGetAdjustments.mockResolvedValue([makeAdjustment()]);
    renderPage();
    await screen.findByText('ADJ-0001');

    fireEvent.click(screen.getByText('ADJ-0001'));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/inventory/adjustments/adj_1'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('redirects a legacy ?record=<id> deep link to the canonical record route', async () => {
    mockedGetAdjustments.mockResolvedValue([makeAdjustment()]);
    renderPage('/inventory/adjustments?record=adj_1');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/inventory/adjustments/adj_1'));
  });

  it('hides create/manage actions for a user without inventory write permission', async () => {
    (useCanAccess as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    mockedGetAdjustments.mockResolvedValue([makeAdjustment()]);
    renderPage();
    await screen.findByText('ADJ-0001');

    expect(screen.queryByRole('button', { name: /new adjustment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
});
