import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { CreditNote } from '@/types';
import { CreditNoteDetailPage } from './CreditNoteDetailPage';

vi.mock('@/features/sales/hooks/useCreditNotes');
vi.mock('@/features/sales/hooks/useCreditNoteMutations');
vi.mock('@/features/sales/hooks/useInvoices');
vi.mock('@/features/sales/hooks/useCustomerMap');
vi.mock('@/features/admin/hooks/useCompany');
vi.mock('@/features/inventory/hooks/useProducts');
vi.mock('@/features/inventory/hooks/useWarehouses');
vi.mock('@/features/inventory/hooks/useStockMovements');
vi.mock('@/features/tax/hooks/useTaxRates');
vi.mock('@/services/auditLogService', () => ({ auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) } }));

import { useCreditNotes } from '@/features/sales/hooks/useCreditNotes';
import { useCreditNoteMutations } from '@/features/sales/hooks/useCreditNoteMutations';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';
import { useCompany } from '@/features/admin/hooks/useCompany';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useStockMovements } from '@/features/inventory/hooks/useStockMovements';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';

const cn = (o: Partial<CreditNote> = {}): CreditNote => ({
  id: 'cn1', createdAt: '', updatedAt: '', creditNoteNumber: 'CN-2026-0001', customerId: 'c1', invoiceId: 'inv1',
  issueDate: '2026-09-05', reason: 'return', reasonDetails: undefined,
  lineItems: [{ id: 'l1', description: 'Returned toner cartridge', quantity: 1, unitPrice: 200, taxAmount: 30, lineTotal: 200 }],
  subtotal: 200, taxTotal: 30, total: 230, amountAllocated: 0, currency: 'ZAR', status: 'issued', allocations: [],
  journalEntryId: 'je1', ...o,
});

beforeEach(() => {
  vi.mocked(useCreditNotes).mockReturnValue({ creditNotes: [cn()], isLoading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useCreditNoteMutations).mockReturnValue({
    createCreditNote: vi.fn(), issueCreditNote: vi.fn(), voidCreditNote: vi.fn(), allocateToInvoice: vi.fn(), isLoading: false, error: null,
  } as never);
  vi.mocked(useInvoices).mockReturnValue({
    invoices: [{ id: 'inv1', invoiceNumber: 'INV-1001', customerId: 'c1', total: 230, amountPaid: 0 }],
    loading: false, error: null, refetch: vi.fn(),
  } as never);
  vi.mocked(useCustomerMap).mockReturnValue({ customers: new Map([['c1', 'FreshMart']]), loading: false, error: null } as never);
  vi.mocked(useCompany).mockReturnValue({ company: undefined, loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useProducts).mockReturnValue({ products: [], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useWarehouses).mockReturnValue({ warehouses: [], loading: false, error: null } as never);
  vi.mocked(useStockMovements).mockReturnValue({ movements: [], stockLevels: [], loading: false, error: null, refetch: vi.fn() } as never);
  vi.mocked(useAllTaxRates).mockReturnValue({ taxRates: [], loading: false, error: null } as never);
});

afterEach(cleanup);

function renderAt(path = '/sales/credit-notes/cn1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sales/credit-notes/:creditNoteId" element={<CreditNoteDetailPage />} />
        <Route path="/sales/invoices/:invoiceId" element={<div>invoice page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CreditNoteDetailPage', () => {
  it('renders as a full page with the number, reason and line items; no sheet', () => {
    const { container } = renderAt();
    expect(screen.getByRole('heading', { name: 'CN-2026-0001' })).toBeInTheDocument();
    expect(screen.getByText('Returned toner cartridge')).toBeInTheDocument();
    expect(screen.getByText('Returned goods')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it('links the original invoice as a clickable related record', () => {
    renderAt();
    expect(screen.getAllByRole('link', { name: 'INV-1001' }).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the "Other" reason detail only when present', () => {
    vi.mocked(useCreditNotes).mockReturnValue({
      creditNotes: [cn({ reason: 'other', reasonDetails: 'Goodwill gesture' })], isLoading: false, error: null, refetch: vi.fn(),
    } as never);
    renderAt();
    expect(screen.getByText('Goodwill gesture')).toBeInTheDocument();
  });

  it('a draft credit note offers Issue + Void', () => {
    vi.mocked(useCreditNotes).mockReturnValue({ creditNotes: [cn({ status: 'draft', journalEntryId: undefined })], isLoading: false, error: null, refetch: vi.fn() } as never);
    renderAt();
    expect(screen.getByRole('button', { name: 'Issue credit note' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Void' })).toBeInTheDocument();
  });

  it('deep-links: an unknown id shows the not-found state', () => {
    renderAt('/sales/credit-notes/nope');
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });

  it('offers a "Print / PDF" action but never a "Duplicate" one (Phase 4B)', () => {
    renderAt();
    expect(screen.getByRole('button', { name: 'Print / PDF' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicate' })).not.toBeInTheDocument();
  });
});
