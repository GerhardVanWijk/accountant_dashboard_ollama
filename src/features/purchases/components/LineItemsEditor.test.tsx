import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { DocumentLineItem, Product, TaxRate } from '@/types';
import { LineItemsEditor } from './LineItemsEditor';

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
 * Companion to src/features/sales/components/LineItemsEditor.test.tsx —
 * same gap (docs/KNOWN_ISSUES.md), same fix, but this side pre-fills from
 * `costPrice` (what we pay a supplier) rather than `unitPrice` (what we
 * charge a customer), since this editor is shared by Purchase Order and
 * Bill forms.
 */
describe('Purchases LineItemsEditor product picker', () => {
  it('selecting a product sets productId and pre-fills description/cost price/tax rate', () => {
    const products = [makeProduct()];
    const taxRates = [makeTaxRate()];
    const onChange = vi.fn();

    render(
      <LineItemsEditor lineItems={[makeLine()]} onChange={onChange} taxRates={taxRates} products={products} />,
    );

    fireEvent.change(screen.getByLabelText('Product'), { target: { value: 'prod_1' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [updated] = onChange.mock.calls[0][0] as DocumentLineItem[];
    expect(updated.productId).toBe('prod_1');
    expect(updated.description).toBe('Test Widget');
    expect(updated.unitPrice).toBe(90); // purchases editor uses costPrice, not unitPrice
    expect(updated.taxRateId).toBe('tax_std');
  });

  it('choosing "Custom line" clears productId without touching the typed description', () => {
    const products = [makeProduct()];
    const onChange = vi.fn();
    const line = makeLine({ productId: 'prod_1', description: 'Test Widget' });

    render(<LineItemsEditor lineItems={[line]} onChange={onChange} taxRates={[]} products={products} />);

    fireEvent.change(screen.getByLabelText('Product'), { target: { value: '' } });

    const [updated] = onChange.mock.calls[0][0] as DocumentLineItem[];
    expect(updated.productId).toBeUndefined();
    expect(updated.description).toBe('Test Widget');
  });
});
