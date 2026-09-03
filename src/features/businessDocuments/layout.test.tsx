import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import { BusinessDocument } from './components/BusinessDocument';
import { invoiceToBusinessDocument } from './adapters/invoiceToBusinessDocument';
import * as fx from './adapters/__fixtures__';

afterEach(cleanup);

describe('BusinessDocument layout', () => {
  it('renders every row of a 35-line document', () => {
    const lineItems = Array.from({ length: 35 }, (_, i) => ({
      id: `line-${i}`,
      description: `Line item number ${i + 1}`,
      quantity: i + 1,
      unitPrice: 10,
      taxRateId: fx.UUID.taxStd,
      taxAmount: (i + 1) * 1.5,
      lineTotal: (i + 1) * 10,
    }));
    const vm = invoiceToBusinessDocument(
      { ...fx.invoice, lineItems, amountPaid: 0 },
      fx.ctx({ products: new Map() }),
    );
    const { container } = render(<BusinessDocument viewModel={vm} />);
    const bodyRows = container.querySelectorAll('.business-document__lines tbody tr');
    expect(bodyRows).toHaveLength(35);
    expect(within(container).getByText('Line item number 35')).toBeInTheDocument();
  });

  it('lets a very long description sit in a full-width cell without a fixed width', () => {
    const long = 'A supremely verbose product description that goes on well past any sane column width '.repeat(6);
    const vm = invoiceToBusinessDocument(
      { ...fx.invoice, amountPaid: 0, lineItems: [{ ...fx.invoice.lineItems[0], description: long }] },
      fx.ctx({ products: new Map() }),
    );
    const { container } = render(<BusinessDocument viewModel={vm} />);
    const descCell = container.querySelector('.business-document__lines tbody td');
    expect(descCell?.textContent).toBe(long);
    expect(descCell?.className ?? '').not.toMatch(/\bw-\d/);
  });

  it('renders cleanly for a customer with no billing address', () => {
    const vm = invoiceToBusinessDocument(
      fx.invoice,
      fx.ctx({ customer: { ...fx.customer, billingAddress: undefined } }),
    );
    const { container } = render(<BusinessDocument viewModel={vm} />);
    expect(container.querySelector('.business-document__parties')).not.toBeNull();
    expect(within(container).getByText('FreshMart Retail')).toBeInTheDocument();
  });

  it('renders a long-everything header (wide logo, long trading + legal name, multi-line address, contacts) without throwing', () => {
    const longCompany = {
      ...fx.companyWithDocumentProfile,
      name: 'A Really Very Long Legal Entity Name That Keeps Going (Proprietary) Limited',
      tradingName: 'An Equally Long Trading As Name For The Same Business Group Nationwide',
      documentAddress: {
        line1: 'Unit 42, The Exceptionally Long Named Business Park And Office Estate',
        line2: 'Corner of Very Long Street and Another Long Street',
        city: 'Johannesburg',
        state: 'Gauteng',
        postalCode: '2196',
        country: 'South Africa',
      },
    };
    const vm = invoiceToBusinessDocument(
      { ...fx.invoice, amountPaid: 0 },
      fx.ctx({ company: longCompany, products: new Map() }),
    );
    const { container } = render(<BusinessDocument viewModel={vm} />);
    // The wordmark/logo is the trading name; the legal name still appears (differs).
    const img = container.querySelector('.business-document__header img');
    expect(img?.getAttribute('alt')).toBe(longCompany.tradingName);
    expect(within(container).getByText(longCompany.name)).toBeInTheDocument();
    expect(within(container).getByText('Johannesburg, Gauteng 2196')).toBeInTheDocument();
    expect(within(container).getByRole('heading', { name: 'TAX INVOICE' })).toBeInTheDocument();
  });

  it('ships a print stylesheet gated on the printing-business-document body class', () => {
    const css = readFileSync(
      path.join(process.cwd(), 'src/features/businessDocuments/businessDocuments.css'),
      'utf8',
    );
    expect(css).toContain('body.printing-business-document');
    expect(css).toContain('@page');
    expect(css).toContain('size: A4');
    expect(css).toMatch(/thead\s*\{\s*display:\s*table-header-group/);
    expect(css).toContain('break-inside: avoid');
  });
});
