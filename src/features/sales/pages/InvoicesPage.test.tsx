import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { Customer, Invoice } from '@/types';
import { InvoicesPage } from './InvoicesPage';
import { useInvoices, useInvoiceMutations } from '../hooks/useInvoices';
import { useCustomerMap, useCustomerList } from '../hooks/useCustomerMap';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';

vi.mock('../hooks/useInvoices');
vi.mock('../hooks/useCustomerMap');
vi.mock('@/features/auth/hooks/useCanAccess');
vi.mock('@/services', async () => {
  const actual = await vi.importActual<typeof import('@/services')>('@/services');
  return { ...actual, invoiceService: { ...actual.invoiceService, isOverdue: vi.fn().mockReturnValue(false) } };
});

function invoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: 'inv1', createdAt: '', updatedAt: '', invoiceNumber: 'INV-1001', customerId: 'cust1',
    issueDate: '2026-08-01', dueDate: '2026-08-31', lineItems: [], subtotal: 100, taxTotal: 15,
    total: 115, amountPaid: 0, currency: 'ZAR', status: 'sent', ...overrides,
  };
}

const invoices: Invoice[] = [invoice({ id: 'inv1', invoiceNumber: 'INV-1001' }), invoice({ id: 'inv2', invoiceNumber: 'INV-1002' })];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useInvoices).mockReturnValue({ invoices, loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useInvoiceMutations).mockReturnValue({
    createInvoice: vi.fn(), updateInvoice: vi.fn(), deleteInvoice: vi.fn(), markInvoiceAsSent: vi.fn(), saving: false, error: null,
  } as never);
  vi.mocked(useCustomerMap).mockReturnValue({ customers: new Map([['cust1', 'Cape Coastal Retailers']]), loading: false, error: null } as never);
  vi.mocked(useCustomerList).mockReturnValue({
    customers: [{ id: 'cust1', name: 'Cape Coastal Retailers' } as unknown as Customer], loading: false, error: null,
  } as never);
  vi.mocked(useCanAccess).mockReturnValue(true);
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
        <Route path="/sales/invoices" element={<><InvoicesPage /><Loc /></>} />
        <Route path="/sales/invoices/:invoiceId" element={<Loc />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('InvoicesPage', () => {
  it('navigates to the full-page record on row click — no ?record= modal state', async () => {
    renderAt('/sales/invoices');
    fireEvent.click(screen.getByRole('button', { name: 'INV-1001' }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/sales/invoices/inv1'));
    expect(screen.getByTestId('loc')).not.toHaveTextContent('record=');
  });

  it('redirects a legacy ?record=<id> deep link to the canonical record route', async () => {
    renderAt('/sales/invoices?record=inv2');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/sales/invoices/inv2'));
  });

  it('does not render a right-hand detail sheet', () => {
    const { container } = renderAt('/sales/invoices');
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });
});
