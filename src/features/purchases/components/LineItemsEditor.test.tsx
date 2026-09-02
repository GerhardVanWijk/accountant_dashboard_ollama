import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { DocumentLineItem, Product, TaxRate } from '@/types';
import { LineItemsEditor } from './LineItemsEditor';

afterEach(cleanup);

/** Open the ProductCombobox and click the row whose visible text matches. */
function pickProduct(match: RegExp | string) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Product' }));
  const rows = screen.getAllByRole('option');
  const target = rows.find((r) =>
    typeof match === 'string' ? r.textContent?.includes(match) : match.test(r.textContent ?? ''),
  );
  if (!target) throw new Error(`No product row matching ${match}`);
  fireEvent.click(target);
}

function pickCustomLine() {
  fireEvent.click(screen.getByRole('combobox', { name: 'Product' }));
  fireEvent.click(screen.getByRole('option', { name: /custom line/i }));
}

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

    pickProduct('Test Widget');

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

    pickCustomLine();

    const [updated] = onChange.mock.calls[0][0] as DocumentLineItem[];
    expect(updated.productId).toBeUndefined();
    expect(updated.description).toBe('Test Widget');
  });
});

/**
 * Bill-only fixed-asset capitalization toggle (docs/KNOWN_ISSUES.md: "No
 * Bill-line capitalization path into the Fixed Asset Register") — only
 * rendered when allowFixedAssetCapitalization is true (BillForm passes it,
 * PurchaseOrderForm doesn't).
 */
describe('Purchases LineItemsEditor fixed-asset capitalization', () => {
  it('does not render the Asset column when allowFixedAssetCapitalization is unset', () => {
    render(<LineItemsEditor lineItems={[makeLine()]} onChange={vi.fn()} taxRates={[]} />);
    expect(screen.queryByLabelText('Capitalize as fixed asset')).not.toBeInTheDocument();
  });

  it('checking the Asset toggle sets fixedAssetDetails and clears productId', () => {
    const onChange = vi.fn();
    const line = makeLine({ productId: 'prod_1' });

    render(
      <LineItemsEditor lineItems={[line]} onChange={onChange} taxRates={[]} allowFixedAssetCapitalization />,
    );

    fireEvent.click(screen.getByLabelText('Capitalize as fixed asset'));

    const [updated] = onChange.mock.calls[0][0] as DocumentLineItem[];
    expect(updated.productId).toBeUndefined();
    expect(updated.fixedAssetDetails).toMatchObject({
      category: 'other',
      usefulLifeYears: 5,
      depreciationMethod: 'straight_line',
      residualValue: 0,
    });
  });

  it('unchecking the Asset toggle clears fixedAssetDetails', () => {
    const onChange = vi.fn();
    const line = makeLine({
      fixedAssetDetails: { category: 'motor_vehicles', usefulLifeYears: 5, depreciationMethod: 'straight_line', residualValue: 0 },
    });

    render(
      <LineItemsEditor lineItems={[line]} onChange={onChange} taxRates={[]} allowFixedAssetCapitalization />,
    );

    fireEvent.click(screen.getByLabelText('Capitalize as fixed asset'));

    const [updated] = onChange.mock.calls[0][0] as DocumentLineItem[];
    expect(updated.fixedAssetDetails).toBeUndefined();
  });

  it('shows the expanded asset detail fields only while fixedAssetDetails is set', () => {
    const line = makeLine({
      fixedAssetDetails: { category: 'motor_vehicles', usefulLifeYears: 5, depreciationMethod: 'straight_line', residualValue: 0 },
    });

    render(<LineItemsEditor lineItems={[line]} onChange={vi.fn()} taxRates={[]} allowFixedAssetCapitalization />);

    expect(screen.getByText('Useful Life (Years)')).toBeInTheDocument();
    expect(screen.getByText('Depreciation Method')).toBeInTheDocument();
  });

  it('picking a category prefills the SARS wear-and-tear rate default', () => {
    const onChange = vi.fn();
    const line = makeLine({
      fixedAssetDetails: { category: 'other', usefulLifeYears: 5, depreciationMethod: 'straight_line', residualValue: 0 },
    });

    render(<LineItemsEditor lineItems={[line]} onChange={onChange} taxRates={[]} allowFixedAssetCapitalization />);

    fireEvent.change(screen.getByDisplayValue('Other'), { target: { value: 'computer_equipment' } });

    const [updated] = onChange.mock.calls[0][0] as DocumentLineItem[];
    expect(updated.fixedAssetDetails?.category).toBe('computer_equipment');
    expect(updated.fixedAssetDetails?.taxWearTearRatePercent).toBeCloseTo(33.3, 1);
  });

  it('disables the Product select while the asset toggle is on, and vice versa', () => {
    const products = [makeProduct()];
    const assetLine = makeLine({
      fixedAssetDetails: { category: 'other', usefulLifeYears: 5, depreciationMethod: 'straight_line', residualValue: 0 },
    });

    render(
      <LineItemsEditor lineItems={[assetLine]} onChange={vi.fn()} taxRates={[]} products={products} allowFixedAssetCapitalization />,
    );

    expect(screen.getByRole('combobox', { name: 'Product' })).toBeDisabled();
    expect(screen.getByLabelText('Capitalize as fixed asset')).not.toBeDisabled();
  });
});
