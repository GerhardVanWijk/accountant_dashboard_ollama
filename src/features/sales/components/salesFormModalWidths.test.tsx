import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { CustomerReceiptFormModal } from './CustomerReceiptFormModal';
import { SalesOrderFormModal } from './SalesOrderFormModal';

vi.mock('@/features/tax/hooks/useTaxRates', () => ({ useTaxRates: () => ({ taxRates: [] }) }));
vi.mock('@/features/sales/hooks/useInvoices', () => ({ useInvoices: () => ({ invoices: [], loading: false, error: null, refetch: vi.fn() }) }));
vi.mock('@/features/inventory/hooks/useProducts', () => ({ useProducts: () => ({ products: [] }) }));
vi.mock('@/features/inventory/hooks/useWarehouses', () => ({ useWarehouses: () => ({ warehouses: [] }) }));
vi.mock('@/features/inventory/hooks/useStockBalances', () => ({ useStockBalances: () => ({ balances: [], loading: false, error: null, refetch: vi.fn() }) }));
vi.mock('@/features/inventory/hooks/useStockCommitments', () => ({
  useStockCommitments: () => ({ commitments: new Map(), loading: false, error: null, refetch: vi.fn() }),
}));

function shell() {
  return document.querySelector('[data-slot="form-shell"]') as HTMLElement;
}

/**
 * Document-width audit (docs brief Part T §7). The shared `lg` form width
 * is 72rem — right for a Product / Description / Qty / Price / Tax / Total
 * line grid, dead space for an allocation-only form. Customer Receipt has
 * no line-item grid, so it drops to `md`; Sales Order keeps `lg`.
 */
describe('sales form modal widths', () => {
  it('Customer Receipt modal is "md" (42rem) — no line-item grid', () => {
    render(
      <CustomerReceiptFormModal
        customers={[]}
        invoices={[]}
        defaultReceiptNumber="REC-0002"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(shell().className).toContain('sm:max-w-2xl');
    expect(shell().className).not.toContain('sm:max-w-[72rem]');
  });

  it('Sales Order modal keeps the shared "lg" business-document width (72rem)', () => {
    render(
      <MemoryRouter>
        <SalesOrderFormModal
          title="New sales order"
          customers={[]}
          defaultOrderNumber="SO-2026-0001"
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(shell().className).toContain('sm:max-w-[72rem]');
  });
});
