import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { Product, ProductCategory } from '@/types';
import { ProductForm } from './ProductForm';

vi.mock('@/features/tax/hooks/useTaxRates', () => ({
  useTaxRates: () => ({ taxRates: [{ id: 'tax-15', name: 'VAT 15%', rate: 0.15 }] }),
}));

const CATEGORIES: ProductCategory[] = [
  { id: 'cat-furniture', name: 'Furniture', isActive: true, createdAt: '', updatedAt: '' },
  { id: 'cat-printers', name: 'Printers', isActive: true, createdAt: '', updatedAt: '' },
  { id: 'cat-old', name: 'Retired', isActive: false, createdAt: '', updatedAt: '' },
];
vi.mock('../hooks/useProductCategories', () => ({
  useProductCategories: () => ({ categories: CATEGORIES }),
}));

function existing(over: Partial<Product> = {}): Product {
  return {
    id: 'p1', sku: 'FUR-001', name: 'Office Chair', type: 'good',
    unitPrice: 1200, costPrice: 700, trackInventory: true, quantityOnHand: 5, status: 'active',
    categoryId: 'cat-furniture', category: 'Furniture', createdAt: '', updatedAt: '',
    ...over,
  };
}

afterEach(cleanup);

describe('ProductForm — category selector', () => {
  let onSubmit: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    onSubmit = vi.fn().mockResolvedValue(undefined);
  });

  function fill(name = 'Widget', sku = 'W-1') {
    fireEvent.input(screen.getByLabelText('SKU'), { target: { value: sku } });
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: name } });
  }

  it('is a searchable select — not a plain text box', () => {
    render(<ProductForm onSubmit={onSubmit as never} onCancel={() => {}} />);
    const field = screen.getByRole('combobox', { name: 'Category' });
    expect(field).toBeInTheDocument();
    expect(field.tagName).not.toBe('INPUT');
  });

  it('a new product saves the chosen category_id and mirrors its name into the legacy field', async () => {
    render(<ProductForm onSubmit={onSubmit as never} onCancel={() => {}} />);
    fill();
    fireEvent.click(screen.getByRole('combobox', { name: 'Category' }));
    fireEvent.click(screen.getByRole('option', { name: 'Printers' }));
    fireEvent.click(screen.getByRole('button', { name: /save|create|add product/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ categoryId: 'cat-printers', category: 'Printers' });
  });

  it('an edited product restores its existing category on the field', () => {
    render(<ProductForm product={existing()} onSubmit={onSubmit as never} onCancel={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('Furniture');
  });

  it('the "No category" state clears category_id and the legacy text', async () => {
    render(<ProductForm product={existing()} onSubmit={onSubmit as never} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Category' }));
    fireEvent.click(screen.getByRole('option', { name: 'No category' }));
    fireEvent.click(screen.getByRole('button', { name: /save|update|create/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ categoryId: undefined, category: '' });
  });

  it('only lists active categories (plus the current one when editing)', () => {
    render(<ProductForm onSubmit={onSubmit as never} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Category' }));
    expect(screen.getByRole('option', { name: 'Furniture' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Printers' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Retired' })).not.toBeInTheDocument();
  });
});
