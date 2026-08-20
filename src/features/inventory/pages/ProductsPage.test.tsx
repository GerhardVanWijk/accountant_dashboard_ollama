import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Product } from '@/types';
import { ProductsPage } from './ProductsPage';
import { productService } from '../services/productService';

vi.mock('../services/productService', () => ({
  productService: {
    getProducts: vi.fn(),
    getProduct: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
  },
}));

const mockedGetProducts = productService.getProducts as unknown as ReturnType<typeof vi.fn>;

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod_1',
    sku: 'TST-001',
    name: 'Test Widget',
    type: 'good',
    unitPrice: 100,
    costPrice: 40,
    trackInventory: true,
    quantityOnHand: 50,
    reorderLevel: 10,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('ProductsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while products are being fetched', () => {
    mockedGetProducts.mockReturnValue(new Promise(() => {}));
    render(<ProductsPage />);
    expect(screen.getByText(/loading products/i)).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    mockedGetProducts.mockRejectedValue(new Error('Network unreachable'));
    render(<ProductsPage />);
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no products', async () => {
    mockedGetProducts.mockResolvedValue([]);
    render(<ProductsPage />);
    expect(await screen.findByText(/no products yet/i)).toBeInTheDocument();
  });

  it('renders the product directory table once data loads', async () => {
    mockedGetProducts.mockResolvedValue([makeProduct()]);
    render(<ProductsPage />);
    expect(await screen.findByText('Test Widget')).toBeInTheDocument();
    expect(screen.getByText('TST-001')).toBeInTheDocument();
  });

  it('flags an item at or below its reorder level as low stock', async () => {
    mockedGetProducts.mockResolvedValue([makeProduct({ quantityOnHand: 5, reorderLevel: 10 })]);
    render(<ProductsPage />);
    expect(await screen.findByText(/low stock/i)).toBeInTheDocument();
  });
});
