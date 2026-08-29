import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { WholePeriodProof } from '../services';
import { WholePeriodProofPanel } from './WholePeriodProofPanel';

const proof: WholePeriodProof = {
  windowStart: '2026-08-01',
  windowEnd: '2026-08-31',
  statementToBooks: {
    total: 3,
    withCounterpart: 2,
    withoutCounterpart: 1,
    items: [
      { lineId: 'l1', hasCounterpart: true, reason: 'matched' },
      { lineId: 'l2', hasCounterpart: true, reason: 'grouped' },
      { lineId: 'l3-missing', hasCounterpart: false, reason: 'none' },
    ],
  },
  booksToStatement: {
    total: 2,
    withStatementLine: 1,
    withoutStatementLine: 1,
    items: [
      { booksId: 'b1', booksType: 'bank_transaction', hasStatementLine: true, reason: 'matched' },
      { booksId: 'b2-outstanding', booksType: 'bank_transaction', hasStatementLine: false, reason: 'outstanding_timing' },
    ],
  },
};

describe('WholePeriodProofPanel (PART I)', () => {
  it('shows both directions with their counts and the unmatched items', () => {
    render(<WholePeriodProofPanel proof={proof} />);

    expect(screen.getByText(/Statement lines without an accounting counterpart/)).toBeInTheDocument();
    expect(screen.getByText('l3-missing')).toBeInTheDocument();

    expect(screen.getByText(/Accounting entries in the period without a statement line/)).toBeInTheDocument();
    expect(screen.getByText('b2-outstanding')).toBeInTheDocument();
    expect(screen.getByText('Outstanding — timing')).toBeInTheDocument();
  });

  it('prompts to run the proof when there is none', () => {
    render(<WholePeriodProofPanel proof={null} />);
    expect(screen.getByText(/Run the whole-period proof/)).toBeInTheDocument();
  });
});
