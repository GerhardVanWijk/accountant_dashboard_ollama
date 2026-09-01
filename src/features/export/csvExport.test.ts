import { describe, it, expect } from 'vitest';
import type { ExportDataset } from './types';
import { buildCSV } from './csvExport';

interface Row {
  sku: string;
  name: string;
  qty: number;
  cost: number | null;
  received: Date;
}

const rows: Row[] = [
  { sku: 'PEN-1', name: 'Blue Pen, 12pk', qty: 10, cost: 2.5, received: new Date(Date.UTC(2026, 7, 1)) },
  { sku: 'PEN-2', name: 'Red "Deluxe" Pen', qty: 5, cost: null, received: new Date(Date.UTC(2026, 7, 2)) },
];

function makeDataset(overrides: Partial<ExportDataset<Row>> = {}): ExportDataset<Row> {
  return {
    title: 'Inventory',
    columns: [
      { key: 'sku', header: 'SKU', accessor: (r) => r.sku },
      { key: 'name', header: 'Name', accessor: (r) => r.name },
      { key: 'qty', header: 'Qty', accessor: (r) => r.qty, total: (rs) => rs.reduce((sum, r) => sum + r.qty, 0) },
      { key: 'cost', header: 'Cost', accessor: (r) => r.cost },
      { key: 'received', header: 'Received', accessor: (r) => r.received },
    ],
    rows,
    filename: 'inventory-2026-09-01',
    ...overrides,
  };
}

describe('buildCSV', () => {
  it('produces a header row matching column order, never a table\'s render order', () => {
    const csv = buildCSV(makeDataset());
    expect(csv.split('\r\n')[0]).toBe('SKU,Name,Qty,Cost,Received');
  });

  it('quotes a field containing a comma', () => {
    const csv = buildCSV(makeDataset());
    expect(csv).toContain('"Blue Pen, 12pk"');
  });

  it('escapes an embedded quote by doubling it', () => {
    const csv = buildCSV(makeDataset());
    expect(csv).toContain('"Red ""Deluxe"" Pen"');
  });

  it('quotes a field containing a line break', () => {
    const csv = buildCSV(makeDataset({ rows: [{ ...rows[0], name: 'Line1\nLine2' }] }));
    expect(csv).toContain('"Line1\nLine2"');
  });

  it('exports numbers as bare values, not formatted currency strings', () => {
    const csv = buildCSV(makeDataset());
    expect(csv).toContain(',10,2.5,');
  });

  it('exports null/undefined as an empty cell', () => {
    const csv = buildCSV(makeDataset());
    const line = csv.split('\r\n')[2];
    expect(line).toBe('PEN-2,"Red ""Deluxe"" Pen",5,,2026-08-02');
  });

  it('formats a Date cell as a plain ISO date', () => {
    const csv = buildCSV(makeDataset());
    expect(csv).toContain('2026-08-01');
  });

  it('appends a totals row when any column defines total()', () => {
    const csv = buildCSV(makeDataset());
    const lines = csv.split('\r\n');
    expect(lines[lines.length - 1]).toBe('Total,,15,,');
  });

  it('omits the totals row when no column defines total()', () => {
    const dataset = makeDataset();
    dataset.columns = dataset.columns.map((c) => ({ ...c, total: undefined }));
    const csv = buildCSV(dataset);
    expect(csv.split('\r\n')).toHaveLength(3); // header + 2 rows
  });
});
