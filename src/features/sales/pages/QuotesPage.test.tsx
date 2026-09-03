import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { Quote } from '@/types';
import { QuotesPage } from './QuotesPage';

vi.mock('@/features/sales/hooks/useQuotes');
vi.mock('@/features/sales/hooks/useQuoteMutations');
vi.mock('@/features/sales/hooks/useCustomerMap');

import { useQuotes } from '@/features/sales/hooks/useQuotes';
import { useQuoteMutations } from '@/features/sales/hooks/useQuoteMutations';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';

const q: Quote = {
  id: 'q1', createdAt: '', updatedAt: '', quoteNumber: 'QUO-2026-0001', customerId: 'c1',
  issueDate: '2026-09-01', expiryDate: '2026-09-30', lineItems: [], subtotal: 0, taxTotal: 0, total: 0, currency: 'ZAR', status: 'sent',
};

beforeEach(() => {
  vi.mocked(useQuotes).mockReturnValue({ quotes: [q], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useQuoteMutations).mockReturnValue({ createQuote: vi.fn() } as never);
  vi.mocked(useCustomerMap).mockReturnValue({ customers: new Map([['c1', 'FreshMart']]), loading: false, error: null } as never);
  vi.mocked(useCustomerList).mockReturnValue({ customers: [], loading: false, error: null } as never);
});

afterEach(cleanup);

function Loc() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}
function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/sales/quotes" element={<><QuotesPage /><Loc /></>} />
        <Route path="/sales/quotes/:quoteId" element={<Loc />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('QuotesPage', () => {
  it('navigates to the full-page record on row click', async () => {
    renderAt('/sales/quotes');
    fireEvent.click(screen.getByRole('button', { name: 'QUO-2026-0001' }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/sales/quotes/q1'));
  });

  it('redirects a legacy ?record=<id> deep link to the canonical record route', async () => {
    renderAt('/sales/quotes?record=q1');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/sales/quotes/q1'));
  });
});
