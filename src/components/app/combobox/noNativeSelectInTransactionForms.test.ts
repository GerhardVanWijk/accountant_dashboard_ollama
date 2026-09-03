import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Application-wide extension of the Increment-1 inventory dropdown guard
 * (src/features/inventory/components/noNativeSelect.test.ts): the sales
 * and purchases transaction forms must not reintroduce a native
 * `<select>` / `<NativeSelect>`. Its option menu renders in the browser's
 * own light chrome (white / mint selected row, bright-blue hover) that
 * `<option>` cannot be themed past and whose popup direction is
 * uncontrolled. Small enums use `EnumSelect`; product / customer /
 * supplier / invoice pickers use `SearchableSelect` / a `*Combobox` — all
 * render the dark, viewport-constrained Vertex popup.
 */
const MIGRATED_FORMS: string[] = [
  'src/features/sales/components/SalesLineItemsEditor.tsx',
  'src/features/sales/components/CreditNoteForm.tsx',
  'src/features/sales/components/CustomerReceiptForm.tsx',
  'src/features/sales/components/AllocationForm.tsx',
  'src/features/purchases/components/LineItemsEditor.tsx',
  'src/features/purchases/components/PaymentForm.tsx',
];

describe('no native <select> in sales/purchases transaction forms', () => {
  for (const file of MIGRATED_FORMS) {
    it(`${file} uses Vertex select components only`, () => {
      const src = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(src).not.toMatch(/NativeSelect/);
      expect(src).not.toMatch(/<select[\s>]/);
    });
  }
});

describe('every document line editor selects products through the one shared picker', () => {
  for (const file of [
    'src/features/sales/components/SalesLineItemsEditor.tsx',
    'src/features/purchases/components/LineItemsEditor.tsx',
  ]) {
    it(`${file} uses ProductCombobox`, () => {
      const src = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(src).toMatch(/ProductCombobox/);
    });
  }
});
