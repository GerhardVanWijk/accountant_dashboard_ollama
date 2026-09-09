import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Product, StockBalance, StockTransfer, Warehouse } from '@/types';
import { WarehousesPage } from './WarehousesPage';

vi.mock('@/features/auth/hooks/useCanAccess', () => ({ useCanAccess: () => true }));

const warehouses: Warehouse[] = [
  { id: 'w1', name: 'Main DC', code: 'DC', isDefault: true, status: 'active', createdAt: '', updatedAt: '' } as Warehouse,
  { id: 'w2', name: 'Cape Town', code: 'CPT', status: 'active', createdAt: '', updatedAt: '' } as Warehouse,
];
const products: Product[] = [
  { id: 'p1', sku: 'P1', name: 'P1', type: 'good', unitPrice: 20, costPrice: 10, trackInventory: true, quantityOnHand: 5, status: 'active', reorderLevel: 8, createdAt: '', updatedAt: '' } as Product,
];
const balances: StockBalance[] = [
  { id: 'b1', productId: 'p1', warehouseId: 'w1', quantityOnHand: 5, quantityCommitted: 0, quantityOnOrder: 0, createdAt: '', updatedAt: '' } as StockBalance,
];
const transfers: StockTransfer[] = [
  { id: 't1', transferNumber: 'TRF-1', fromWarehouseId: 'w1', toWarehouseId: 'w2', transferDate: '2026-09-01', status: 'in_transit', totalCost: 20, lineItems: [{ id: 'l', transferId: 't1', productId: 'p1', quantity: 2, unitCost: 10, totalCost: 20 }], createdAt: '', updatedAt: '' } as StockTransfer,
];

vi.mock('../hooks/useWarehouses', () => ({
  useWarehouses: () => ({ warehouses, loading: false, error: null, refetch: vi.fn(), createWarehouse: vi.fn(), updateWarehouse: vi.fn(), deleteWarehouse: vi.fn() }),
}));
vi.mock('../hooks/useProducts', () => ({ useProducts: () => ({ products, loading: false, error: null }) }));
vi.mock('../hooks/useStockMovements', () => ({ useStockMovements: () => ({ stockLevels: [], loading: false, error: null }) }));
vi.mock('../hooks/useStockBalances', () => ({ useStockBalances: () => ({ balances }) }));
vi.mock('../hooks/useStockCommitments', () => ({ useStockCommitments: () => ({ commitments: new Map() }) }));
vi.mock('../hooks/useStockTransfers', () => ({ useStockTransfers: () => ({ transfers }) }));

function renderPage() {
  return render(
    <MemoryRouter>
      <WarehousesPage />
    </MemoryRouter>,
  );
}

describe('WarehousesPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('renders the warehouse control rollup with per-location figures and alerts', () => {
    renderPage();
    expect(screen.getByText('Warehouse control')).toBeInTheDocument();
    // Main DC: 5 on hand, in-transit out 2, low stock (5 <= reorder 8)
    expect(screen.getAllByText('Main DC').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1 low')).toBeInTheDocument(); // p1: 5 on hand <= reorder 8
    expect(screen.getByText('In transit out')).toBeInTheDocument();
  });
});
