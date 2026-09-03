import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import {
  DocumentLineTable,
  RecordActionBar,
  RecordPageShell,
  useLegacyRecordRedirect,
} from './index';

afterEach(cleanup);

describe('RecordActionBar — clear action hierarchy', () => {
  it('renders primary, secondary and inline danger; folds extra danger + overflow into "More"', async () => {
    render(
      <RecordActionBar
        primary={{ label: 'Convert to invoice', onClick: vi.fn() }}
        secondary={[{ label: 'Confirm order', onClick: vi.fn() }]}
        danger={[
          { label: 'Cancel order', onClick: vi.fn() },
          { label: 'Delete draft', onClick: vi.fn() },
        ]}
        overflow={[{ label: 'Download PDF', onClick: vi.fn() }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Convert to invoice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm order' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument();
    // Second danger action + overflow are behind "More", not loose buttons.
    expect(screen.queryByRole('button', { name: 'Delete draft' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'Delete draft' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Download PDF' })).toBeInTheDocument();
    });
  });

  it('renders nothing when it has no actions', () => {
    const { container } = render(<RecordActionBar />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('DocumentLineTable', () => {
  interface Line { id: string; description: string; total: number }
  const columns = [
    { key: 'description', header: 'Description', cell: (l: Line) => l.description },
    { key: 'total', header: 'Total', align: 'right' as const, cell: (l: Line) => l.total.toFixed(2) },
  ];

  it('renders rows and totals, and keeps horizontal scroll inside its own wrapper', () => {
    const { container } = render(
      <DocumentLineTable
        columns={columns}
        rows={[{ id: 'a', description: 'Widget', total: 10 }]}
        rowKey={(l) => l.id}
        totals={[{ label: 'Total', value: 'R10.00', emphasis: true }]}
      />,
    );
    expect(screen.getByText('Widget')).toBeInTheDocument();
    expect(screen.getByText('R10.00')).toBeInTheDocument();
    expect(container.querySelector('.overflow-x-auto')).not.toBeNull();
  });

  it('shows an empty message when there are no lines', () => {
    render(<DocumentLineTable columns={columns} rows={[]} rowKey={(l: Line) => l.id} emptyMessage="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
});

describe('RecordPageShell', () => {
  it('renders a breadcrumb, a back link, and the not-found state', () => {
    render(
      <MemoryRouter>
        <RecordPageShell
          breadcrumbs={[{ label: 'Sales' }, { label: 'Sales orders', to: '/sales/orders' }, { label: 'SO-1' }]}
          backTo="/sales/orders"
          backLabel="Sales orders"
          state="not-found"
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Sales orders' })).toHaveAttribute('href', '/sales/orders');
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });

  it('embedded (inside RelatedRecordPreview) drops the breadcrumb + back link chrome', () => {
    render(
      <MemoryRouter>
        <RecordPageShell
          breadcrumbs={[{ label: 'Sales' }, { label: 'Invoices', to: '/sales/invoices' }, { label: 'INV-1' }]}
          backTo="/sales/invoices"
          backLabel="Invoices"
          state="ready"
          embedded
        >
          <p>embedded body</p>
        </RecordPageShell>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back to Invoices' })).not.toBeInTheDocument();
    expect(screen.getByText('embedded body')).toBeInTheDocument();
  });
});

describe('useLegacyRecordRedirect', () => {
  function Harness() {
    useLegacyRecordRedirect('/sales/orders');
    return <div>list</div>;
  }
  function Loc() {
    const loc = useLocation();
    return <div data-testid="loc">{loc.pathname + loc.search}</div>;
  }

  it('redirects /sales/orders?record=<id> to /sales/orders/<id>', async () => {
    render(
      <MemoryRouter initialEntries={['/sales/orders?record=so_9']}>
        <Routes>
          <Route path="/sales/orders" element={<Harness />} />
          <Route path="/sales/orders/:id" element={<Loc />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/sales/orders/so_9'));
  });

  it('leaves a plain list URL alone', () => {
    render(
      <MemoryRouter initialEntries={['/sales/orders']}>
        <Routes>
          <Route path="/sales/orders" element={<><Harness /><Loc /></>} />
          <Route path="/sales/orders/:id" element={<Loc />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('loc')).toHaveTextContent('/sales/orders');
  });
});
