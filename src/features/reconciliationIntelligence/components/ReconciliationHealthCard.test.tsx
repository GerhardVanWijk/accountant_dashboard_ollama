import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReconciliationHealthCard } from './ReconciliationHealthCard';
import { computeReconciliationHealth } from '../services/reconciliationHealthService';

/**
 * docs/CURRENT_TASKS.md #22 — the card must show three distinct things and
 * never a "100% explained" while a non-zero variance is still open.
 */
describe('ReconciliationHealthCard', () => {
  it('shows match coverage, variance explained, and remaining unexplained as separate figures', () => {
    render(<ReconciliationHealthCard health={computeReconciliationHealth(32, 22, 5, 3, 100, 87)} />);

    expect(screen.getByText(/match coverage/i)).toBeInTheDocument();
    expect(screen.getByText(/variance explained/i)).toBeInTheDocument();
    expect(screen.getByText(/remaining unexplained/i)).toBeInTheDocument();
    expect(screen.getByText('84.4%')).toBeInTheDocument(); // 27 / 32 matched
    expect(screen.getByText('87%')).toBeInTheDocument(); // R87 of the R100 gap
  });

  it('the reported bug: 0 analysed lines + a R74,905 gap never renders "100%"', () => {
    render(<ReconciliationHealthCard health={computeReconciliationHealth(0, 0, 0, 0, 74905, 0)} />);

    expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument(); // match coverage is not a number
    expect(screen.getByText('0%')).toBeInTheDocument(); // 0% of the gap explained
    // the remaining amount is shown (en-ZA "74 905,00")
    expect(screen.getByText(/74\s?905,00/)).toBeInTheDocument();
  });

  it('100% variance-explained is shown only once the gap is genuinely closed', () => {
    const closed = computeReconciliationHealth(10, 10, 0, 0, 0, 0);
    expect(closed.varianceExplainedPercent).toBe(100);
    expect(closed.varianceRemaining).toBe(0);

    render(<ReconciliationHealthCard health={closed} />);
    expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('0,00').length).toBeGreaterThanOrEqual(1); // remaining unexplained
  });
});
