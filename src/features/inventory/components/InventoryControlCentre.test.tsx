import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Product, StockMovement, StockTransfer } from '@/types';
import { InventoryControlCentre } from './InventoryControlCentre';
import type { InventoryReconciliationResult } from '../services/reconcileInventory';

const product = (over: Partial<Product>): Product => ({
  id: 'p1', sku: 'P1', name: 'P1', type: 'good', unitPrice: 10, costPrice: 6,
  trackInventory: true, quantityOnHand: 5, status: 'active', createdAt: '', updatedAt: '', ...over,
});

const movement = (over: Partial<StockMovement>): StockMovement => ({
  id: 'm1', productId: 'p1', warehouseId: 'w1', type: 'sale', quantityDelta: -1,
  createdAt: '2026-09-01', updatedAt: '2026-09-01', ...over,
} as StockMovement);

const result = (over: Partial<InventoryReconciliationResult>): InventoryReconciliationResult => ({
  subledgerValuation: 100, inventoryGlBalance: 100, subledgerVsGl: 0,
  inTransitValuation: 0, inTransitGlBalance: 0, inTransitVsGl: 0, totalInventoryVsGl: 0,
  isReconciled: true, findings: [], ...over,
});

function renderCentre(props: Partial<React.ComponentProps<typeof InventoryControlCentre>> = {}) {
  return render(
    <MemoryRouter>
      <InventoryControlCentre
        products={[product({})]}
        movements={[]}
        transfers={[]}
        result={result({})}
        loading={false}
        error={null}
        {...props}
      />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('InventoryControlCentre', () => {
  it('shows the reconciled banner when the engine says so', () => {
    renderCentre();
    expect(screen.getByText(/Inventory reconciled/i)).toBeInTheDocument();
    expect(screen.getByText('Products tracked')).toBeInTheDocument();
  });

  it('counts negative stock, transfers in transit and unlinked movements', () => {
    renderCentre({
      movements: [movement({ id: 'm1', sourceDocumentType: undefined, reference: undefined })],
      transfers: [{ id: 't1', status: 'in_transit', lineItems: [] } as unknown as StockTransfer],
      result: result({
        isReconciled: false,
        findings: [
          { code: 'negative_stock', severity: 'warning', productId: 'p1', expected: 0, actual: -2, difference: -2, detail: '' },
          { code: 'balance_cache_drift', severity: 'error', productId: 'p1', expected: 1, actual: 0, difference: -1, detail: '' },
        ],
      }),
    });
    expect(screen.getByText(/require investigation/i)).toBeInTheDocument();
    // "Movements missing evidence" tile value = 1
    expect(screen.getByText('Movements missing evidence').closest('div')?.textContent).toMatch(/1/);
  });

  it('shows a dash-free loading state without fabricating counts', () => {
    renderCentre({ result: null, loading: true });
    expect(screen.getByText(/Checking company stock integrity/i)).toBeInTheDocument();
  });
});
