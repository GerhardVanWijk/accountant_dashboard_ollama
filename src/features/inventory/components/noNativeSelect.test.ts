import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guard for the Vertex dropdown migration: these transaction
 * forms must not reintroduce a native `<select>` / `<NativeSelect>`, whose
 * open option menu renders in the browser's own (light) chrome that
 * `<option>` cannot be themed past. Short enums use `EnumSelect`, searchable
 * lists use `SearchableSelect` / a `*Combobox` — all render a dark popup.
 */
const MIGRATED_FORMS = [
  'StockAdjustmentDocumentForm.tsx',
  'StockAdjustmentLinesEditor.tsx',
  'StockTransferDocumentForm.tsx',
  'StockTakeSetupForm.tsx',
  'SupplierReturnLinesEditor.tsx',
  'OpeningStockBatchDocumentForm.tsx',
  'OpeningStockLinesEditor.tsx',
  'CategoryForm.tsx',
  'ProductForm.tsx',
];

describe('no native <select> in migrated inventory transaction forms', () => {
  for (const file of MIGRATED_FORMS) {
    it(`${file} uses Vertex select components only`, () => {
      const path = resolve(process.cwd(), 'src/features/inventory/components', file);
      const src = readFileSync(path, 'utf8');
      expect(src).not.toMatch(/NativeSelect/);
      expect(src).not.toMatch(/<select[\s>]/);
    });
  }
});
