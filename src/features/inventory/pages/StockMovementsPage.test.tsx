import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { StockMovement } from '@/types';
import { StockMovementsPage } from './StockMovementsPage';

const movHook = vi.fn();
vi.mock('../hooks/useStockMovements', () => ({ useStockMovements: () => movHook() }));
vi.mock('@/features/accounting/hooks/useFinancialYears', () => ({ useFinancialYears: () => ({ financialYears: [] }) }));
vi.mock('@/features/auth/hooks/useCanAccess', () => ({ useCanAccess: () => true }));

const products = [{ id: 'p1', sku: 'SKU-1', name: 'Widget', costPrice: 4 }];
vi.mock('../hooks/useStockMovementResolvers', () => ({
  useStockMovementResolvers: () => ({
    resolveSource: (m: StockMovement) =>
      m.sourceDocumentType === 'bill'
        ? { label: 'Bill', number: 'BILL-2001', path: '/purchases/bills/b1', previewType: 'bill', id: 'b1', type: 'bill' }
        : m.reference
          ? { label: 'Reference', number: m.reference }
          : undefined,
    resolveAccounting: () => ({ inventoryAccount: '1200 Inventory', contraAccount: '5000 Cost of Goods Sold' }),
    resolveParty: (m: StockMovement) => (m.sourceDocumentType === 'bill' ? 'Acme Supplies' : undefined),
    warehouseName: (id: string) => (id === 'w1' ? 'Main DC' : id),
    productName: () => 'Widget',
    productSku: () => 'SKU-1',
    knownDocumentRefs: new Set<string>(),
    products,
    warehouses: [{ id: 'w1', name: 'Main DC' }],
    transfers: [],
    loading: false,
  }),
}));

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

  it('renders a row per movement with resolved names, not raw UUIDs', () => {
    renderPage();
    expect(screen.getAllByText('Widget').length).toBe(3);
    expect(screen.getByText('Goods received')).toBeInTheDocument();
    expect(screen.getByText('Sale')).toBeInTheDocument();
    expect(screen.getByText('+10')).toBeInTheDocument();
    expect(screen.getByText('-3')).toBeInTheDocument();
    expect(screen.getByText('BILL-2001')).toBeInTheDocument();
    expect(screen.getByText('Acme Supplies')).toBeInTheDocument();
    expect(screen.queryByText('b1')).not.toBeInTheDocument();
  });

  it('badges a movement with no source link and a reversal', () => {
    renderPage();
    expect(screen.getByText('no source')).toBeInTheDocument(); // the correction movement
    expect(screen.getByText('reversal')).toBeInTheDocument();
  });

  it('offers period, type, direction, product and source-type filters', () => {
    renderPage();
    expect(screen.getByLabelText('Any date')).toBeInTheDocument();
    expect(screen.getByLabelText('All movement types')).toBeInTheDocument();
    expect(screen.getByLabelText('Any direction')).toBeInTheDocument();
    expect(screen.getByLabelText('All products')).toBeInTheDocument();
    expect(screen.getByLabelText('Any source type')).toBeInTheDocument();
  });

  it('opens the evidence drawer on row click', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Open evidence for Sale/i }));
    // drawer open — a stock-out sale reads "Stock out" in the Movement block (unique to the drawer)
    expect(screen.getByText('Stock out')).toBeInTheDocument();
  });

  it('shows the empty state', () => {
    movHook.mockReturnValue({ movements: [], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText('No stock movements')).toBeInTheDocument();
  });
});
