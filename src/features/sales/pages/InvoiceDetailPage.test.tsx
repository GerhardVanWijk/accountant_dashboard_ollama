import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Invoice } from '@/types';
import { InvoiceDetailPage } from './InvoiceDetailPage';

vi.mock('../hooks/useInvoices');
vi.mock('../hooks/useCustomerMap');
vi.mock('../hooks/useCreditNotes');
vi.mock('../hooks/useCustomerReceipts');
vi.mock('../hooks/useCustomerReceiptMutations');
vi.mock('../hooks/useSalesOrders');
vi.mock('@/features/admin/hooks/useCompany');
vi.mock('@/features/inventory/hooks/useProducts');
vi.mock('@/features/inventory/hooks/useWarehouses');
vi.mock('@/features/inventory/hooks/useStockMovements');
vi.mock('@/features/tax/hooks/useTaxRates');
vi.mock('@/features/auth/hooks/useCanAccess');
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));
vi.mock('@/services', async () => {
  const actual = await vi.importActual<typeof import('@/services')>('@/services');
  return { ...actual, invoiceService: { ...actual.invoiceService, isOverdue: vi.fn().mockReturnValue(false) } };
});

import { useInvoices, useInvoiceMutations } from '../hooks/useInvoices';
import { useCustomerMap, useCustomerList } from '../hooks/useCustomerMap';
import { useCreditNotes } from '../hooks/useCreditNotes';
import { useCustomerReceipts } from '../hooks/useCustomerReceipts';
import { useCustomerReceiptMutations } from '../hooks/useCustomerReceiptMutations';
import { useSalesOrders } from '../hooks/useSalesOrders';
import { useCompany } from '@/features/admin/hooks/useCompany';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useStockMovements } from '@/features/inventory/hooks/useStockMovements';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';

const invoice = (o: Partial<Invoice> = {}): Invoice => ({
  id: 'inv1', createdAt: '', updatedAt: '', invoiceNumber: 'INV-1080', customerId: 'cust1',
  issueDate: '2026-08-01', dueDate: '2026-08-31',
  lineItems: [{ id: 'l1', productId: 'p1', description: 'Black Toner Cartridge', quantity: 2, unitPrice: 450, taxRateId: 'tr1', taxAmount: 135, lineTotal: 900 }],
  subtotal: 900, taxTotal: 135, total: 1035, amountPaid: 0, currency: 'ZAR', status: 'sent', journalEntryId: 'je1', ...o,
});

beforeEach(() => {
  vi.mocked(useInvoices).mockReturnValue({ invoices: [invoice()], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useInvoiceMutations).mockReturnValue({
    createInvoice: vi.fn(), updateInvoice: vi.fn(), deleteInvoice: vi.fn(), markInvoiceAsSent: vi.fn(), saving: false, error: null,
  } as never);
  vi.mocked(useCustomerMap).mockReturnValue({ customers: new Map([['cust1', 'Cape Coastal Retailers']]), loading: false, error: null } as never);
  vi.mocked(useCustomerList).mockReturnValue({ customers: [], loading: false, error: null } as never);
  vi.mocked(useCreditNotes).mockReturnValue({ creditNotes: [], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useCustomerReceipts).mockReturnValue({ receipts: [], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useCustomerReceiptMutations).mockReturnValue({ recordReceipt: vi.fn(), allocateToInvoice: vi.fn(), isLoading: false, error: null } as never);
  vi.mocked(useSalesOrders).mockReturnValue({ salesOrders: [], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useCompany).mockReturnValue({ company: undefined, loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useProducts).mockReturnValue({ products: [{ id: 'p1', sku: 'CON-001', name: 'Black Toner Cartridge' }], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useWarehouses).mockReturnValue({ warehouses: [], loading: false, error: null } as never);
  vi.mocked(useStockMovements).mockReturnValue({ movements: [], stockLevels: [], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useAllTaxRates).mockReturnValue({ taxRates: [{ id: 'tr1', name: 'Standard rate', rate: 15 }], loading: false, error: null } as never);
  vi.mocked(useCanAccess).mockReturnValue(true);
});

afterEach(cleanup);

function renderAt(path = '/sales/invoices/inv1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sales/invoices/:invoiceId" element={<InvoiceDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('InvoiceDetailPage', () => {
  it('renders as a full page with the invoice number, customer, breadcrumb and line items — not a sheet', () => {
    const { container } = renderAt();
    expect(screen.getByRole('heading', { name: 'INV-1080' })).toBeInTheDocument();
    expect(screen.getAllByText('Cape Coastal Retailers').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it('shows the product SKU and name on the line, and the resolved tax rate', () => {
    renderAt();
    expect(screen.getByText('CON-001')).toBeInTheDocument();
    expect(screen.getAllByText('Black Toner Cartridge').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Standard rate — 15%')).toBeInTheDocument();
  });

  it('a posted invoice offers no Edit/Delete, and links to the journal entry', () => {
    renderAt();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete draft' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /journal entry/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('a draft invoice offers Mark as sent + Edit + Delete draft', () => {
    vi.mocked(useInvoices).mockReturnValue({ invoices: [invoice({ status: 'draft', journalEntryId: undefined })], loading: false, error: null, refetch: vi.fn() } as never);
    renderAt();
    expect(screen.getByRole('button', { name: 'Mark as sent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete draft' })).toBeInTheDocument();
  });

  it('deep-links: an unknown id shows the not-found state', () => {
    renderAt('/sales/invoices/nope');
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });

  it('offers "Print / PDF" and "Duplicate" document actions (Phase 4B)', () => {
    renderAt();
    expect(screen.getByRole('button', { name: 'Print / PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument();
  });
});
