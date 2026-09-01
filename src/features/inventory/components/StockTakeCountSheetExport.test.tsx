import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Product, StockTake, Warehouse } from '@/types';
import { StockTakeCountSheetExport } from './StockTakeCountSheetExport';

vi.mock('@/features/admin/hooks/useCompany', () => ({
  useCompany: () => ({ company: undefined, loading: false, error: null, refetch: vi.fn() }),
}));

function makeProduct(overrides: Partial<Product> = {}): Product {
  return { id: 'prod_1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 5, costPrice: 2, trackInventory: true, quantityOnHand: 0, status: 'active', createdAt: '', updatedAt: '', ...overrides };
}

function makeWarehouse(overrides: Partial<Warehouse> = {}): Warehouse {
  return { id: 'wh_1', name: 'Main Warehouse', isDefault: true, isActive: true, createdAt: '', updatedAt: '', ...overrides } as Warehouse;
}

function makeStockTake(overrides: Partial<StockTake> = {}): StockTake {
  return {
    id: 'stk_1',
    stockTakeNumber: 'STK-0001',
    warehouseId: 'wh_1',
    scope: 'all',
    scopeRef: {},
    countDate: '2026-08-01',
    lineItems: [
      { id: 'line_1', stockTakeId: 'stk_1', productId: 'prod_1', warehouseId: 'wh_1', expectedQty: 100, countedQty: 95, unitCost: 2, varianceQty: -5, varianceValue: -10 },
    ],
    totalVarianceValue: -10,
    status: 'counting',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('StockTakeCountSheetExport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when not allowed', () => {
    const { container } = render(
      <StockTakeCountSheetExport stockTake={makeStockTake()} products={[makeProduct()]} warehouses={[makeWarehouse()]} allowed={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a draft stock take (nothing to print or export yet)', () => {
    const { container } = render(
      <StockTakeCountSheetExport stockTake={makeStockTake({ status: 'draft' })} products={[makeProduct()]} warehouses={[makeWarehouse()]} allowed />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('offers Blind and Standard count sheet options while counting', () => {
    render(<StockTakeCountSheetExport stockTake={makeStockTake()} products={[makeProduct()]} warehouses={[makeWarehouse()]} allowed />);
    fireEvent.click(screen.getByRole('button', { name: /print count sheet/i }));
    expect(screen.getByRole('menuitem', { name: /blind count sheet/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /standard count sheet/i })).toBeInTheDocument();
  });

  it('never shows unit cost/WAC on the physical count sheet, blind or standard', () => {
    render(<StockTakeCountSheetExport stockTake={makeStockTake()} products={[makeProduct()]} warehouses={[makeWarehouse()]} allowed />);
    expect(screen.queryByText(/frozen wac/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/unit cost/i)).not.toBeInTheDocument();
  });

  it('shows the counted-quantity write-in blank, never the actual countedQty value, on the count sheet', () => {
    render(<StockTakeCountSheetExport stockTake={makeStockTake()} products={[makeProduct()]} warehouses={[makeWarehouse()]} allowed />);
    // The printable report is rendered (hidden on screen, visible on print) — its blank write-in placeholder is present.
    expect(screen.getByText('________', { ignore: false })).toBeInTheDocument();
    expect(screen.queryByText('95', { ignore: false })).not.toBeInTheDocument();
  });

  it('shows Export controls (Print/CSV/Excel) for a ready_for_review stock take, including WAC and variance value', () => {
    render(<StockTakeCountSheetExport stockTake={makeStockTake({ status: 'ready_for_review' })} products={[makeProduct()]} warehouses={[makeWarehouse()]} allowed />);
    expect(screen.getByRole('button', { name: /^export$/i })).toBeInTheDocument();
    expect(screen.getByText('2', { ignore: false })).toBeInTheDocument(); // frozen WAC
    expect(screen.getAllByText('-10', { ignore: false }).length).toBeGreaterThan(0); // variance value (line + total)
  });

  it('shows Export controls for a posted stock take too', () => {
    render(<StockTakeCountSheetExport stockTake={makeStockTake({ status: 'posted' })} products={[makeProduct()]} warehouses={[makeWarehouse()]} allowed />);
    expect(screen.getByRole('button', { name: /^export$/i })).toBeInTheDocument();
  });
});
