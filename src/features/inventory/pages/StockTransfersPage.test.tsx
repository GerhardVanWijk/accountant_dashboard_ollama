import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { Account, Product, StockTransfer, Warehouse } from '@/types';
import { StockTransfersPage } from './StockTransfersPage';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { stockTransferService } from '../services/stockTransferService';
import { productService } from '../services/productService';
import { warehouseService } from '../services/warehouseService';
import { accountService } from '@/features/accounting/services';

function Loc() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function renderPage(entry = '/inventory/transfers') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/inventory/transfers" element={<><StockTransfersPage /><Loc /></>} />
        <Route path="/inventory/transfers/:transferId" element={<Loc />} />
      </Routes>
    </MemoryRouter>,
  );
}

vi.mock('@/features/auth/hooks/useCanAccess', () => ({ useCanAccess: vi.fn(() => true) }));

vi.mock('../services/stockTransferService', () => ({
  stockTransferService: {
    getTransfers: vi.fn(),
    getTransfer: vi.fn(),
    createTransfer: vi.fn(),
    updateTransfer: vi.fn(),
    deleteTransfer: vi.fn(),
    dispatch: vi.fn(),
    receive: vi.fn(),
    completeImmediate: vi.fn(),
    cancelTransfer: vi.fn(),
    previewDispatchEffect: vi.fn().mockResolvedValue({ lines: [], balanced: true }),
    previewReceiveEffect: vi.fn().mockResolvedValue({ lines: [], balanced: true }),
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

const mockedGetTransfers = stockTransferService.getTransfers as unknown as ReturnType<typeof vi.fn>;
const mockedCreateTransfer = stockTransferService.createTransfer as unknown as ReturnType<typeof vi.fn>;
const mockedDeleteTransfer = stockTransferService.deleteTransfer as unknown as ReturnType<typeof vi.fn>;
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
    id: 'acc_1210',
    code: '1210',
    name: 'Inventory in Transit',
    type: 'asset',
    normalBalance: 'debit',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Account;
}

function makeTransfer(overrides: Partial<StockTransfer> = {}): StockTransfer {
  return {
    id: 'trf_1',
    transferNumber: 'TRF-0001',
    fromWarehouseId: 'wh_1',
    toWarehouseId: 'wh_2',
    transferDate: '2026-08-01',
    lineItems: [{ id: 'line_1', transferId: 'trf_1', productId: 'prod_1', quantity: 5, unitCost: 10, totalCost: 50 }],
    totalCost: 50,
    status: 'draft',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('StockTransfersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetProducts.mockResolvedValue([makeProduct()]);
    mockedGetWarehouses.mockResolvedValue([makeWarehouse(), makeWarehouse({ id: 'wh_2', name: 'Secondary Warehouse', isDefault: false })]);
    mockedGetAccounts.mockResolvedValue([makeAccount()]);
  });

  it('shows a loading state while transfers are being fetched', () => {
    mockedGetTransfers.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading stock transfers/i)).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    mockedGetTransfers.mockRejectedValue(new Error('Network unreachable'));
    renderPage();
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no transfers', async () => {
    mockedGetTransfers.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no stock transfers yet/i)).toBeInTheDocument();
  });

  it('renders transfer rows once data loads', async () => {
    mockedGetTransfers.mockResolvedValue([makeTransfer()]);
    renderPage();
    expect(await screen.findByText('TRF-0001')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('creates a new draft transfer through the form', async () => {
    mockedGetTransfers.mockResolvedValue([]);
    mockedCreateTransfer.mockResolvedValue(makeTransfer());
    renderPage();
    await screen.findByText(/no stock transfers yet/i);

    fireEvent.click(screen.getAllByRole('button', { name: /new transfer/i })[0]);
    fireEvent.change(screen.getByLabelText(/from warehouse/i), { target: { value: 'wh_1' } });
    fireEvent.change(screen.getByLabelText(/to warehouse/i), { target: { value: 'wh_2' } });
    fireEvent.click(screen.getByRole('button', { name: /add line/i }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Product' }));
    fireEvent.click(screen.getByRole('option', { name: /Widget/ }));

    mockedGetTransfers.mockResolvedValue([makeTransfer()]);
    fireEvent.click(screen.getByRole('button', { name: /create draft/i }));

    await waitFor(() => expect(mockedCreateTransfer).toHaveBeenCalledTimes(1));
    expect(mockedCreateTransfer.mock.calls[0][0]).toMatchObject({ fromWarehouseId: 'wh_1', toWarehouseId: 'wh_2' });
  });

  it('deletes a draft transfer', async () => {
    mockedGetTransfers.mockResolvedValue([makeTransfer()]);
    mockedDeleteTransfer.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await screen.findByText('TRF-0001');

    mockedGetTransfers.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(mockedDeleteTransfer).toHaveBeenCalledWith('trf_1'));
  });

  it('navigates to the full-page record on row click — no detail sheet', async () => {
    mockedGetTransfers.mockResolvedValue([makeTransfer()]);
    renderPage();
    await screen.findByText('TRF-0001');

    fireEvent.click(screen.getByText('TRF-0001'));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/inventory/transfers/trf_1'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('redirects a legacy ?record=<id> deep link to the canonical record route', async () => {
    mockedGetTransfers.mockResolvedValue([makeTransfer()]);
    renderPage('/inventory/transfers?record=trf_1');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/inventory/transfers/trf_1'));
  });

  it('hides create/manage actions for a user without inventory write permission', async () => {
    (useCanAccess as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    mockedGetTransfers.mockResolvedValue([makeTransfer()]);
    renderPage();
    await screen.findByText('TRF-0001');

    expect(screen.queryByRole('button', { name: /new transfer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
});
