import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StatusBadge } from './status-badge';

afterEach(cleanup);

describe('StatusBadge — professional accounting terminology', () => {
  it('shows the stored Sales Order "fulfilled" state as "Completed"', () => {
    render(<StatusBadge status="fulfilled" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByText('Fulfilled')).not.toBeInTheDocument();
  });

  it('keeps "Fulfilment" process wording out of the settled badge but still labels progress states', () => {
    render(<StatusBadge status="partially_fulfilled" />);
    // progress state — the *process* word is still correct here
    expect(screen.getByText('Partially fulfilled')).toBeInTheDocument();
  });

  it('renders both persisted spellings of partial payment as "Partially Paid"', () => {
    const { rerender } = render(<StatusBadge status="partially_paid" />);
    expect(screen.getByText('Partially Paid')).toBeInTheDocument();
    rerender(<StatusBadge status="partially-paid" />);
    expect(screen.getByText('Partially Paid')).toBeInTheDocument();
    expect(screen.queryByText('Part paid')).not.toBeInTheDocument();
  });
});
