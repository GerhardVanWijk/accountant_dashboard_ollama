import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { BusinessDocument } from './BusinessDocument';
import { invoiceToBusinessDocument } from '../adapters/invoiceToBusinessDocument';
import { purchaseOrderToBusinessDocument } from '../adapters/purchaseOrderToBusinessDocument';
import * as fx from '../adapters/__fixtures__';

afterEach(cleanup);

describe('BusinessDocument', () => {
  it('falls back to a text wordmark when there is no logo', () => {
    render(<BusinessDocument viewModel={invoiceToBusinessDocument(fx.invoice, fx.ctx())} />);
    expect(screen.getByText('Office National Demo (Pty) Ltd')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders a logo image when a data URL is supplied', () => {
    const vm = invoiceToBusinessDocument(fx.invoice, fx.ctx());
    vm.branding.logoDataUrl = 'data:image/png;base64,AAAA';
    render(<BusinessDocument viewModel={vm} />);
    expect(screen.getByRole('img', { name: 'Office National Demo (Pty) Ltd' })).toBeInTheDocument();
  });

  it('forces a white sheet with dark text even inside a dark-theme wrapper', () => {
    const { container } = render(
      <div data-theme="dark">
        <BusinessDocument viewModel={invoiceToBusinessDocument(fx.invoice, fx.ctx())} />
      </div>,
    );
    const sheet = container.querySelector('.business-document');
    expect(sheet).not.toBeNull();
    expect(sheet?.className).toContain('text-neutral-900');
    // No `dark:` variant anywhere on the sheet.
    expect(sheet?.outerHTML).not.toMatch(/\bdark:/);
  });

  it('renders the recipient block with name and address lines', () => {
    render(<BusinessDocument viewModel={invoiceToBusinessDocument(fx.invoice, fx.ctx())} />);
    expect(screen.getByText('Bill to')).toBeInTheDocument();
    expect(screen.getByText('FreshMart Retail')).toBeInTheDocument();
    expect(screen.getByText('14 Long Street')).toBeInTheDocument();
    expect(screen.getByText('Cape Town, Western Cape 8001')).toBeInTheDocument();
  });

  it('gives the grand total row visual emphasis', () => {
    const { container } = render(
      <BusinessDocument viewModel={invoiceToBusinessDocument(fx.invoice, fx.ctx())} />,
    );
    const totals = container.querySelector('.business-document__totals');
    const emphasised = within(totals as HTMLElement).getByText('Total');
    expect(emphasised.closest('div')?.className).toMatch(/font-bold/);
  });

  it('shows the payment-information block only when the view model has one', () => {
    const { rerender, container } = render(
      <BusinessDocument viewModel={invoiceToBusinessDocument(fx.invoice, fx.ctx())} />,
    );
    expect(container.querySelector('.business-document__payment')).toBeNull();

    rerender(
      <BusinessDocument
        viewModel={invoiceToBusinessDocument(fx.invoice, fx.ctx({ bankAccount: fx.bankAccount }))}
      />,
    );
    expect(container.querySelector('.business-document__payment')).not.toBeNull();
    expect(screen.getByText('First National Bank')).toBeInTheDocument();
  });

  it('renders a purchase order with the supplier heading and no payment block', () => {
    const { container } = render(
      <BusinessDocument viewModel={purchaseOrderToBusinessDocument(fx.purchaseOrder, fx.ctx())} />,
    );
    expect(screen.getByText('Supplier')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'PURCHASE ORDER' })).toBeInTheDocument();
    expect(container.querySelector('.business-document__payment')).toBeNull();
  });
});
