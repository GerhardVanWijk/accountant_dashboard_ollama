import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { Product, ProductCategory } from '@/types';
import { InventoryItemDetailSheet } from './InventoryItemDetailSheet';

vi.mock('@/services/auditLogService', () => ({
  auditLogService: { getForRecord: vi.fn().mockResolvedValue([]) },
}));

const product = (o: Partial<Product> = {}): Product =>
  ({
    id: 'p1',
    sku: 'DESK-1',
    name: 'Oak desk',
    type: 'good',
    unitPrice: 200,
    costPrice: 120,
    trackInventory: true,
    quantityOnHand: 12,
    reorderLevel: 4,
    status: 'active',
    createdAt: '',
    updatedAt: '',
    ...o,
  }) as Product;

function renderSheet(overrides: Partial<Parameters<typeof InventoryItemDetailSheet>[0]> = {}) {
  return render(
    <InventoryItemDetailSheet
      product={product()}
      movements={[]}
      balances={[]}
      warehouses={[]}
      categories={[]}
      suppliers={[]}
      taxRates={[]}
      open
      onOpenChange={vi.fn()}
      {...overrides}
    />,
  );
}

afterEach(cleanup);

describe('InventoryItemDetailSheet', () => {
  it('renders the header and the Overview tab by default', () => {
    renderSheet();
    expect(screen.getByText('DESK-1 — Oak desk')).toBeInTheDocument();
    expect(screen.getByText('Weighted average')).toBeInTheDocument(); // valuation method on Overview
  });

  it('exposes all eight tabs', () => {
    renderSheet();
    for (const label of ['Overview', 'Stock', 'Purchasing', 'Sales', 'Transactions', 'Accounting', 'Documents', 'Audit']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
  });

  it('the Accounting tab shows the semantic account mapping including Purchase Price Variance', async () => {
    
    renderSheet();
    fireEvent.click(screen.getByRole('tab', { name: 'Accounting' }));
    expect(screen.getByText('Inventory Asset')).toBeInTheDocument();
    expect(screen.getByText('Cost of Goods Sold')).toBeInTheDocument();
    expect(screen.getByText('Purchase Price Variance')).toBeInTheDocument();
    expect(screen.getAllByText(/Standard — 1200 Inventory/).length).toBeGreaterThanOrEqual(1);
  });

  it('the Accounting tab reflects a product-specific override', async () => {
    
    renderSheet({ product: product({ inventoryAccountId: 'acc-x' }) });
    fireEvent.click(screen.getByRole('tab', { name: 'Accounting' }));
    expect(screen.getByText('Product-specific account override')).toBeInTheDocument();
  });

  it('the Accounting tab reflects a category default', async () => {
    
    const categories: ProductCategory[] = [
      { id: 'c1', name: 'Furniture', isActive: true, cogsAccountId: 'acc-c', createdAt: '', updatedAt: '' } as ProductCategory,
    ];
    renderSheet({ product: product({ categoryId: 'c1' }), categories });
    fireEvent.click(screen.getByRole('tab', { name: 'Accounting' }));
    expect(screen.getByText('Category default (Furniture)')).toBeInTheDocument();
  });

  it('shows a not-found state without a product', () => {
    renderSheet({ product: undefined });
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });
});
