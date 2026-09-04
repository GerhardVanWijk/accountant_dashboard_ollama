import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { DocumentLineItem, Product, TaxRate } from '@/types';
import { SalesLineItemsEditor } from './SalesLineItemsEditor';

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

/** Open the ProductCombobox and choose the "Custom line" row. */
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

    pickProduct('Test Widget');

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

    pickProduct('Test Widget');

    const [updated] = onChange.mock.calls[0][0] as DocumentLineItem[];
    expect(updated.taxRateId).toBeUndefined();
  });

  it('choosing "Custom line" clears productId without touching the typed description', () => {
    const products = [makeProduct()];
    const onChange = vi.fn();
    const line = makeLine({ productId: 'prod_1', description: 'Test Widget' });

    render(<SalesLineItemsEditor lineItems={[line]} onChange={onChange} taxRates={[]} products={products} />);

    pickCustomLine();

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

describe('SalesLineItemsEditor stock availability caption (Phase 5A)', () => {
  it('shows On hand / Committed / Available, netting the derived external commitment', () => {
    const products = [makeProduct({ quantityOnHand: 20 })];
    render(
      <SalesLineItemsEditor
        lineItems={[makeLine({ productId: 'prod_1', quantity: 5 })]}
        onChange={vi.fn()}
        taxRates={[]}
        products={products}
        showStockAvailability
        externalCommittedFor={() => 8}
      />,
    );
    // 20 on hand − 8 committed elsewhere = 12 available; ordering 5 is fine.
    expect(screen.getByText(/On hand 20 · Committed 8 · Available 12/)).toBeInTheDocument();
    expect(screen.queryByText(/more than the/)).not.toBeInTheDocument();
  });

  it('warns (without blocking) when a line orders more than available, citing the committed units', () => {
    const products = [makeProduct({ quantityOnHand: 10 })];
    render(
      <SalesLineItemsEditor
        lineItems={[makeLine({ productId: 'prod_1', quantity: 9 })]}
        onChange={vi.fn()}
        taxRates={[]}
        products={products}
        showStockAvailability
        externalCommittedFor={() => 6}
      />,
    );
    // 10 − 6 = 4 available, line orders 9.
    expect(
      screen.getByText(/this line orders 9, more than the 4 available \(6 committed to other confirmed orders\)/),
    ).toBeInTheDocument();
  });

  it('uses warehouse-scoped on-hand (not company-wide) when a line targets a specific warehouse', () => {
    const products = [makeProduct({ quantityOnHand: 100 })]; // company-wide
    const warehouses = [
      { id: 'wh_a', name: 'A', code: 'A', isDefault: true, status: 'active' as const, createdAt: '', updatedAt: '' },
      { id: 'wh_b', name: 'B', code: 'B', isDefault: false, status: 'active' as const, createdAt: '', updatedAt: '' },
    ];
    render(
      <SalesLineItemsEditor
        lineItems={[makeLine({ productId: 'prod_1', quantity: 9, warehouseId: 'wh_b' })]}
        onChange={vi.fn()}
        taxRates={[]}
        products={products}
        warehouses={warehouses}
        showStockAvailability
        externalCommittedFor={() => 0}
        onHandFor={(_p, wh) => (wh === 'wh_b' ? 6 : undefined)}
      />,
    );
    // warehouse B has only 6 on hand -> available 6, orders 9 -> shortage against 6, not 100.
    expect(screen.getByText(/On hand 6 · Committed 0 · Available 6/)).toBeInTheDocument();
    expect(screen.getByText(/this line orders 9, more than the 6 available/)).toBeInTheDocument();
  });

  it('separates "other orders" from "other lines on this order" in the shortage caption', () => {
    const products = [makeProduct({ quantityOnHand: 10 })];
    render(
      <SalesLineItemsEditor
        lineItems={[
          makeLine({ productId: 'prod_1', quantity: 7 }),
          makeLine({ productId: 'prod_1', quantity: 2 }),
        ]}
        onChange={vi.fn()}
        taxRates={[]}
        products={products}
        showStockAvailability
        externalCommittedFor={() => 5}
      />,
    );
    // line 1: on hand 10, external 5 + 2 on the other line here = 7 committed, available 3, orders 7.
    expect(
      screen.getByText(
        /this line orders 7, more than the 3 available \(5 committed to other confirmed orders, 2 to other lines on this order\)/,
      ),
    ).toBeInTheDocument();
  });

  it('no caption when showStockAvailability is off', () => {
    render(
      <SalesLineItemsEditor
        lineItems={[makeLine({ productId: 'prod_1', quantity: 5 })]}
        onChange={vi.fn()}
        taxRates={[]}
        products={[makeProduct()]}
        externalCommittedFor={() => 3}
      />,
    );
    expect(screen.queryByText(/On hand/)).not.toBeInTheDocument();
  });
});
