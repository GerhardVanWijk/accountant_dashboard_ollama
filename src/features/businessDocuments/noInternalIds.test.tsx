import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { BusinessDocument } from './components/BusinessDocument';
import { quoteToBusinessDocument } from './adapters/quoteToBusinessDocument';
import { salesOrderToBusinessDocument } from './adapters/salesOrderToBusinessDocument';
import { invoiceToBusinessDocument } from './adapters/invoiceToBusinessDocument';
import { creditNoteToBusinessDocument } from './adapters/creditNoteToBusinessDocument';
import { purchaseOrderToBusinessDocument } from './adapters/purchaseOrderToBusinessDocument';
import { deliveryNoteToBusinessDocument } from './adapters/deliveryNoteToBusinessDocument';
import { returnNoteToBusinessDocument } from './adapters/returnNoteToBusinessDocument';
import * as fx from './adapters/__fixtures__';
import type { DeliveryNote, ReturnNote } from '@/types';

/** Phase 5C — stuffed with real-looking UUIDs, same convention as every other fixture here. */
const deliveryNote: DeliveryNote = {
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  createdAt: '2026-09-05T00:00:00.000Z',
  updatedAt: '2026-09-05T00:00:00.000Z',
  deliveryNoteNumber: 'DN-2026-0001',
  salesOrderId: fx.UUID.salesOrder,
  customerId: fx.UUID.customer,
  warehouseId: '12121212-1212-4212-8212-121212121212',
  deliveryDate: '2026-09-05T00:00:00.000Z',
  status: 'posted',
  journalEntryId: fx.UUID.journal,
  lineItems: [
    {
      id: 'line-should-never-print',
      salesOrderLineId: fx.UUID.line1,
      productId: fx.UUID.product,
      description: 'Printer',
      quantity: 4,
      unitPrice: 5750,
      taxAmount: 862.5,
      lineTotal: 23000,
    },
  ],
};

/** Phase 5D — stuffed with real-looking UUIDs, same convention as every other fixture here. */
const returnNote: ReturnNote = {
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  createdAt: '2026-09-05T00:00:00.000Z',
  updatedAt: '2026-09-05T00:00:00.000Z',
  returnNoteNumber: 'RN-2026-0001',
  deliveryNoteId: deliveryNote.id,
  salesOrderId: fx.UUID.salesOrder,
  customerId: fx.UUID.customer,
  warehouseId: '12121212-1212-4212-8212-121212121212',
  returnDate: '2026-09-05T00:00:00.000Z',
  status: 'posted',
  journalEntryId: fx.UUID.journal,
  lineItems: [
    {
      id: 'line-should-never-print',
      deliveryNoteLineId: deliveryNote.lineItems[0].id,
      salesOrderLineId: fx.UUID.line1,
      productId: fx.UUID.product,
      description: 'Printer',
      quantity: 1,
      unitCost: 3200,
      unitPrice: 5750,
      taxAmount: 215.625,
      lineTotal: 5750,
    },
  ],
};

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
  [
    'delivery note',
    () =>
      deliveryNoteToBusinessDocument(deliveryNote, {
        company: fx.company,
        customer: fx.customer,
        warehouse: { id: deliveryNote.warehouseId, name: 'Main Warehouse', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' },
        products: new Map([[fx.product.id, fx.product]]),
        salesOrderNumber: 'SO-2026-0004',
      }),
  ],
  [
    'return note',
    () =>
      returnNoteToBusinessDocument(returnNote, {
        company: fx.company,
        customer: fx.customer,
        warehouse: { id: returnNote.warehouseId, name: 'Main Warehouse', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' },
        products: new Map([[fx.product.id, fx.product]]),
        deliveryNoteNumber: 'DN-2026-0001',
      }),
  ],
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

    it(`${name}: renders the two-line Vertex footer with this year`, () => {
      const { getByText } = render(<BusinessDocument viewModel={build()} />);
      expect(getByText('Generated with Vertex Accounting Solutions')).toBeInTheDocument();
      expect(
        getByText(`© ${new Date().getFullYear()} Vertex Accounting Solutions. All rights reserved.`),
      ).toBeInTheDocument();
    });
  }
});

describe('delivery note (Phase 5C) — price suppressed by default', () => {
  it('never renders unit price, VAT or line-total figures — a Delivery Note is dispatch evidence, not a priced document', () => {
    const vm = deliveryNoteToBusinessDocument(deliveryNote, {
      company: fx.company,
      customer: fx.customer,
      products: new Map([[fx.product.id, fx.product]]),
    });
    expect(vm.columns).not.toContain('unitPrice');
    expect(vm.columns).not.toContain('vat');
    expect(vm.columns).not.toContain('amount');
    expect(vm.totals).toEqual([]);
    const { container } = render(<BusinessDocument viewModel={vm} />);
    expect(container.textContent ?? '').not.toMatch(/5[,.]?750/); // the line's unitPrice never appears
  });
});

describe('return note (Phase 5D) — price suppressed by default', () => {
  it('never renders unit price, VAT or line-total figures — a Return Note is dispatch-reversal evidence, not a priced document', () => {
    const vm = returnNoteToBusinessDocument(returnNote, {
      company: fx.company,
      customer: fx.customer,
      products: new Map([[fx.product.id, fx.product]]),
    });
    expect(vm.columns).not.toContain('unitPrice');
    expect(vm.columns).not.toContain('vat');
    expect(vm.columns).not.toContain('amount');
    expect(vm.totals).toEqual([]);
    const { container } = render(<BusinessDocument viewModel={vm} />);
    expect(container.textContent ?? '').not.toMatch(/5[,.]?750/); // the line's unitPrice never appears
    expect(container.textContent ?? '').not.toMatch(/3[,.]?200/); // the line's unitCost never appears
  });
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
