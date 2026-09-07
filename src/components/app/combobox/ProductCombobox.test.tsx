import { useState } from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Product, ProductCategory } from '@/types';
import { useAuthStore } from '@/stores/authStore';

import { ProductCombobox, type ProductComboboxContext } from './ProductCombobox';
import { CustomerCombobox, SupplierCombobox } from './EntityCombobox';

afterEach(() => {
  cleanup();
  useAuthStore.setState({ profile: null, status: 'unauthenticated' });
});

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    sku: 'CON-001',
    name: 'Black Toner Cartridge',
    type: 'good',
    unitPrice: 1249,
    costPrice: 783.08,
    trackInventory: true,
    quantityOnHand: 170,
    status: 'active',
    categoryId: 'cat_con',
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

const CATEGORIES: ProductCategory[] = [
  { id: 'cat_con', name: 'Consumables', isActive: true, createdAt: '', updatedAt: '' },
  { id: 'cat_prn', name: 'Printers', isActive: true, createdAt: '', updatedAt: '' },
];

function Harness(props: {
  products: Product[];
  categories?: ProductCategory[];
  context?: ProductComboboxContext;
  warehouseId?: string;
  onHandFor?: (id: string, wh?: string) => number | undefined;
}) {
  const [v, setV] = useState<string | null>(null);
  return (
    <ProductCombobox
      products={props.products}
      categories={props.categories ?? CATEGORIES}
      context={props.context}
      warehouseId={props.warehouseId}
      onHandFor={props.onHandFor}
      value={v}
      onChange={setV}
    />
  );
}

function open() {
  fireEvent.click(screen.getByRole('combobox', { name: 'Product' }));
}

/** The result row (option) whose visible text contains `name`. */
function row(name: string): HTMLElement {
  const found = screen.getAllByRole('option').find((r) => r.textContent?.includes(name));
  if (!found) throw new Error(`No product row for "${name}"`);
  return found;
}

describe('ProductCombobox — result row', () => {
  it('shows the product NAME as the primary text, plus SKU · category', () => {
    render(<Harness products={[product()]} />);
    open();
    const option = row('Black Toner Cartridge');
    expect(within(option).getByText('Black Toner Cartridge')).toBeInTheDocument();
    expect(within(option).getByText('CON-001 · Consumables')).toBeInTheDocument();
  });

  it('shows on-hand stock and, in sales context, the SELL price — never WAC/cost', () => {
    render(<Harness products={[product()]} context="sales" />);
    open();
    const option = row('Black Toner Cartridge');
    expect(within(option).getByText(/170 on hand/)).toBeInTheDocument();
    expect(within(option).getByText(/1[\s ]?249.*sell price/)).toBeInTheDocument();
    expect(within(option).queryByText(/WAC/)).not.toBeInTheDocument();
    expect(within(option).queryByText(/783/)).not.toBeInTheDocument();
  });

  it('shows "Out of stock" for a tracked product at zero, and nothing for a service line', () => {
    render(
      <Harness
        products={[
          product({ id: 'z', name: 'Empty item', quantityOnHand: 0 }),
          product({ id: 's', name: 'Local delivery', type: 'service', trackInventory: false, quantityOnHand: 0 }),
        ]}
      />,
    );
    open();
    const rows = screen.getAllByRole('option');
    const zero = rows.find((r) => within(r).queryByText('Empty item'))!;
    const service = rows.find((r) => within(r).queryByText('Local delivery'))!;
    expect(within(zero).getByText('Out of stock')).toBeInTheDocument();
    expect(within(service).queryByText(/on hand|out of stock/i)).not.toBeInTheDocument();
  });

  it('uses the warehouse-scoped quantity when a warehouse + lookup are given', () => {
    render(<Harness products={[product({ quantityOnHand: 170 })]} warehouseId="wh_a" onHandFor={() => 12} />);
    open();
    expect(screen.getByText(/12 on hand/)).toBeInTheDocument();
    expect(screen.queryByText(/170 on hand/)).not.toBeInTheDocument();
  });

  it('purchase context hides cost without cost permission', () => {
    render(<Harness products={[product()]} context="purchase" />);
    open();
    expect(within(row('Black Toner Cartridge')).queryByText(/cost/i)).not.toBeInTheDocument();
    expect(within(row('Black Toner Cartridge')).queryByText(/783/)).not.toBeInTheDocument();
  });

  it('purchase context shows cost to a privileged (admin) user', () => {
    useAuthStore.setState({ profile: { role: 'admin' } as never, status: 'authenticated' });
    render(<Harness products={[product()]} context="purchase" />);
    open();
    expect(within(row('Black Toner Cartridge')).getByText(/783.*cost/)).toBeInTheDocument();
  });

  it('inventory context shows WAC to a privileged user, not to an ordinary one', () => {
    render(<Harness products={[product()]} context="inventory" />);
    open();
    expect(within(row('Black Toner Cartridge')).queryByText(/WAC/)).not.toBeInTheDocument();
    cleanup();
    useAuthStore.setState({ profile: { role: 'admin' } as never, status: 'authenticated' });
    render(<Harness products={[product()]} context="inventory" />);
    open();
    expect(within(row('Black Toner Cartridge')).getByText(/783.*WAC/)).toBeInTheDocument();
  });
});

