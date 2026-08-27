import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InvoicesPage } from './InvoicesPage';
import { useInvoices, useInvoice, useInvoiceMutations } from '../hooks/useInvoices';
import { useCustomerMap, useCustomerList } from '../hooks/useCustomerMap';
import { useCustomerReceipts } from '../hooks/useCustomerReceipts';
import { useCustomerReceiptMutations } from '../hooks/useCustomerReceiptMutations';
import { useCreditNotes } from '../hooks/useCreditNotes';
import { useCompany } from '@/features/admin/hooks/useCompany';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { auditLogService } from '@/services/auditLogService';
import type { Customer, Invoice } from '@/types';

vi.mock('../hooks/useInvoices');
vi.mock('../hooks/useCustomerMap');
vi.mock('../hooks/useCustomerReceipts');
vi.mock('../hooks/useCustomerReceiptMutations');
vi.mock('../hooks/useCreditNotes');
vi.mock('@/features/admin/hooks/useCompany');
vi.mock('@/features/auth/hooks/useCanAccess');
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));
vi.mock('@/services', async () => {
  const actual = await vi.importActual<typeof import('@/services')>('@/services');
  return { ...actual, invoiceService: { ...actual.invoiceService, isOverdue: vi.fn().mockReturnValue(false) } };
});

function invoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: 'inv1',
    createdAt: '',
    updatedAt: '',
    invoiceNumber: 'INV-1001',
    customerId: 'cust1',
    issueDate: '2026-08-01',
    dueDate: '2026-08-31',
    lineItems: [],
    subtotal: 100,
    taxTotal: 15,
    total: 115,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'sent',
    ...overrides,
  };
}

const invoices: Invoice[] = [invoice({ id: 'inv1', invoiceNumber: 'INV-1001' }), invoice({ id: 'inv2', invoiceNumber: 'INV-1002' })];

describe('InvoicesPage — clicking a record preserves list context (audit rule: does not destroy the user\'s context)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useInvoices).mockReturnValue({ invoices, loading: false, error: null, refetch: vi.fn() });
    vi.mocked(useInvoice).mockImplementation((id) => ({
      invoice: id ? invoices.find((inv) => inv.id === id) : undefined,
      loading: false,
      error: null,
    }));
    vi.mocked(useInvoiceMutations).mockReturnValue({
      createInvoice: vi.fn(),
      updateInvoice: vi.fn(),
      deleteInvoice: vi.fn(),
      markInvoiceAsSent: vi.fn(),
      saving: false,
      error: null,
    });
    vi.mocked(useCustomerMap).mockReturnValue({ customers: new Map([['cust1', 'Cape Coastal Retailers']]), loading: false, error: null });
    vi.mocked(useCustomerList).mockReturnValue({
      customers: [{ id: 'cust1', name: 'Cape Coastal Retailers' } as unknown as Customer],
      loading: false,
      error: null,
    });
    vi.mocked(useCustomerReceipts).mockReturnValue({ receipts: [], isLoading: false, error: null, refetch: vi.fn() });
    vi.mocked(useCustomerReceiptMutations).mockReturnValue({ recordReceipt: vi.fn(), allocateToInvoice: vi.fn(), isLoading: false, error: null });
    vi.mocked(useCreditNotes).mockReturnValue({ creditNotes: [], isLoading: false, error: null, refetch: vi.fn() });
    vi.mocked(useCompany).mockReturnValue({ company: undefined, loading: false, error: null, refetch: vi.fn() });
    vi.mocked(useCanAccess).mockReturnValue(true);
  });

  it('opens the invoice detail sheet on row click without unmounting the list', async () => {
    render(
      <MemoryRouter initialEntries={['/sales/invoices']}>
        <InvoicesPage />
      </MemoryRouter>,
    );

    // Type a search term into the list's own search box.
    const search = screen.getByPlaceholderText(/search invoice or customer/i);
    fireEvent.change(search, { target: { value: 'INV-1001' } });
    expect((search as HTMLInputElement).value).toBe('INV-1001');

    fireEvent.click(screen.getByRole('button', { name: 'INV-1001' }));

    // The sheet opens (its own title renders the invoice number a second time, inside the sheet).
    const sheetTitles = await screen.findAllByText('INV-1001');
    expect(sheetTitles.length).toBeGreaterThan(1);

    // The list is still mounted underneath, with the search term untouched.
    expect((screen.getByPlaceholderText(/search invoice or customer/i) as HTMLInputElement).value).toBe('INV-1001');
  });

  it('closing the sheet returns to the list with search/filter state intact', async () => {
    render(
      <MemoryRouter initialEntries={['/sales/invoices']}>
        <InvoicesPage />
      </MemoryRouter>,
    );

    const search = screen.getByPlaceholderText(/search invoice or customer/i);
    fireEvent.change(search, { target: { value: 'INV-1002' } });

    fireEvent.click(screen.getByRole('button', { name: 'INV-1002' }));
    await screen.findAllByText('INV-1002');

    // Close via the sheet's close button.
    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    expect((screen.getByPlaceholderText(/search invoice or customer/i) as HTMLInputElement).value).toBe('INV-1002');
  });

  it('deep-links a record via ?record=<id> in the URL', async () => {
    render(
      <MemoryRouter initialEntries={['/sales/invoices?record=inv2']}>
        <InvoicesPage />
      </MemoryRouter>,
    );

    const titles = await screen.findAllByText('INV-1002');
    expect(titles.length).toBeGreaterThan(0);
  });

  it('fetches audit history scoped to the open invoice', async () => {
    render(
      <MemoryRouter initialEntries={['/sales/invoices?record=inv1']}>
        <InvoicesPage />
      </MemoryRouter>,
    );

    await screen.findAllByText('INV-1001');
    expect(auditLogService.getForRecord).toHaveBeenCalledWith('Invoice', 'inv1');
  });
});
