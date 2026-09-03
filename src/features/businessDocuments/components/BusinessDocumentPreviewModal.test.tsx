import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { BusinessDocumentPreviewModal } from './BusinessDocumentPreviewModal';
import { invoiceToBusinessDocument } from '../adapters/invoiceToBusinessDocument';
import * as fx from '../adapters/__fixtures__';

const vm = invoiceToBusinessDocument(fx.invoice, fx.ctx({ bankAccount: fx.bankAccount }));

beforeEach(() => {
  vi.stubGlobal('print', vi.fn());
});

afterEach(() => {
  cleanup();
  document.body.classList.remove('printing-business-document');
  vi.unstubAllGlobals();
});

describe('BusinessDocumentPreviewModal', () => {
  it('renders the toolbar and the sheet when open', () => {
    render(<BusinessDocumentPreviewModal open onClose={vi.fn()} viewModel={vm} />);
    expect(screen.getByText('Document preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Print \/ Save PDF/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TAX INVOICE' })).toBeInTheDocument();
  });

  it('the Print button toggles the body class and calls window.print', () => {
    render(<BusinessDocumentPreviewModal open onClose={vi.fn()} viewModel={vm} />);
    fireEvent.click(screen.getByRole('button', { name: /Print \/ Save PDF/ }));
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(document.body.classList.contains('printing-business-document')).toBe(true);
    window.dispatchEvent(new Event('afterprint'));
    expect(document.body.classList.contains('printing-business-document')).toBe(false);
  });

  it('swaps document.title to the document number for the print, then restores it on afterprint', () => {
    const original = 'Accounting Suite';
    document.title = original;
    render(<BusinessDocumentPreviewModal open onClose={vi.fn()} viewModel={vm} />);
    fireEvent.click(screen.getByRole('button', { name: /Print \/ Save PDF/ }));
    expect(document.title).toBe('INV-2026-1072');
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe(original);
  });

  it('tells the user how to get a clean PDF, outside the printable sheet', () => {
    render(<BusinessDocumentPreviewModal open onClose={vi.fn()} viewModel={vm} />);
    const tip = screen.getByText(/turn off .Headers and footers./i);
    expect(tip).toBeInTheDocument();
    // The helper text must never sit inside the printed document subtree.
    expect(tip.closest('.business-document')).toBeNull();
    expect(tip.closest('.business-document-modal__toolbar')).not.toBeNull();
  });

  it('Close calls onClose', () => {
    const onClose = vi.fn();
    render(<BusinessDocumentPreviewModal open onClose={onClose} viewModel={vm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a loading state and disables Print while loading', () => {
    render(<BusinessDocumentPreviewModal open onClose={vi.fn()} viewModel={null} loading />);
    expect(screen.getByRole('status')).toHaveTextContent(/Preparing document/i);
    expect(screen.getByRole('button', { name: /Print \/ Save PDF/ })).toBeDisabled();
  });

  it('shows an error state', () => {
    render(
      <BusinessDocumentPreviewModal open onClose={vi.fn()} viewModel={null} error="Could not load the company." />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the company.');
  });
});
