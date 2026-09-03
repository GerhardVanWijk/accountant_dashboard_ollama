import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { BusinessDocument } from './components/BusinessDocument';
import { quoteToBusinessDocument } from './adapters/quoteToBusinessDocument';
import { salesOrderToBusinessDocument } from './adapters/salesOrderToBusinessDocument';
import { invoiceToBusinessDocument } from './adapters/invoiceToBusinessDocument';
import { creditNoteToBusinessDocument } from './adapters/creditNoteToBusinessDocument';
import { purchaseOrderToBusinessDocument } from './adapters/purchaseOrderToBusinessDocument';
import * as fx from './adapters/__fixtures__';

afterEach(cleanup);

/**
 * The structural privacy guarantee: the id-free `BusinessDocumentViewModel`
 * type + explicit field-picking in the adapters mean no UUID, `*_id`,
 * journal id, posting key or seed ref can reach paper. This scan is the
 * regression net — every fixture below is stuffed with real-looking UUIDs.
 */
const cases = [
  ['quote', () => quoteToBusinessDocument(fx.quote, fx.ctx())],
  ['sales order', () => salesOrderToBusinessDocument(fx.salesOrder, fx.ctx({ quoteNumber: 'QUO-2026-0004' }))],
  [
    'invoice',
    () =>
      invoiceToBusinessDocument(
        fx.invoice,
        fx.ctx({ bankAccount: fx.bankAccount, salesOrderNumber: 'SO-2026-0004' }),
      ),
  ],
  [
    'credit note',
    () => creditNoteToBusinessDocument(fx.creditNote, fx.ctx({ originalInvoiceNumber: 'INV-2026-1072' })),
  ],
  ['purchase order', () => purchaseOrderToBusinessDocument(fx.purchaseOrder, fx.ctx())],
] as const;

describe('business document — no internal identifiers on paper', () => {
  for (const [name, build] of cases) {
    it(`${name}: renders no UUIDs, journal/posting refs, or page numbers`, () => {
      const { container } = render(<BusinessDocument viewModel={build()} />);
      const text = container.textContent ?? '';

      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
      expect(text).not.toMatch(/journal/i);
      expect(text).not.toMatch(/posting key/i);
      expect(text).not.toMatch(/company_id/i);
      expect(text).not.toMatch(/seed/i);
      expect(text).not.toMatch(/Page \d+ of/i);
      // The PO fixture carries a junk billId — it must never surface.
      expect(text).not.toMatch(/bill-should-never-print/i);
    });

    it(`${name}: renders the exact Vertex footer with this year`, () => {
      const { getByText } = render(<BusinessDocument viewModel={build()} />);
      expect(
        getByText(`Generated with Vertex Accounting Solutions • ${new Date().getFullYear()} • All rights reserved.`),
      ).toBeInTheDocument();
    });
  }
});

describe('company document profile (Phase 4B-2) — the new FK + logo never leak', () => {
  const vm = () =>
    invoiceToBusinessDocument(
      fx.invoice,
      fx.ctx({ company: fx.companyWithDocumentProfile, bankAccount: fx.bankAccount }),
    );

  it('renders the human bank details, never the documents_bank_account_id UUID', () => {
    const { container } = render(<BusinessDocument viewModel={vm()} />);
    const text = container.textContent ?? '';
    // The FK id (== the bank account UUID) must not appear anywhere.
    expect(text).not.toContain(fx.UUID.bank);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
    // …but the payment block IS present with the real bank details.
    expect(screen.getByText('First National Bank')).toBeInTheDocument();
    expect(screen.getByText('62884471059')).toBeInTheDocument();
    expect(screen.getByText('250655')).toBeInTheDocument();
  });

  it('renders the logo as an <img src=data:…>, not as raw text', () => {
    const { container } = render(<BusinessDocument viewModel={vm()} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(fx.companyWithDocumentProfile.logo);
    // The base64 blob is not dumped into the text content.
    expect(container.textContent ?? '').not.toContain('base64');
  });

  it('shows the issuer address / contact lines from the profile', () => {
    render(<BusinessDocument viewModel={vm()} />);
    expect(screen.getByText('101 Corporate Park')).toBeInTheDocument();
    expect(screen.getByText('accounts@officenational.example')).toBeInTheDocument();
    expect(screen.getByText(/Payment is due within 30 days/)).toBeInTheDocument();
  });
});
