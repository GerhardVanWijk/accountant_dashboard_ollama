import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ProductCategory } from '@/types';
import { CategoriesPage } from './CategoriesPage';

vi.mock('@/features/auth/hooks/useCanAccess', () => ({ useCanAccess: vi.fn(() => true) }));
vi.mock('@/features/accounting/hooks/useAccounts', () => ({ useAccounts: () => ({ accounts: [] }) }));
vi.mock('@/features/tax/hooks/useTaxRates', () => ({ useAllTaxRates: () => ({ taxRates: [] }) }));
vi.mock('../hooks/useProducts', () => ({
  useProducts: () => ({ products: [{ id: 'p1', categoryId: 'c1' }, { id: 'p2', categoryId: undefined }] }),
}));

const catHook = vi.fn();
vi.mock('../hooks/useProductCategories', () => ({ useProductCategories: () => catHook() }));

const cat = (o: Partial<ProductCategory>): ProductCategory =>
  ({ id: 'c1', name: 'Furniture', isActive: true, createdAt: '', updatedAt: '', ...o }) as ProductCategory;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/categories']}>
      <CategoriesPage />
    </MemoryRouter>,
  );
}

describe('CategoriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catHook.mockReturnValue({
      categories: [cat({ id: 'c1', name: 'Furniture', inventoryAccountId: 'acc' }), cat({ id: 'c2', name: 'Stationery' })],
      loading: false,
      error: null,
      refetch: vi.fn(),
      createCategory: vi.fn(),
      updateCategory: vi.fn(),
      deleteCategory: vi.fn(),
    });
  });
  afterEach(cleanup);

  it('lists categories with product counts and mapping status', () => {
    renderPage();
    expect(screen.getByText('Furniture')).toBeInTheDocument();
    expect(screen.getByText('Stationery')).toBeInTheDocument();
    expect(screen.getByText('1 of 4')).toBeInTheDocument(); // Furniture has one mapped account
  });

  it('shows the summary strip figures', () => {
    renderPage();
    expect(screen.getByText('Uncategorised products')).toBeInTheDocument();
    expect(screen.getByText('With account mappings')).toBeInTheDocument();
  });

  it('shows the empty state', () => {
    catHook.mockReturnValue({
      categories: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
      createCategory: vi.fn(),
      updateCategory: vi.fn(),
      deleteCategory: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/no categories yet/i)).toBeInTheDocument();
  });

  it('opens the create form with the account-mapping section', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /new category/i }));
    await waitFor(() => {
      expect(screen.getByText('New product category')).toBeInTheDocument();
    });
    // "Account mappings" is both a table column header and the form section legend
    expect(screen.getByRole('group', { name: 'Account mappings' })).toBeInTheDocument();
    expect(screen.getByLabelText('Inventory asset')).toBeInTheDocument();
  });
});
