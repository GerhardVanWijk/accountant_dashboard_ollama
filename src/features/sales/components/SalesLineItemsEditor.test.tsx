import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { DocumentLineItem, Product, TaxRate } from '@/types';
import { SalesLineItemsEditor } from './SalesLineItemsEditor';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod_1',
    sku: 'TST-001',
    name: 'Test Widget',
    type: 'good',
    unitPrice: 150,
    costPrice: 90,
    trackInventory: true,
    quantityOnHand: 20,
    status: 'active',
    taxRateId: 'tax_std',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTaxRate(overrides: Partial<TaxRate> = {}): TaxRate {
  return {
    id: 'tax_std',
    code: 'STD',
    name: 'Standard Rate',
    rate: 15,
    treatment: 'standard_rated',
    appliesTo: 'both',
    isActive: true,
    effectiveFrom: '2018-04-01',
    jurisdiction: 'ZA',
    sourceReference: 'test fixture',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeLine(overrides: Partial<DocumentLineItem> = {}): DocumentLineItem {
  return {
    id: 'li_1',
    description: '',
    quantity: 1,
    unitPrice: 0,
    taxAmount: 0,
    lineTotal: 0,
    ...overrides,
  };
}

/**
 * v0-styled re-skin of the former LineItemsEditor.test.tsx (M13) — moved
 * onto SalesLineItemsEditor now that it's the one production component used
 * by every Sales form (Invoice/Credit Note/Quote/Sales Order); the plain
 * LineItemsEditor has no remaining production importer and was deleted
 * alongside this rename. Covers the fix for the gap flagged 2026-08-22: no
 * line-item editor in the app let a user select a product, so `productId`
 * could never be set from real UI input — InventoryPostingAdapter's Cost of
 * Sales/capitalization logic was only reachable via seed data or direct
 * service calls. See docs/KNOWN_ISSUES.md.
 */
describe('SalesLineItemsEditor product picker', () => {
  it('selecting a product sets productId and pre-fills description/unit price/tax rate', () => {
    const products = [makeProduct()];
    const taxRates = [makeTaxRate()];
    const onChange = vi.fn();

    render(
      <SalesLineItemsEditor lineItems={[makeLine()]} onChange={onChange} taxRates={taxRates} products={products} />,
    );

    fireEvent.change(screen.getByLabelText('Product'), { target: { value: 'prod_1' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [updated] = onChange.mock.calls[0][0] as DocumentLineItem[];
    expect(updated.productId).toBe('prod_1');
    expect(updated.description).toBe('Test Widget');
    expect(updated.unitPrice).toBe(150); // sales editor uses unitPrice, not costPrice
    expect(updated.taxRateId).toBe('tax_std');
    expect(updated.lineTotal).toBe(150); // recomputed from the new quantity/unitPrice
    expect(updated.taxAmount).toBeCloseTo(22.5);
  });

  it('does not set a taxRateId the passed-in tax rates do not contain', () => {
    const products = [makeProduct({ taxRateId: 'tax_unknown' })];
    const onChange = vi.fn();

    render(<SalesLineItemsEditor lineItems={[makeLine()]} onChange={onChange} taxRates={[]} products={products} />);

    fireEvent.change(screen.getByLabelText('Product'), { target: { value: 'prod_1' } });

    const [updated] = onChange.mock.calls[0][0] as DocumentLineItem[];
    expect(updated.taxRateId).toBeUndefined();
  });

  it('choosing "Custom line" clears productId without touching the typed description', () => {
    const products = [makeProduct()];
    const onChange = vi.fn();
    const line = makeLine({ productId: 'prod_1', description: 'Test Widget' });

    render(<SalesLineItemsEditor lineItems={[line]} onChange={onChange} taxRates={[]} products={products} />);

    fireEvent.change(screen.getByLabelText('Product'), { target: { value: '' } });

    const [updated] = onChange.mock.calls[0][0] as DocumentLineItem[];
    expect(updated.productId).toBeUndefined();
    expect(updated.description).toBe('Test Widget');
  });

  it('a line added via "Add line" has no productId until a product is chosen', () => {
    const onChange = vi.fn();
    render(<SalesLineItemsEditor lineItems={[]} onChange={onChange} taxRates={[]} products={[makeProduct()]} />);

    fireEvent.click(screen.getByText('Add line'));

    const [added] = onChange.mock.calls[0][0] as DocumentLineItem[];
    expect(added.productId).toBeUndefined();
  });
});
