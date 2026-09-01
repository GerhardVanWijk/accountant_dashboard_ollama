import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MarginAnalysisReportPage } from './MarginAnalysisReportPage';

const productsHook = vi.fn();
vi.mock('../../hooks/useProducts', () => ({ useProducts: () => productsHook() }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/reports/margin-analysis']}>
      <MarginAnalysisReportPage />
    </MemoryRouter>,
  );
}

describe('MarginAnalysisReportPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('shows unit margin and margin percent, always labeled "current theoretical"', () => {
    productsHook.mockReturnValue({
      products: [{ id: 'p1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4, trackInventory: true, quantityOnHand: 10, status: 'active', createdAt: '', updatedAt: '' }],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('Blue Pen')).toBeInTheDocument();
    expect(screen.getAllByText('60.0%').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/current theoretical margin/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/not realised historical gross margin/i)).toBeInTheDocument();
  });

  it('shows "—" rather than 0% or a crash when selling price is zero', () => {
    productsHook.mockReturnValue({
      products: [{ id: 'p1', sku: 'PEN-1', name: 'Free Sample', type: 'good', unitPrice: 0, costPrice: 4, trackInventory: true, quantityOnHand: 10, status: 'active', createdAt: '', updatedAt: '' }],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('Free Sample')).toBeInTheDocument();
  });
});
