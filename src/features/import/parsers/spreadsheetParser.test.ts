import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWorkbookBytes } from './spreadsheetParser';

function buildWorkbookBytes(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return buffer as ArrayBuffer;
}

describe('parseWorkbookBytes', () => {
  it('lists every worksheet by name', () => {
    const bytes = buildWorkbookBytes({ Products: [['SKU'], ['A']], Categories: [['Name'], ['B']] });
    const workbook = parseWorkbookBytes(bytes, 'test.xlsx', 'xlsx');
    expect(workbook.worksheetNames).toEqual(['Products', 'Categories']);
    expect(workbook.format).toBe('xlsx');
  });

  it('reads headers and rows from a named sheet', () => {
    const bytes = buildWorkbookBytes({
      Sheet1: [
        ['SKU', 'Name', 'Cost'],
        ['PEN-1', 'Blue Pen', 1.5],
        ['PEN-2', 'Red Pen', 1.75],
      ],
    });
    const sheet = parseWorkbookBytes(bytes, 'test.xlsx', 'xlsx').getSheet('Sheet1');
    expect(sheet.headers).toEqual(['SKU', 'Name', 'Cost']);
    expect(sheet.rows).toEqual([
      ['PEN-1', 'Blue Pen', 1.5],
      ['PEN-2', 'Red Pen', 1.75],
    ]);
  });

  it('preserves a text-formatted SKU with leading zeroes as a string, not a number', () => {
    const bytes = buildWorkbookBytes({ Sheet1: [['SKU'], ['00042']] });
    const sheet = parseWorkbookBytes(bytes, 'test.xlsx', 'xlsx').getSheet('Sheet1');
    expect(sheet.rows[0][0]).toBe('00042');
    expect(typeof sheet.rows[0][0]).toBe('string');
  });

  it('drops fully blank rows', () => {
    const bytes = buildWorkbookBytes({ Sheet1: [['SKU'], ['A'], [undefined], ['B']] });
    const sheet = parseWorkbookBytes(bytes, 'test.xlsx', 'xlsx').getSheet('Sheet1');
    expect(sheet.rows).toEqual([['A'], ['B']]);
  });

  it('reads a real Date object for a date-formatted cell', () => {
    const bytes = buildWorkbookBytes({ Sheet1: [['Date'], [new Date(Date.UTC(2026, 7, 1))]] });
    const sheet = parseWorkbookBytes(bytes, 'test.xlsx', 'xlsx').getSheet('Sheet1');
    expect(sheet.rows[0][0]).toBeInstanceOf(Date);
  });

  it('returns an empty sheet for a worksheet name that does not exist', () => {
    const bytes = buildWorkbookBytes({ Sheet1: [['SKU'], ['A']] });
    const sheet = parseWorkbookBytes(bytes, 'test.xlsx', 'xlsx').getSheet('DoesNotExist');
    expect(sheet).toEqual({ headers: [], rows: [] });
  });
});
