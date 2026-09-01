import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import type { Product, ProductCategory, StockBalance, Supplier, Warehouse } from '@/types';
import { InventoryTable } from './InventoryTable';

const product = (o: Partial<Product>): Product =>
  ({
    id: o.id ?? 'p',
    sku: 'SKU',
    name: 'Item',
    type: 'good',
    unitPrice: 100,
    costPrice: 50,
    trackInventory: true,
    quantityOnHand: 10,
    status: 'active',
    createdAt: '',
    updatedAt: '',
    ...o,
  }) as Product;
const warehouse = (o: Partial<Warehouse>): Warehouse =>
  ({ id: 'w1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '', ...o }) as Warehouse;
const balances: StockBalance[] = [];
const categories: ProductCategory[] = [
  { id: 'c1', name: 'Furniture', isActive: true, createdAt: '', updatedAt: '' } as ProductCategory,
];
const suppliers: Supplier[] = [
  { id: 's1', name: 'Acme', supplierNumber: 'S1', currency: 'ZAR', balance: 0, status: 'active', createdAt: '', updatedAt: '' } as Supplier,
];

afterEach(cleanup);

const rows = [
  product({ id: 'a', sku: 'AAA-1', name: 'Oak desk', categoryId: 'c1', preferredSupplierId: 's1', quantityOnHand: 25 }),
  product({ id: 'b', sku: 'BBB-2', name: 'Stapler', quantityOnHand: 0 }),
  product({ id: 'c', sku: 'CCC-3', name: 'Chair', categoryId: 'c1', quantityOnHand: 3, reorderLevel: 5 }),
];

function renderTable(props: Partial<Parameters<typeof InventoryTable>[0]> = {}) {
  return render(
    <InventoryTable
      products={rows}
      balances={balances}
      categories={categories}
      suppliers={suppliers}
      warehouses={[warehouse({})]}
      onSelect={vi.fn()}
      {...props}
    />,
  );
}

describe('InventoryTable', () => {
  it('renders a row per product with SKU, name and stock-state markers', () => {
    renderTable();
    expect(screen.getByText('Oak desk')).toBeInTheDocument();
    expect(screen.getByText('Stapler')).toBeInTheDocument();
    expect(screen.getByText('AAA-1')).toBeInTheDocument();
    expect(screen.getByText('Out')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('opens a product on row click', () => {
    const onSelect = vi.fn();
    renderTable({ onSelect });
    fireEvent.click(screen.getByRole('button', { name: 'Open Oak desk' }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('searches by SKU or name', () => {
    renderTable();
    fireEvent.change(screen.getByLabelText('Search SKU or name'), { target: { value: 'chair' } });
    expect(screen.getByText('Chair')).toBeInTheDocument();
    expect(screen.queryByText('Oak desk')).not.toBeInTheDocument();
  });

  it('shows the empty state with no products', () => {
    renderTable({ products: [], balances: [], categories: [], suppliers: [] });
    expect(screen.getByText('No products')).toBeInTheDocument();
  });

  it('does not offer a warehouse filter with a single warehouse', () => {
    renderTable();
    expect(screen.queryByLabelText('All warehouses')).not.toBeInTheDocument();
  });

  it('offers category, supplier and stock-level filters', () => {
    renderTable();
    expect(screen.getByLabelText('All categories')).toBeInTheDocument();
    expect(screen.getByLabelText('All suppliers')).toBeInTheDocument();
    expect(screen.getByLabelText('Any stock level')).toBeInTheDocument();
  });

  it('resolves the category and supplier name columns', () => {
    renderTable({ products: [rows[0]] });
    const table = screen.getByRole('table');
    expect(within(table).getByText('Furniture')).toBeInTheDocument();
    expect(within(table).getByText('Acme')).toBeInTheDocument();
  });

  it('demotes the lower-priority columns to xl-only so mid-size laptops stay scroll-free', () => {
    renderTable();
    const columnHeader = (name: RegExp) => screen.getByRole('columnheader', { name });
    // Priority columns are always visible on desktop.
    expect(columnHeader(/^SKU/).className).not.toMatch(/hidden/);
    expect(columnHeader(/^Product/).className).not.toMatch(/hidden/);
    expect(columnHeader(/Inventory value/i).className).not.toMatch(/hidden/);
    expect(columnHeader(/^Status/).className).not.toMatch(/hidden/);
    // Lower-priority columns only appear at xl (also on the item detail sheet).
    for (const name of [/Preferred supplier/i, /Committed/i, /^Reorder/i]) {
      expect(columnHeader(name).className).toMatch(/xl:table-cell/);
    }
  });
});
