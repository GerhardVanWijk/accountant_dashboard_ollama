import { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Product } from '@/types';

import { ProductCombobox } from './ProductCombobox';
import { CustomerCombobox, SupplierCombobox } from './EntityCombobox';

afterEach(cleanup);

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    sku: 'CON-001',
    name: 'Black Toner Cartridge',
    type: 'good',
    unitPrice: 999,
    costPrice: 784.2,
    trackInventory: true,
    quantityOnHand: 165,
    status: 'active',
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

describe('ProductCombobox', () => {
  it('searches by SKU and reports the picked product id', () => {
    const products = [product(), product({ id: 'p2', sku: 'PPR-020', name: 'A4 Copy Paper', quantityOnHand: 400 })];
    function Harness() {
      const [v, setV] = useState<string | null>(null);
      return <ProductCombobox products={products} value={v} onChange={setV} />;
    }
    render(<Harness />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Product' }));
    fireEvent.change(screen.getByPlaceholderText(/search sku/i), { target: { value: 'PPR-020' } });
    expect(screen.queryByText(/Black Toner Cartridge/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/A4 Copy Paper/));
    expect(screen.getByRole('combobox', { name: 'Product' })).toHaveTextContent('PPR-020 · A4 Copy Paper');
  });

  it('shows live stock in the row', () => {
    render(<ProductCombobox products={[product()]} value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Product' }));
    expect(screen.getByText(/On hand: 165/)).toBeInTheDocument();
  });

  it('maps the "Custom line" choice to null', () => {
    let received: string | null = 'unset' as unknown as string;
    render(
      <ProductCombobox
        products={[product()]}
        value="p1"
        onChange={(v) => {
          received = v;
        }}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Product' }));
    fireEvent.click(screen.getByRole('option', { name: /custom line/i }));
    expect(received).toBeNull();
  });
});

describe('EntityCombobox', () => {
  it('CustomerCombobox filters by customer number', () => {
    const customers = [
      { id: 'c1', customerNumber: 'CUS-1042', name: 'ABC Traders', currency: 'ZAR', balance: 0, status: 'active', createdAt: '', updatedAt: '' },
      { id: 'c2', customerNumber: 'CUS-2001', name: 'Zenith Retail', currency: 'ZAR', balance: 0, status: 'active', createdAt: '', updatedAt: '' },
    ] as unknown as Parameters<typeof CustomerCombobox>[0]['customers'];
    render(<CustomerCombobox customers={customers} value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Customer' }));
    fireEvent.change(screen.getByPlaceholderText(/search name/i), { target: { value: 'CUS-2001' } });
    expect(screen.queryByText('ABC Traders')).not.toBeInTheDocument();
    expect(screen.getByText('Zenith Retail')).toBeInTheDocument();
  });

  it('SupplierCombobox renders the "Supplier · SUP-xxxx" subtitle', () => {
    const suppliers = [
      { id: 's1', supplierNumber: 'SUP-3012', name: 'PrintTech Distributors', currency: 'ZAR', balance: 0, status: 'active', createdAt: '', updatedAt: '' },
    ] as unknown as Parameters<typeof SupplierCombobox>[0]['suppliers'];
    render(<SupplierCombobox suppliers={suppliers} value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Supplier' }));
    expect(screen.getByText('Supplier · SUP-3012')).toBeInTheDocument();
  });
});
