import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import type { DocumentLineItem } from '@/types';
import { DocumentLineTable } from './DocumentLineTable';
import { documentLineColumns } from './documentLineColumns';

afterEach(cleanup);

const PRODUCTS: Record<string, { sku: string; name: string }> = {
  p1: { sku: 'Test001', name: 'HP DeskJet 1200 Printer' },
};

function line(over: Partial<DocumentLineItem> = {}): DocumentLineItem {
  return { id: over.id ?? 'l1', description: '', quantity: 1, unitPrice: 100, taxAmount: 15, lineTotal: 100, ...over };
}

function renderRows(rows: DocumentLineItem[]) {
  return render(
    <DocumentLineTable
      columns={documentLineColumns<DocumentLineItem>({
        resolveProduct: (id) => (id ? PRODUCTS[id] : undefined),
        resolveTaxLabel: () => 'No tax',
      })}
      rows={rows}
      rowKey={(l) => l.id}
    />,
  );
}

describe('documentLineColumns — item / description de-duplication', () => {
  it('shows the product name as the primary item with the SKU beneath it', () => {
    renderRows([line({ productId: 'p1', description: 'HP DeskJet 1200 Printer' })]);
    const [itemCell] = screen.getAllByRole('cell');
    expect(within(itemCell).getByText('HP DeskJet 1200 Printer')).toBeInTheDocument();
    expect(within(itemCell).getByText('Test001')).toBeInTheDocument();
  });

  it('renders a dash in Description when it merely echoes the product name', () => {
    renderRows([line({ productId: 'p1', description: 'HP DeskJet 1200 Printer' })]);
    const cells = screen.getAllByRole('cell');
    // columns: Item, Description, Qty, Unit price, Tax rate, Tax, Total
    expect(cells[1]).toHaveTextContent('—');
    // the name appears once (Item column), not twice
    expect(screen.getAllByText('HP DeskJet 1200 Printer')).toHaveLength(1);
  });

  it('keeps a genuinely different transactional description', () => {
    renderRows([line({ productId: 'p1', description: 'Printer supplied with on-site installation' })]);
    const cells = screen.getAllByRole('cell');
    expect(cells[1]).toHaveTextContent('Printer supplied with on-site installation');
  });

  it('names a service line (no product) in the Item column and dashes the Description', () => {
    renderRows([line({ description: 'Consulting — 4 hours' })]);
    const cells = screen.getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('Consulting — 4 hours');
    expect(cells[1]).toHaveTextContent('—');
  });

  it('with hideItem, the description column always shows the description', () => {
    render(
      <DocumentLineTable
        columns={documentLineColumns<DocumentLineItem>({ hideItem: true, resolveTaxLabel: () => 'No tax' })}
        rows={[line({ description: 'Delivery charge' })]}
        rowKey={(l) => l.id}
      />,
    );
    expect(screen.getAllByRole('cell')[0]).toHaveTextContent('Delivery charge');
  });
});
