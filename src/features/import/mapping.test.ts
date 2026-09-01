import { describe, it, expect } from 'vitest';
import type { ImportFieldDef } from './types';
import { suggestColumnMapping, hasAllRequiredMappings, mapRow } from './mapping';

const fields: ImportFieldDef[] = [
  { key: 'sku', label: 'SKU', required: true, type: 'string', aliases: ['Item Code', 'Product Code', 'Stock Code', 'Item Number'] },
  { key: 'name', label: 'Name', required: true, type: 'string', aliases: ['Product', 'Product Name', 'Item Description'] },
  { key: 'costPrice', label: 'Cost Price', type: 'number', aliases: ['Cost', 'Cost Ex VAT', 'Unit Cost'] },
];

describe('suggestColumnMapping', () => {
  it('matches an alias case/punctuation-insensitively', () => {
    const { mapping, confident } = suggestColumnMapping(['Item Number', 'Product Description', 'Cost Ex VAT'], fields);
    expect(mapping.sku).toBe(0);
    expect(confident.sku).toBe(true);
    expect(mapping.costPrice).toBe(2);
  });

  it('matches a field label directly', () => {
    const { mapping } = suggestColumnMapping(['SKU', 'Name'], fields);
    expect(mapping.sku).toBe(0);
    expect(mapping.name).toBe(1);
  });

  it('leaves a field unmapped rather than guessing at low confidence', () => {
    const { mapping, confident } = suggestColumnMapping(['Random Column'], fields);
    expect(mapping.sku).toBeUndefined();
    expect(confident.sku).toBe(false);
  });

  it('resolves a header matching two fields to the first field, left to right column order', () => {
    const { mapping } = suggestColumnMapping(['Cost', 'Item Code'], fields);
    expect(mapping.sku).toBe(1);
    expect(mapping.costPrice).toBe(0);
  });
});

describe('hasAllRequiredMappings', () => {
  it('is true only when every required field is mapped', () => {
    expect(hasAllRequiredMappings({ sku: 0, name: 1 }, fields)).toBe(true);
    expect(hasAllRequiredMappings({ sku: 0, name: undefined }, fields)).toBe(false);
    expect(hasAllRequiredMappings({}, fields)).toBe(false);
  });

  it('ignores whether optional fields are mapped', () => {
    expect(hasAllRequiredMappings({ sku: 0, name: 1, costPrice: undefined }, fields)).toBe(true);
  });
});

describe('mapRow', () => {
  it('applies a column mapping to one row', () => {
    const row = ['PEN-1', 'Blue Pen', '1.50'];
    const mapping = { sku: 0, name: 1, costPrice: 2 };
    expect(mapRow(row, mapping, fields)).toEqual({ sku: 'PEN-1', name: 'Blue Pen', costPrice: '1.50' });
  });

  it('leaves an unmapped field undefined', () => {
    const row = ['PEN-1', 'Blue Pen'];
    const mapping = { sku: 0, name: 1, costPrice: undefined };
    expect(mapRow(row, mapping, fields).costPrice).toBeUndefined();
  });
});
