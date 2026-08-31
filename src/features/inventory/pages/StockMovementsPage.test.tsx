import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { StockMovement } from '@/types';
import { StockMovementsPage } from './StockMovementsPage';

vi.mock('../hooks/useProducts', () => ({
  useProducts: () => ({ products: [{ id: 'p1', sku: 'SKU-1', name: 'Widget' }] }),
}));
vi.mock('../hooks/useWarehouses', () => ({ useWarehouses: () => ({ warehouses: [{ id: 'w1', name: 'Main' }] }) }));

const movHook = vi.fn();
vi.mock('../hooks/useStockMovements', () => ({ useStockMovements: () => movHook() }));

const mv = (o: Partial<StockMovement>): StockMovement =>
  ({
    id: o.id ?? 'm',
    productId: 'p1',
    warehouseId: 'w1',
    type: 'goods_received',
    quantityDelta: 5,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...o,
  }) as StockMovement;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/movements']}>
      <StockMovementsPage />
    </MemoryRouter>,
  );
}

describe('StockMovementsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    movHook.mockReturnValue({
      movements: [
        mv({ id: 'a', type: 'goods_received', quantityDelta: 10, unitCost: 4, totalCost: 40, sourceDocumentType: 'bill', sourceDocumentId: 'b1' }),
        mv({ id: 'b', type: 'sale', quantityDelta: -3, reference: 'INV-1001' }),
        mv({ id: 'c', type: 'correction', quantityDelta: 3, reversalOfMovementId: 'b' }),
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });
  afterEach(cleanup);

  it('renders a row per movement with type, qty and source', () => {
    renderPage();
    expect(screen.getAllByText('Widget').length).toBe(3);
    expect(screen.getByText('Goods received')).toBeInTheDocument();
    expect(screen.getByText('Sale')).toBeInTheDocument();
    expect(screen.getByText('+10')).toBeInTheDocument();
    expect(screen.getByText('-3')).toBeInTheDocument();
    expect(screen.getByText('bill')).toBeInTheDocument();
  });

  it('shows the reversal relationship', () => {
    renderPage();
    expect(screen.getByText(/reverses b/i)).toBeInTheDocument();
  });

  it('offers type, direction and source filters', () => {
    renderPage();
    expect(screen.getByLabelText('All types')).toBeInTheDocument();
    expect(screen.getByLabelText('Any direction')).toBeInTheDocument();
    expect(screen.getByLabelText('Any source')).toBeInTheDocument();
  });

  it('searches by reference', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/search item, reference/i), { target: { value: 'INV-1001' } });
    expect(screen.getByText('Sale')).toBeInTheDocument();
    expect(screen.queryByText('Goods received')).not.toBeInTheDocument();
  });

  it('shows the empty state', () => {
    movHook.mockReturnValue({ movements: [], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('No stock movements')).toBeInTheDocument();
  });
});
