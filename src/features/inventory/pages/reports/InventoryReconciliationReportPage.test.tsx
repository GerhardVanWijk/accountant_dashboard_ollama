import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InventoryReconciliationReportPage } from './InventoryReconciliationReportPage';

const reconciliationHook = vi.fn();
vi.mock('../../hooks/useInventoryReconciliation', () => ({ useInventoryReconciliation: () => reconciliationHook() }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/reports/inventory-reconciliation']}>
      <InventoryReconciliationReportPage />
    </MemoryRouter>,
  );
}

describe('InventoryReconciliationReportPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('renders every lettered section, including an honest "not run" evidence section', () => {
    reconciliationHook.mockReturnValue({
      result: { subledgerValuation: 100, inventoryGlBalance: 100, subledgerVsGl: 0, inTransitValuation: 0, inTransitGlBalance: 0, inTransitVsGl: 0, totalInventoryVsGl: 0, isReconciled: true, findings: [] },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('A. Quantity control')).toBeInTheDocument();
    expect(screen.getByText('B. Compatibility')).toBeInTheDocument();
    expect(screen.getByText('C. Valuation')).toBeInTheDocument();
    expect(screen.getByText('D. Transit')).toBeInTheDocument();
    expect(screen.getByText('E. Total control')).toBeInTheDocument();
    expect(screen.getByText('F. Evidence')).toBeInTheDocument();
    expect(screen.getByText(/not run/i)).toBeInTheDocument();
    expect(screen.getByText('G. Rounding')).toBeInTheDocument();
  });

  it('surfaces error-severity findings, not just the overall status', () => {
    reconciliationHook.mockReturnValue({
      result: {
        subledgerValuation: 100, inventoryGlBalance: 90, subledgerVsGl: 10, inTransitValuation: 0, inTransitGlBalance: 0, inTransitVsGl: 0, totalInventoryVsGl: 10, isReconciled: false,
        findings: [{ code: 'subledger_vs_gl', severity: 'error', expected: 100, actual: 90, difference: 10, detail: 'Investigate a mismatch.' }],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('Investigate a mismatch.')).toBeInTheDocument();
  });

  it('shows the loading state', () => {
    reconciliationHook.mockReturnValue({ result: null, loading: true, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
