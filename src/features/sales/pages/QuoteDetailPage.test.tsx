import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Quote } from '@/types';
import { QuoteDetailPage } from './QuoteDetailPage';

vi.mock('@/features/sales/hooks/useQuotes');
vi.mock('@/features/sales/hooks/useQuoteMutations');
vi.mock('@/features/sales/hooks/useSalesOrders');
vi.mock('@/features/sales/hooks/useCustomerMap');
vi.mock('@/features/inventory/hooks/useProducts');
vi.mock('@/features/tax/hooks/useTaxRates');
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));

import { useQuotes } from '@/features/sales/hooks/useQuotes';
import { useQuoteMutations } from '@/features/sales/hooks/useQuoteMutations';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';

const quote = (o: Partial<Quote> = {}): Quote => ({
  id: 'q1', createdAt: '', updatedAt: '', quoteNumber: 'QUO-2026-0001', customerId: 'c1',
  issueDate: '2026-09-01', expiryDate: '2026-09-30',
  lineItems: [{ id: 'l1', description: 'Consulting', quantity: 1, unitPrice: 1000, taxAmount: 150, lineTotal: 1000 }],
  subtotal: 1000, taxTotal: 150, total: 1150, currency: 'ZAR', status: 'sent', ...o,
});

beforeEach(() => {
  vi.mocked(useQuotes).mockReturnValue({ quotes: [quote()], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useQuoteMutations).mockReturnValue({
    createQuote: vi.fn(), updateQuote: vi.fn(), deleteQuote: vi.fn(), markAsSent: vi.fn(),
    markAsAccepted: vi.fn(), markAsDeclined: vi.fn(), convertToSalesOrder: vi.fn(), isLoading: false, error: null,
  } as never);
  vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useCustomerMap).mockReturnValue({ customers: new Map([['c1', 'FreshMart']]), loading: false, error: null } as never);
  vi.mocked(useProducts).mockReturnValue({ products: [], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useAllTaxRates).mockReturnValue({ taxRates: [], loading: false, error: null } as never);
});

afterEach(cleanup);

function renderAt(path = '/sales/quotes/q1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sales/quotes/:quoteId" element={<QuoteDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('QuoteDetailPage', () => {
  it('renders as a full page — heading, breadcrumb, line items; no sheet', () => {
    const { container } = renderAt();
    expect(screen.getByRole('heading', { name: 'QUO-2026-0001' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByText('Consulting')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it('a sent quote offers "Mark as accepted" and "Mark as declined"', () => {
    renderAt();
    expect(screen.getByRole('button', { name: 'Mark as accepted' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark as declined' })).toBeInTheDocument();
  });

  it('an accepted quote offers "Convert to sales order"', () => {
    vi.mocked(useQuotes).mockReturnValue({ quotes: [quote({ status: 'accepted' })], isLoading: false, error: null, refetch: vi.fn() } as never);
    renderAt();
    expect(screen.getByRole('button', { name: 'Convert to sales order' })).toBeInTheDocument();
  });

  it('deep-links: an unknown id shows the not-found state', () => {
    renderAt('/sales/quotes/nope');
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });
});