describe('ProductCombobox — search & filter', () => {
  const two = [
    product(),
    product({ id: 'p2', sku: 'PPR-020', name: 'A4 Copy Paper', categoryId: 'cat_prn', barcode: '600123456789' }),
  ];

  it('searches by name, SKU and barcode with the right placeholder', () => {
    render(<Harness products={two} />);
    open();
    const input = screen.getByPlaceholderText('Search products by name, SKU or barcode…');

    fireEvent.change(input, { target: { value: 'copy paper' } });
    expect(screen.queryByText('Black Toner Cartridge')).not.toBeInTheDocument();
    expect(screen.getByText('A4 Copy Paper')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'PPR-020' } });
    expect(screen.getByText('A4 Copy Paper')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '600123456789' } });
    expect(screen.getByText('A4 Copy Paper')).toBeInTheDocument();
  });

  it('the category filter restricts results to products.categoryId', () => {
    render(<Harness products={two} />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Printers' }));
    expect(screen.queryByText('Black Toner Cartridge')).not.toBeInTheDocument();
    expect(screen.getByText('A4 Copy Paper')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Black Toner Cartridge')).toBeInTheDocument();
  });
});

describe('ProductCombobox — selection & custom line', () => {
  it('reports the picked product id and shows its name in the trigger', () => {
    let picked: string | null = 'unset' as unknown as string;
    function H() {
      const [v, setV] = useState<string | null>(null);
      return (
        <ProductCombobox
          products={[product()]}
          categories={CATEGORIES}
          value={v}
          onChange={(id) => {
            picked = id;
            setV(id);
          }}
        />
      );
    }
    render(<H />);
    open();
    fireEvent.click(screen.getByText('Black Toner Cartridge'));
    expect(picked).toBe('p1');
    expect(screen.getByRole('combobox', { name: 'Product' })).toHaveTextContent('Black Toner Cartridge');
  });

  it('the "Custom line" row is set apart and maps to null', () => {
    let received: string | null = 'unset' as unknown as string;
    render(
      <ProductCombobox
        products={[product()]}
        categories={CATEGORIES}
        value="p1"
        onChange={(v) => {
          received = v;
        }}
      />,
    );
    open();
    const custom = screen.getByRole('option', { name: /custom line/i });
    expect(within(custom).getByText('Create a line without an inventory product')).toBeInTheDocument();
    expect(within(custom).queryByText(/on hand/i)).not.toBeInTheDocument();
    fireEvent.click(custom);
    expect(received).toBeNull();
  });

  it('renders the themed, viewport-capped, internally-scrolling popup', () => {
    const { baseElement } = render(<Harness products={[product()]} />);
    open();
    const popup = baseElement.querySelector('[data-slot="combobox-content"]') as HTMLElement | null;
    expect(popup).not.toBeNull();
    expect(popup!.className).toMatch(/max-h-\[min\(20rem,var\(--available-height\)\)\]/);
    expect(baseElement.querySelector('.overflow-y-auto')).not.toBeNull();
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
