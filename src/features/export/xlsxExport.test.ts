import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import type { ExportDataset } from './types';
import { buildWorkbook } from './xlsxExport';

interface Row {
  sku: string;
  qty: number;
  received: Date;
}

const rows: Row[] = [
  { sku: 'PEN-1', qty: 10, received: new Date(Date.UTC(2026, 7, 1)) },
  { sku: 'PEN-2', qty: 5, received: new Date(Date.UTC(2026, 7, 2)) },
];

function makeDataset(overrides: Partial<ExportDataset<Row>> = {}): ExportDataset<Row> {
  return {
    title: 'Inventory Stock on Hand',
    columns: [
      { key: 'sku', header: 'SKU', accessor: (r) => r.sku },
      { key: 'qty', header: 'Qty', accessor: (r) => r.qty, total: (rs) => rs.reduce((sum, r) => sum + r.qty, 0) },
      { key: 'received', header: 'Received', accessor: (r) => r.received },
    ],
    rows,
    filename: 'inventory-2026-09-01',
    ...overrides,
  };
}

describe('buildWorkbook', () => {
  it('creates a workbook with one sheet named after the dataset title', () => {
    const workbook = buildWorkbook(makeDataset());
    expect(workbook.SheetNames).toEqual(['Inventory Stock on Hand']);
  });

  it('truncates a sheet name to Excel\'s 31-character limit', () => {
    const workbook = buildWorkbook(makeDataset({ title: 'A'.repeat(50) }));
    expect(workbook.SheetNames[0]).toHaveLength(31);
  });

  it('honours an explicit sheet name override', () => {
    const workbook = buildWorkbook(makeDataset(), { sheetName: 'Custom' });
    expect(workbook.SheetNames).toEqual(['Custom']);
  });

  it('writes the header row', () => {
    const workbook = buildWorkbook(makeDataset());
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    expect(grid[0]).toEqual(['SKU', 'Qty', 'Received']);
  });

  it('writes a real numeric cell type, not text', () => {
    const workbook = buildWorkbook(makeDataset());
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    expect(sheet['B2'].t).toBe('n');
    expect(sheet['B2'].v).toBe(10);
  });

  it('writes a real date cell type', () => {
    const workbook = buildWorkbook(makeDataset());
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    expect(sheet['C2'].v).toBeInstanceOf(Date);
  });

  it('writes every data row (row count matches the dataset)', () => {
    const workbook = buildWorkbook(makeDataset());
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    expect(grid).toHaveLength(4); // header + 2 rows + totals row
  });

  it('appends a totals row when a column defines total()', () => {
    const workbook = buildWorkbook(makeDataset());
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    expect(grid[3]).toEqual(['Total', 15, '']);
  });

  it('never writes a formula cell', () => {
    const workbook = buildWorkbook(makeDataset());
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    for (const key of Object.keys(sheet)) {
      if (key.startsWith('!')) continue;
      expect(sheet[key].f).toBeUndefined();
    }
  });
});
