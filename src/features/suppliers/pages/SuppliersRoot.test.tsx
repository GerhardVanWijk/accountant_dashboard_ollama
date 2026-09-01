import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { SuppliersRoot } from './SuppliersRoot';

vi.mock('../hooks/useSuppliers', () => ({
  useSuppliers: () => ({
    suppliers: [
      { id: 's1', supplierNumber: 'SUP-1', name: 'Paper Mills Ltd', currency: 'ZAR', balance: 0, status: 'active', createdAt: '', updatedAt: '' },
    ],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('./SupplierListPage', () => ({
  SupplierListPage: ({ onView }: { onView: (id: string) => void }) => (
    <div>
      <p>supplier list</p>
      <button onClick={() => onView('s1')}>row: Paper Mills Ltd</button>
    </div>
  ),
}));

vi.mock('../components/SupplierDetailSheet', () => ({
  SupplierDetailSheet: ({ supplierId, open, onOpenChange }: { supplierId?: string; open: boolean; onOpenChange: (o: boolean) => void }) =>
    open ? (
      <div role="dialog" aria-label="supplier detail">
        <p>detail for {supplierId}</p>
        <button onClick={() => onOpenChange(false)}>close</button>
      </div>
    ) : null,
}));

vi.mock('./SupplierFormPage', () => ({ SupplierFormPage: () => <div>supplier form</div> }));

function Probe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/purchases/vendors" element={<><SuppliersRoot /><Probe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('SuppliersRoot — ?record= deep linking', () => {
  it('opens the existing supplier detail sheet when ?record=<id> is present', () => {
    renderAt('/purchases/vendors?record=s1');
    expect(screen.getByRole('dialog', { name: 'supplier detail' })).toBeInTheDocument();
    expect(screen.getByText('detail for s1')).toBeInTheDocument();
  });

  it('shows the plain list with no sheet when the parameter is absent', () => {
    renderAt('/purchases/vendors');
    expect(screen.getByText('supplier list')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'supplier detail' })).not.toBeInTheDocument();
  });

  it('sets ?record= from a list row and clears it when the sheet closes', () => {
    renderAt('/purchases/vendors');
    fireEvent.click(screen.getByText('row: Paper Mills Ltd'));
    expect(screen.getByTestId('loc')).toHaveTextContent('/purchases/vendors?record=s1');

    fireEvent.click(screen.getByText('close'));
    expect(screen.getByTestId('loc')).toHaveTextContent('/purchases/vendors');
    expect(screen.getByTestId('loc').textContent).not.toContain('record=');
  });
});
