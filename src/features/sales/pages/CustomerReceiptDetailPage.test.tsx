import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { CustomerReceipt } from '@/types';
import { CustomerReceiptDetailPage } from './CustomerReceiptDetailPage';

vi.mock('@/features/sales/hooks/useCustomerReceipts');
vi.mock('@/features/sales/hooks/useCustomerReceiptMutations');
vi.mock('@/features/sales/hooks/useInvoices');
vi.mock('@/features/sales/hooks/useCustomerMap');
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));

import { useCustomerReceipts } from '@/features/sales/hooks/useCustomerReceipts';
import { useCustomerReceiptMutations } from '@/features/sales/hooks/useCustomerReceiptMutations';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';

const receipt = (o: Partial<CustomerReceipt> = {}): CustomerReceipt => ({
  id: 'r1', createdAt: '', updatedAt: '', receiptNumber: 'RCT-2026-0001', customerId: 'c1',
  date: '2026-09-10', method: 'eft', amount: 1000, unallocatedAmount: 400, reference: 'EFT-99', currency: 'ZAR',
  allocations: [{ invoiceId: 'inv1', amount: 600 }], ...o,
});

beforeEach(() => {
  vi.mocked(useCustomerReceipts).mockReturnValue({ receipts: [receipt()], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useCustomerReceiptMutations).mockReturnValue({ recordReceipt: vi.fn(), allocateToInvoice: vi.fn(), isLoading: false, error: null } as never);
  vi.mocked(useInvoices).mockReturnValue({
    invoices: [{ id: 'inv1', invoiceNumber: 'INV-1001', customerId: 'c1', total: 600, amountPaid: 600 }],
    loading: false, error: null, refetch: vi.fn(),
  } as never);
  vi.mocked(useCustomerMap).mockReturnValue({ customers: new Map([['c1', 'FreshMart']]), loading: false, error: null } as never);
});

afterEach(cleanup);

function renderAt(path = '/sales/receipts/r1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sales/receipts/:receiptId" element={<CustomerReceiptDetailPage />} />
        <Route path="/sales/invoices/:invoiceId" element={<div>invoice page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CustomerReceiptDetailPage', () => {
  it('renders as a full page with an allocation table; no sheet', () => {
    const { container } = renderAt();
    expect(screen.getByRole('heading', { name: 'RCT-2026-0001' })).toBeInTheDocument();
    expect(screen.getByText('Document')).toBeInTheDocument();
    expect(screen.getByText('Remaining')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it('links each allocated invoice and offers "Apply deposit to invoice" while unapplied', () => {
    renderAt();
    expect(screen.getAllByRole('link', { name: 'INV-1001' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Apply deposit to invoice' })).toBeInTheDocument();
  });

  it('a fully allocated receipt offers no allocate action', () => {
    vi.mocked(useCustomerReceipts).mockReturnValue({ receipts: [receipt({ unallocatedAmount: 0 })], isLoading: false, error: null, refetch: vi.fn() } as never);
    renderAt();
    expect(screen.queryByRole('button', { name: 'Apply deposit to invoice' })).not.toBeInTheDocument();
  });

  it('deep-links: an unknown id shows the not-found state', () => {
    renderAt('/sales/receipts/nope');
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });
});
