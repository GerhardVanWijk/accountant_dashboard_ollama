import { describe, it, expect } from 'vitest';
import { parseCSV } from './csvParser';

describe('parseCSV', () => {
  it('parses headers and rows', () => {
    const result = parseCSV('SKU,Name,Cost\nPEN-1,Blue Pen,1.50\nPEN-2,Red Pen,1.75');
    expect(result.headers).toEqual(['SKU', 'Name', 'Cost']);
    expect(result.rows).toEqual([
      ['PEN-1', 'Blue Pen', '1.50'],
      ['PEN-2', 'Red Pen', '1.75'],
    ]);
  });

  it('handles quoted fields containing commas and escaped quotes', () => {
    const result = parseCSV('Name,Description\n"Acme, Inc.","A ""great"" supplier"');
    expect(result.rows).toEqual([['Acme, Inc.', 'A "great" supplier']]);
  });

  it('skips blank lines', () => {
    const result = parseCSV('SKU,Name\nPEN-1,Blue Pen\n\n\nPEN-2,Red Pen\n');
    expect(result.rows).toHaveLength(2);
  });

  it('pads a short row with undefined rather than dropping it', () => {
    const result = parseCSV('SKU,Name,Cost\nPEN-1,Blue Pen');
    expect(result.rows).toEqual([['PEN-1', 'Blue Pen', undefined]]);
  });

  it('treats an empty cell as undefined, not an empty string', () => {
    const result = parseCSV('SKU,Name\nPEN-1,');
    expect(result.rows[0][1]).toBeUndefined();
  });

  it('returns empty headers/rows for an empty file', () => {
    expect(parseCSV('')).toEqual({ headers: [], rows: [] });
  });

  it('returns headers with no rows for a header-only file', () => {
    const result = parseCSV('SKU,Name');
    expect(result.headers).toEqual(['SKU', 'Name']);
    expect(result.rows).toEqual([]);
  });
});
