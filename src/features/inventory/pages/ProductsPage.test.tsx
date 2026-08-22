import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
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

  afterEach(() => {
    cleanup();
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
    // Uses waitFor(getByText) rather than findByText — confirmed by
    // direct DOM inspection that findByText's own internal polling
    // wasn't reliably catching this render (the row was demonstrably
    // there moments after findByText reported a timeout), while
    // waitFor's explicit poll loop does. ProductsTable's own
    // useAllTaxRates() fetch is a second async hop after products load,
    // so this render genuinely lands a tick later than a single-hop one.
    await waitFor(() => {
      expect(screen.getByText('Test Widget')).toBeInTheDocument();
    });
    expect(screen.getByText('TST-001')).toBeInTheDocument();
  });

  it('flags an item at or below its reorder level as low stock', async () => {
    mockedGetProducts.mockResolvedValue([makeProduct({ quantityOnHand: 5, reorderLevel: 10 })]);
    render(<ProductsPage />);
    await waitFor(() => {
      expect(screen.getByText(/low stock/i)).toBeInTheDocument();
    });
  });
});
