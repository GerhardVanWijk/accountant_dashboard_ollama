import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { InventoryReconciliationResult } from '../services/reconcileInventory';
import { InventoryReconciliationCard } from './InventoryReconciliationCard';

function result(overrides: Partial<InventoryReconciliationResult> = {}): InventoryReconciliationResult {
  return {
    subledgerValuation: 1569743.2,
    inventoryGlBalance: 1569743.2,
    subledgerVsGl: 0,
    inTransitValuation: 0,
    inTransitGlBalance: 0,
    inTransitVsGl: 0,
    totalInventoryVsGl: 0,
    isReconciled: true,
    findings: [],
    ...overrides,
  };
}

afterEach(cleanup);

describe('InventoryReconciliationCard', () => {
  it('shows the subledger / GL rows and a Reconciled status when balanced', () => {
    render(<InventoryReconciliationCard result={result()} loading={false} error={null} />);
    expect(screen.getByText(/Inventory subledger/i)).toBeInTheDocument();
    expect(screen.getByText(/Inventory Asset GL — 1200/i)).toBeInTheDocument();
    expect(screen.getByText(/Inventory in Transit GL — 1210/i)).toBeInTheDocument();
    expect(screen.getByText('Reconciled')).toBeInTheDocument();
  });

  it('shows "Not reconciled" and the finding detail when an error finding exists', () => {
    render(
      <InventoryReconciliationCard
        loading={false}
        error={null}
        result={result({
          subledgerVsGl: -42.5,
          totalInventoryVsGl: -42.5,
          isReconciled: false,
          findings: [
            {
              code: 'subledger_vs_gl',
              severity: 'error',
              expected: 1000,
              actual: 1042.5,
              difference: -42.5,
              detail: 'difference exceeds the rounding bound',
            },
          ],
        })}
      />,
    );
    expect(screen.getByText(/not reconciled/i)).toBeInTheDocument();
    expect(screen.getByText(/difference exceeds the rounding bound/i)).toBeInTheDocument();
    // the exact expected/actual/difference numbers are always shown, never hidden
    expect(screen.getByText(/expected .* actual .* diff/i)).toBeInTheDocument();
  });

  it('surfaces a rounding-residual WARNING with its tolerance bound — never hidden', () => {
    render(
      <InventoryReconciliationCard
        loading={false}
        error={null}
        result={result({
          isReconciled: true,
          findings: [
            {
              code: 'subledger_vs_gl',
              severity: 'warning',
              expected: 1000,
              actual: 1000.01,
              difference: -0.01,
              toleranceBound: 0.01,
              detail: 'Rounding residual within the bound.',
            },
          ],
        })}
      />,
    );
    expect(screen.getByText(/rounding residual within the bound/i)).toBeInTheDocument();
    expect(screen.getByText(/bound ±/)).toBeInTheDocument();
    expect(screen.getByText('Reconciled')).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    render(<InventoryReconciliationCard result={null} loading error={null} />);
    expect(screen.getByText(/reconciling/i)).toBeInTheDocument();
  });

  it('shows an error state', () => {
    render(<InventoryReconciliationCard result={null} loading={false} error={new Error('boom')} />);
    expect(screen.getByText('boom')).toBeInTheDocument();
  });
});
